#!/usr/bin/env python3
"""
Shared utilities for the compliance analysis pipeline.

This module provides common functionality used across all three phases:
- Database connection and queries (Supabase)
- S3 PDF download
- PDF text extraction
- LLM/VLM calls with retry logic
- Checkpointing and progress tracking
"""

import os
import json
import time
import tempfile
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import boto3
from supabase import create_client, Client
import pdfplumber
from litellm import completion
import anthropic

# ============================================================================
# CONFIGURATION
# ============================================================================

SUPABASE_CONFIGS = {
    'dev': {
        'url': 'https://prafecmdqiwgnsumlmqn.supabase.co',
        'service_role_key': os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    },
    'prod': {
        'url': 'https://grosxzvvmhakkxybeuwu.supabase.co',
        'service_role_key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE1MTM4NiwiZXhwIjoyMDc0NzI3Mzg2fQ.tP_KLIRVNdAXAFQvaj-jA_woz4jwUU8hRfy521JFOdY'
    }
}

S3_BUCKET = 'set4-data'
S3_REGION = os.getenv('AWS_REGION', 'us-east-1')

# Model configuration with fallbacks
MODEL_FALLBACKS = [
    'gemini/gemini-2.5-flash-lite',  # Fastest, optimized for high throughput
    'gemini/gemini-2.0-flash-exp',   # Good fallback
    'gpt-4o-mini',                    # OpenAI fallback
    'claude-3-5-haiku-20241022'       # Anthropic fallback
]

# Rate limiting
MAX_RETRIES = 3
MIN_DELAY = 1.0  # seconds between API calls

# ============================================================================
# DATABASE UTILITIES
# ============================================================================

def get_supabase_client(env: str = 'prod') -> Client:
    """Create Supabase client for the specified environment."""
    config = SUPABASE_CONFIGS.get(env)
    if not config:
        raise ValueError(f"Unknown environment: {env}. Use 'dev' or 'prod'")

    print(f"[DB] Connecting to {env} Supabase: {config['url']}")
    return create_client(config['url'], config['service_role_key'])


def fetch_assessment_and_checks(
    supabase: Client,
    assessment_id: str,
    limit: Optional[int] = None
) -> Tuple[Dict, List[Dict]]:
    """
    Fetch assessment details and all associated checks.

    Returns:
        (assessment_data, checks_list)
    """
    print(f"[DB] Fetching assessment: {assessment_id}")

    # Get assessment with project info
    assessment_response = supabase.table('assessments').select(
        '*, project:projects(*)'
    ).eq('id', assessment_id).single().execute()

    assessment = assessment_response.data
    print(f"[DB] Assessment: {assessment['project']['name']}")

    # Get all checks for this assessment with section info
    # Supabase has a hard 1000-row limit, so we need to paginate
    checks = []
    batch_size = 1000
    offset = 0

    if limit:
        # If user specified a limit, just fetch that many
        query = supabase.table('checks').select(
            'id, section_id, code_section_number, code_section_title, element_group_id, section:sections(id, key, number, title)'
        ).eq('assessment_id', assessment_id).order('code_section_number').limit(limit)
        checks_response = query.execute()
        checks = checks_response.data
    else:
        # Otherwise, fetch all checks in batches
        while True:
            query = supabase.table('checks').select(
                'id, section_id, code_section_number, code_section_title, element_group_id, section:sections(id, key, number, title)'
            ).eq('assessment_id', assessment_id).order('code_section_number').range(offset, offset + batch_size - 1)

            batch_response = query.execute()
            batch = batch_response.data

            if not batch or len(batch) == 0:
                break

            checks.extend(batch)

            if len(batch) < batch_size:
                break

            offset += batch_size

    print(f"[DB] Found {len(checks)} checks{' (limited)' if limit else ''}")
    return assessment, checks


def fetch_section_context(supabase: Client, section_key: str) -> Dict:
    """
    Fetch full section context including main section, parents, and references.

    Returns dict with:
        - main_section: The primary section
        - parent_sections: List of parent sections
        - referenced_sections: List of referenced sections
    """
    # Get main section
    main_response = supabase.table('sections').select('*').eq('key', section_key).single().execute()
    main_section = main_response.data

    context = {
        'main_section': main_section,
        'parent_sections': [],
        'referenced_sections': []
    }

    # Get parent sections
    current_key = main_section.get('parent_key')
    while current_key:
        parent_response = supabase.table('sections').select('*').eq('key', current_key).execute()
        if parent_response.data:
            parent = parent_response.data[0]
            context['parent_sections'].append(parent)
            current_key = parent.get('parent_key')
        else:
            break

    # Get referenced sections
    references = main_section.get('references', [])
    if references:
        ref_response = supabase.table('sections').select('*').in_('key', references).execute()
        context['referenced_sections'] = ref_response.data

    return context


def insert_analysis_result(
    supabase: Client,
    check_id: str,
    ai_response: Dict,
    execution_time_ms: int,
    model: str,
    screenshot_ids: Optional[List[str]] = None
) -> Dict:
    """
    Insert analysis result into analysis_runs table.

    Args:
        check_id: UUID of the check
        ai_response: Parsed AI response dict
        execution_time_ms: How long the analysis took
        model: Model identifier (e.g., 'gemini/gemini-2.0-flash-exp')
        screenshot_ids: Optional list of screenshot IDs used

    Returns:
        Inserted record
    """
    # Get next run number
    response = supabase.table('analysis_runs').select('run_number').eq(
        'check_id', check_id
    ).order('run_number', desc=True).limit(1).execute()

    next_run = (response.data[0]['run_number'] + 1) if response.data else 1

    # Parse model string
    ai_provider = model.split('/')[0] if '/' in model else 'openai'

    # Prepare insert data
    insert_data = {
        'check_id': check_id,
        'run_number': next_run,
        'compliance_status': ai_response.get('compliance_status'),
        'confidence': ai_response.get('confidence'),
        'ai_provider': ai_provider,
        'ai_model': model,
        'ai_reasoning': ai_response.get('reasoning'),
        'violations': ai_response.get('violations'),
        'compliant_aspects': ai_response.get('compliant_aspects'),
        'recommendations': ai_response.get('recommendations'),
        'section_results': ai_response.get('section_results'),
        'raw_ai_response': json.dumps(ai_response),
        'execution_time_ms': execution_time_ms
    }

    if screenshot_ids:
        insert_data['screenshot_ids'] = screenshot_ids

    result = supabase.table('analysis_runs').insert(insert_data).execute()
    return result.data[0]


# ============================================================================
# S3 & PDF UTILITIES
# ============================================================================

def download_pdf_from_s3(s3_key: str, local_path: str) -> str:
    """
    Download PDF from S3 to local file.

    Args:
        s3_key: S3 object key (e.g., 'drawings/project-id/file.pdf')
        local_path: Where to save the file locally

    Returns:
        Local file path
    """
    print(f"[S3] Downloading: s3://{S3_BUCKET}/{s3_key}")

    s3 = boto3.client('s3', region_name=S3_REGION)
    s3.download_file(S3_BUCKET, s3_key, local_path)

    print(f"[S3] Downloaded to: {local_path}")
    return local_path


def extract_text_from_pdf(pdf_path: str) -> Tuple[str, Dict[int, str]]:
    """
    Extract all text from PDF, both as full document and page-by-page.

    Returns:
        (full_text, page_texts_dict)
        where page_texts_dict = {page_num: text}
    """
    print(f"[PDF] Extracting text from: {pdf_path}")

    full_text_parts = []
    page_texts = {}

    with pdfplumber.open(pdf_path) as pdf:
        num_pages = len(pdf.pages)
        print(f"[PDF] Processing {num_pages} pages...")

        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            page_texts[i] = text
            full_text_parts.append(f"--- Page {i} ---\n{text}\n")

    full_text = "\n".join(full_text_parts)
    print(f"[PDF] Extracted {len(full_text)} characters from {num_pages} pages")

    return full_text, page_texts


# ============================================================================
# LLM UTILITIES
# ============================================================================

def call_llm_with_retry(
    messages: List[Dict],
    model: Optional[str] = None,
    max_retries: int = MAX_RETRIES,
    response_format: Optional[Dict] = None
) -> Dict:
    """
    Call LLM with automatic retry and model fallback.

    Args:
        messages: List of message dicts [{"role": "user", "content": "..."}]
        model: Model to use (defaults to first in MODEL_FALLBACKS)
        max_retries: Max retries per model
        response_format: Optional response format (e.g., {"type": "json_object"})

    Returns:
        Parsed JSON response
    """
    # Always include fallbacks - put requested model first, then add others
    if model and model not in MODEL_FALLBACKS:
        # Custom model not in fallback list - try it first, then fallbacks
        models_to_try = [model] + MODEL_FALLBACKS
    elif model:
        # Requested model is in fallback list - reorder to try it first
        models_to_try = [model] + [m for m in MODEL_FALLBACKS if m != model]
    else:
        # No model specified - use default fallback order
        models_to_try = MODEL_FALLBACKS

    for model_name in models_to_try:
        print(f"[LLM] Trying model: {model_name}")

        # Check if this is a Claude model - use Anthropic SDK directly
        if 'claude' in model_name.lower():
            for attempt in range(max_retries):
                try:
                    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

                    response = client.messages.create(
                        model=model_name,
                        max_tokens=8192,
                        temperature=0.1,
                        messages=messages
                    )

                    content = response.content[0].text

                    # Strip markdown code blocks if present
                    if content.strip().startswith('```'):
                        lines = content.strip().split('\n')
                        lines = lines[1:]
                        if lines and lines[-1].strip() == '```':
                            lines = lines[:-1]
                        content = '\n'.join(lines)

                    # Parse JSON response
                    result = json.loads(content)
                    print(f"[LLM] Success with {model_name} (Anthropic SDK)")
                    return result

                except Exception as e:
                    error_msg = str(e).lower()

                    # Rate limit - wait and retry
                    if 'rate limit' in error_msg or '429' in error_msg or 'overloaded' in error_msg:
                        wait_time = (2 ** attempt) * MIN_DELAY
                        print(f"[LLM] Rate limited, waiting {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        continue

                    # Other errors - try next model
                    print(f"[LLM] Error with {model_name}: {e}")
                    break

        else:
            # Use litellm for non-Claude models
            for attempt in range(max_retries):
                try:
                    kwargs = {
                        'model': model_name,
                        'messages': messages,
                        'temperature': 0.1
                    }

                    if response_format:
                        kwargs['response_format'] = response_format

                    response = completion(**kwargs)
                    content = response.choices[0].message.content

                    # Strip markdown code blocks if present (Gemini sometimes wraps JSON in ```json ... ```)
                    if content.strip().startswith('```'):
                        # Extract content between code fences
                        lines = content.strip().split('\n')
                        # Remove first line (```json or ```)
                        lines = lines[1:]
                        # Remove last line (```)
                        if lines and lines[-1].strip() == '```':
                            lines = lines[:-1]
                        content = '\n'.join(lines)

                    # Parse JSON response
                    result = json.loads(content)
                    print(f"[LLM] Success with {model_name}")
                    return result

                except Exception as e:
                    error_msg = str(e).lower()

                    # Rate limit - wait and retry
                    if 'rate limit' in error_msg or '429' in error_msg:
                        wait_time = (2 ** attempt) * MIN_DELAY
                        print(f"[LLM] Rate limited, waiting {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        continue

                    # Other errors - try next model
                    print(f"[LLM] Error with {model_name}: {e}")
                    break

        # Rate limit backoff between models
        time.sleep(MIN_DELAY)

    raise RuntimeError(f"All models failed after {max_retries} retries")


# ============================================================================
# PROMPT BUILDING
# ============================================================================

def build_text_analysis_prompt(
    section_context: Dict,
    pdf_text: str,
    project_variables: Optional[Dict] = None
) -> str:
    """
    Build prompt for text-only compliance analysis.

    Args:
        section_context: Dict from fetch_section_context()
        pdf_text: Extracted PDF text
        project_variables: Optional project-specific context

    Returns:
        Formatted prompt string
    """
    main = section_context['main_section']
    parents = section_context['parent_sections']
    references = section_context['referenced_sections']

    prompt_parts = [
        "You are a building code compliance expert. Analyze whether the project complies with the code section below.",
        "",
        f"**CODE SECTION {main['number']}: {main['title']}**",
        main['text'],
        ""
    ]

    # Add parent context
    if parents:
        prompt_parts.append("**PARENT SECTIONS (for context):**")
        for parent in reversed(parents):  # Top-down order
            prompt_parts.append(f"- {parent['number']}: {parent['title']}")
        prompt_parts.append("")

    # Add references
    if references:
        prompt_parts.append("**REFERENCED SECTIONS:**")
        for ref in references:
            prompt_parts.append(f"- {ref['number']}: {ref['title']}")
            prompt_parts.append(f"  {ref['text'][:200]}...")
        prompt_parts.append("")

    # Add project variables
    if project_variables:
        prompt_parts.append("**PROJECT CONTEXT:**")
        for key, value in project_variables.items():
            prompt_parts.append(f"- {key}: {value}")
        prompt_parts.append("")

    # Add PDF text (truncated to save tokens)
    max_text_length = 50000
    truncated_text = pdf_text[:max_text_length]
    if len(pdf_text) > max_text_length:
        truncated_text += "\n\n[... text truncated ...]"

    prompt_parts.extend([
        "**ARCHITECTURAL DRAWINGS (TEXT EXTRACTED):**",
        truncated_text,
        "",
        "**TASK:**",
        "Analyze the project for compliance with the code section above.",
        "",
        "Respond with JSON:",
        "{",
        '  "compliance_status": "compliant|non-compliant|unclear|not-applicable",',
        '  "confidence": "high|medium|low",',
        '  "reasoning": "Brief explanation",',
        '  "violations": [{"severity": "major|minor", "description": "...", "location": "..."}],',
        '  "needs_visual_inspection": true|false',
        "}",
        "",
        "IMPORTANT:",
        "- If the section requires visual inspection (dimensions, layouts, clearances) and text is insufficient, set compliance_status='unclear' and needs_visual_inspection=true",
        "- If the section clearly does not apply to this project type, set compliance_status='not-applicable'",
        "- Only mark 'compliant' or 'non-compliant' if you can determine this from text alone with high confidence"
    ])

    return "\n".join(prompt_parts)


# ============================================================================
# PROGRESS & CHECKPOINTING
# ============================================================================

def save_checkpoint(data: Any, checkpoint_path: str):
    """Save progress checkpoint as JSON."""
    with open(checkpoint_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"[CHECKPOINT] Saved to: {checkpoint_path}")


def load_checkpoint(checkpoint_path: str) -> Optional[Any]:
    """Load progress checkpoint if it exists."""
    if os.path.exists(checkpoint_path):
        with open(checkpoint_path, 'r') as f:
            data = json.load(f)
        print(f"[CHECKPOINT] Loaded from: {checkpoint_path}")
        return data
    return None


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"


# ============================================================================
# MAIN (for testing)
# ============================================================================

if __name__ == '__main__':
    print("Shared utilities module loaded.")
    print(f"Available models: {MODEL_FALLBACKS}")
    print(f"S3 bucket: {S3_BUCKET}")
    print(f"Available environments: {list(SUPABASE_CONFIGS.keys())}")
