#!/usr/bin/env python3
"""
Text-based compliance analysis for building code assessments.

Downloads PDF, extracts all text, then runs LLM analysis on each check
using the extracted text plus relevant code section context.

Usage:
    # Full run (will process all checks)
    python scripts/text_based_compliance_analysis.py \
        --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
        --env prod

    # Test with first 10 checks
    python scripts/text_based_compliance_analysis.py \
        --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
        --env prod \
        --limit 10

    # Resume from checkpoint
    python scripts/text_based_compliance_analysis.py \
        --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
        --env prod \
        --resume

    # Custom model and concurrency
    python scripts/text_based_compliance_analysis.py \
        --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
        --env prod \
        --model gemini/gemini-2.0-flash-exp \
        --concurrency 5
"""

import json
import argparse
import asyncio
import time
import os
import re
import random
from datetime import timedelta
from typing import Dict, List, Optional
from pathlib import Path

# Third-party imports (install with: pip install supabase pdfplumber litellm boto3)
from supabase import create_client, Client
import pdfplumber
import boto3
from litellm import acompletion, RateLimitError

# ---------------------------
# Configuration
# ---------------------------

# Supabase configurations
SUPABASE_CONFIGS = {
    'dev': {
        'url': 'https://prafecmdqiwgnsumlmqn.supabase.co',
        'service_role_key': os.getenv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByYWZlY21kcWl3Z25zdW1sbXFuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ3NDczMiwiZXhwIjoyMDc3MDUwNzMyfQ.1xWUmYU4jr7aavSY62pGyLkUUh1tMBTgqoIXN5QNOn0')
    },
    'prod': {
        'url': 'https://grosxzvvmhakkxybeuwu.supabase.co',
        'service_role_key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE1MTM4NiwiZXhwIjoyMDc0NzI3Mzg2fQ.tP_KLIRVNdAXAFQvaj-jA_woz4jwUU8hRfy521JFOdY'
    }
}

# Model fallbacks for rate limiting
MODEL_FALLBACKS = [
    'gemini/gemini-2.0-flash-exp',
    'gpt-4o-mini',
    'claude-3-5-haiku-20241022',
]

# ---------------------------
# Utility Functions
# ---------------------------

def format_duration(seconds):
    """Format seconds into human-readable duration."""
    return str(timedelta(seconds=int(seconds)))

def save_checkpoint(results: List[Dict], assessment_id: str):
    """Save progress checkpoint."""
    checkpoint_file = f"scripts/analysis_checkpoint_{assessment_id}.json"
    with open(checkpoint_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"  💾 Checkpoint saved: {len(results)} completed")

def load_checkpoint(assessment_id: str) -> List[Dict]:
    """Load progress checkpoint."""
    checkpoint_file = f"scripts/analysis_checkpoint_{assessment_id}.json"
    try:
        with open(checkpoint_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

# ---------------------------
# S3 and PDF Functions
# ---------------------------

def download_pdf_from_s3(pdf_url: str, local_path: str) -> str:
    """Download PDF from S3 URL to local path."""
    print(f"Downloading PDF from S3...")
    print(f"  URL: {pdf_url}")

    # Parse S3 URL
    # Format: https://bucket-name.s3.region.amazonaws.com/key
    match = re.match(r'https://([^.]+)\.s3\.([^.]+)\.amazonaws\.com/(.+)', pdf_url)
    if not match:
        raise ValueError(f"Invalid S3 URL format: {pdf_url}")

    bucket_name, region, key = match.groups()

    # Create S3 client
    s3 = boto3.client('s3', region_name=region)

    # Download file
    s3.download_file(bucket_name, key, local_path)
    print(f"  ✓ Downloaded to: {local_path}")

    return local_path

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract all text from PDF using pdfplumber."""
    print(f"\nExtracting text from PDF...")

    all_text = []
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        print(f"  Total pages: {total_pages}")

        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text:
                all_text.append(f"\n--- PAGE {i} ---\n{text}")

            if i % 10 == 0:
                print(f"  Processed {i}/{total_pages} pages...")

    full_text = '\n'.join(all_text)
    print(f"  ✓ Extracted {len(full_text):,} characters from {total_pages} pages")

    return full_text

# ---------------------------
# Database Functions
# ---------------------------

def get_supabase_client(env: str) -> Client:
    """Get Supabase client for specified environment."""
    config = SUPABASE_CONFIGS.get(env)
    if not config:
        raise ValueError(f"Invalid environment: {env}. Must be 'dev' or 'prod'")

    return create_client(config['url'], config['service_role_key'])

def fetch_assessment_and_checks(supabase: Client, assessment_id: str) -> Dict:
    """Fetch assessment details and all checks."""
    print(f"\nFetching assessment and checks...")

    # Get assessment and project
    response = supabase.table('assessments').select('''
        id,
        project_id,
        projects (
            id,
            name,
            pdf_url
        )
    ''').eq('id', assessment_id).execute()

    if not response.data:
        raise ValueError(f"Assessment not found: {assessment_id}")

    assessment = response.data[0]

    # Get all checks
    checks_response = supabase.table('checks').select('''
        id,
        code_section_number,
        code_section_title,
        section_id,
        element_group_id,
        is_excluded,
        manual_status
    ''').eq('assessment_id', assessment_id).eq('is_excluded', False).execute()

    checks = checks_response.data
    print(f"  ✓ Found {len(checks)} checks (excluding excluded ones)")

    return {
        'assessment': assessment,
        'project': assessment['projects'],
        'checks': checks
    }

def fetch_section_context(supabase: Client, section_id: str) -> Dict:
    """
    Fetch section with its references and parent sections.

    Returns comprehensive context including:
    - Main section (number, title, text)
    - Referenced sections (sections mentioned in the text)
    - Parent sections (hierarchical parents based on section numbering)
    """
    # Get main section
    section_response = supabase.table('sections').select('*').eq('id', section_id).execute()
    if not section_response.data:
        return None

    section = section_response.data[0]

    # Get parent sections based on section number
    # e.g., for 11B-404.2.6, get 11B-404.2 and 11B-404
    parents = []
    section_number = section['number']
    if section_number:
        parts = section_number.split('.')
        for i in range(1, len(parts)):
            parent_number = '.'.join(parts[:len(parts) - i])
            parent_response = supabase.table('sections').select('*').eq('number', parent_number).execute()
            if parent_response.data:
                parents.append(parent_response.data[0])

    # Get referenced sections (parse section references from text)
    # Look for patterns like "11B-XXX.X.X" or "11A-XXX.X.X"
    referenced_sections = []
    if section.get('text'):
        # Find section references in text
        ref_pattern = r'\b(11[AB]-\d{3,4}(?:\.\d+)*)\b'
        matches = re.findall(ref_pattern, section['text'])

        if matches:
            # Remove duplicates and get sections
            unique_refs = list(set(matches))[:10]  # Limit to 10 most common
            for ref_number in unique_refs:
                ref_response = supabase.table('sections').select('*').eq('number', ref_number).execute()
                if ref_response.data:
                    referenced_sections.append(ref_response.data[0])

    return {
        'main_section': section,
        'parent_sections': parents,
        'referenced_sections': referenced_sections
    }

def get_next_run_number(supabase: Client, check_id: str) -> int:
    """Get the next run number for a check."""
    response = supabase.table('analysis_runs').select('run_number').eq('check_id', check_id).order('run_number', desc=True).limit(1).execute()

    if response.data:
        return response.data[0]['run_number'] + 1
    return 1

def insert_analysis_result(supabase: Client, check_id: str, ai_response: Dict, execution_time_ms: int, model: str) -> Dict:
    """Insert analysis result into analysis_runs table."""
    run_number = get_next_run_number(supabase, check_id)

    result = supabase.table('analysis_runs').insert({
        'check_id': check_id,
        'run_number': run_number,
        'compliance_status': ai_response.get('compliance_status'),
        'confidence': ai_response.get('confidence'),
        'ai_provider': model.split('/')[0] if '/' in model else 'openai',
        'ai_model': model,
        'ai_reasoning': ai_response.get('reasoning'),
        'violations': ai_response.get('violations'),
        'compliant_aspects': ai_response.get('compliant_aspects'),
        'recommendations': ai_response.get('recommendations'),
        'raw_ai_response': json.dumps(ai_response),
        'execution_time_ms': execution_time_ms
    }).execute()

    return result.data[0]

# ---------------------------
# LLM Analysis Functions
# ---------------------------

async def call_llm_with_retry(model: str, messages: List[Dict], max_retries: int = 5) -> Dict:
    """Call LLM with exponential backoff retry and model fallback."""
    models_to_try = [model] + [m for m in MODEL_FALLBACKS if m != model]

    for model_index, current_model in enumerate(models_to_try):
        retries = 0
        base_delay = 1.0

        while retries < max_retries:
            try:
                response = await acompletion(
                    model=current_model,
                    messages=messages,
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )

                # Success! Log if we used a fallback
                if model_index > 0:
                    print(f"      → Used fallback model: {current_model}")

                return response

            except RateLimitError as e:
                retries += 1
                delay = base_delay * (2 ** retries) + random.uniform(0, 1)

                if retries < max_retries:
                    print(f"      ⚠ Rate limit, retry {retries}/{max_retries} in {delay:.1f}s")
                    await asyncio.sleep(delay)
                else:
                    if model_index < len(models_to_try) - 1:
                        print(f"      ⚠ Retries exhausted, trying fallback...")
                        break
                    else:
                        print(f"      ✗ All models exhausted")
                        raise e

            except Exception as e:
                print(f"      ✗ Error with {current_model}: {e}")
                raise e

    raise Exception("All retry attempts and fallback models failed")

def build_compliance_prompt(pdf_text: str, section_context: Dict, check: Dict) -> str:
    """Build the compliance analysis prompt."""
    main_section = section_context['main_section']
    parents = section_context['parent_sections']
    references = section_context['referenced_sections']

    # Build section context
    sections_text = f"""
MAIN SECTION:
Section {main_section['number']}: {main_section['title']}
{main_section.get('text', 'No text available')}
"""

    # Add parent sections for context
    if parents:
        sections_text += "\n\nPARENT SECTIONS (for context):\n"
        for parent in parents:
            sections_text += f"\nSection {parent['number']}: {parent['title']}\n"
            sections_text += f"{parent.get('text', 'No text available')[:500]}...\n"

    # Add referenced sections
    if references:
        sections_text += "\n\nREFERENCED SECTIONS:\n"
        for ref in references:
            sections_text += f"\nSection {ref['number']}: {ref['title']}\n"
            sections_text += f"{ref.get('text', 'No text available')[:500]}...\n"

    # Truncate PDF text if too long (keep first 50k chars)
    truncated_pdf_text = pdf_text[:50000]
    if len(pdf_text) > 50000:
        truncated_pdf_text += "\n\n[... PDF text truncated for length ...]"

    prompt = f"""You are a building code compliance expert. Analyze whether the project complies with the code sections below based on the architectural plan text.

ARCHITECTURAL PLAN TEXT:
{truncated_pdf_text}

CODE SECTIONS TO ASSESS:
{sections_text}

Carefully review the plan text and determine:
1. Is there sufficient information in the plan text to assess compliance?
2. If yes, does the project comply with the code section(s)?
3. What is your confidence level?
4. What specific violations exist (if non-compliant)?

Return JSON with this structure:
{{
  "compliance_status": "compliant" | "non-compliant" | "unclear",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Detailed explanation of your assessment (2-4 sentences)",
  "violations": [
    {{
      "severity": "major" | "minor",
      "description": "Specific violation description",
      "location": "Where in the plans (if identifiable)",
      "recommendation": "How to fix this issue"
    }}
  ],
  "compliant_aspects": [
    "List of things that are compliant (if any)"
  ],
  "recommendations": [
    "Suggestions for improvement or clarification"
  ]
}}

IMPORTANT:
- Use "unclear" if the plan text lacks sufficient detail to make a determination
- Use "low" confidence if you're basing the assessment on limited information
- Be specific about violations and recommendations
- Consider that architectural plans often lack textual detail - most info is visual
"""

    return prompt

async def analyze_check(
    check: Dict,
    section_context: Dict,
    pdf_text: str,
    model: str,
    supabase: Client,
    semaphore: asyncio.Semaphore
) -> Optional[Dict]:
    """Analyze a single check."""
    async with semaphore:
        check_start = time.time()

        try:
            # Build prompt
            prompt = build_compliance_prompt(pdf_text, section_context, check)

            # Call LLM
            response = await call_llm_with_retry(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a building code compliance expert analyzing architectural plans."},
                    {"role": "user", "content": prompt}
                ]
            )

            # Parse response
            ai_response = json.loads(response.choices[0].message.content)

            # Calculate execution time
            execution_time_ms = int((time.time() - check_start) * 1000)

            # Insert into database
            result = insert_analysis_result(
                supabase=supabase,
                check_id=check['id'],
                ai_response=ai_response,
                execution_time_ms=execution_time_ms,
                model=model
            )

            duration = time.time() - check_start
            status = ai_response.get('compliance_status', 'unknown')
            confidence = ai_response.get('confidence', 'unknown')

            print(f"    ✓ {check['code_section_number']} - {status} ({confidence}) - {duration:.1f}s")

            return {
                'check_id': check['id'],
                'section_number': check['code_section_number'],
                'result': ai_response,
                'execution_time_ms': execution_time_ms
            }

        except Exception as e:
            print(f"    ✗ {check['code_section_number']} - ERROR: {e}")
            return None

# ---------------------------
# Main Processing Logic
# ---------------------------

async def process_assessment(args):
    """Main processing function."""
    print(f"\n{'='*80}")
    print(f"TEXT-BASED COMPLIANCE ANALYSIS")
    print(f"{'='*80}")
    print(f"Assessment ID: {args.assessment_id}")
    print(f"Environment: {args.env}")
    print(f"Model: {args.model}")
    print(f"Concurrency: {args.concurrency}")
    print(f"{'='*80}\n")

    # Initialize Supabase client
    supabase = get_supabase_client(args.env)

    # Fetch assessment and checks
    data = fetch_assessment_and_checks(supabase, args.assessment_id)
    project = data['project']
    checks = data['checks']

    print(f"Project: {project['name']}")
    print(f"Total checks: {len(checks)}")

    # Apply limit if specified
    if args.limit:
        checks = checks[:args.limit]
        print(f"Limited to first {args.limit} checks")

    # Load checkpoint if resuming
    completed_check_ids = set()
    if args.resume:
        checkpoint = load_checkpoint(args.assessment_id)
        completed_check_ids = {r['check_id'] for r in checkpoint if r}
        print(f"Resuming: {len(completed_check_ids)} already completed")
        checks = [c for c in checks if c['id'] not in completed_check_ids]
        print(f"Remaining: {len(checks)} checks")

    if not checks:
        print("\n✓ All checks already completed!")
        return

    # Download and extract PDF text
    pdf_url = project['pdf_url']
    pdf_local_path = f"scripts/temp_pdf_{args.assessment_id}.pdf"

    if not os.path.exists(pdf_local_path):
        download_pdf_from_s3(pdf_url, pdf_local_path)
    else:
        print(f"\nUsing existing PDF: {pdf_local_path}")

    pdf_text = extract_text_from_pdf(pdf_local_path)

    # Save extracted text for reference
    text_output_path = f"scripts/extracted_text_{args.assessment_id}.txt"
    with open(text_output_path, 'w') as f:
        f.write(pdf_text)
    print(f"  ✓ Saved extracted text to: {text_output_path}")

    # Process checks
    print(f"\n{'='*80}")
    print(f"PROCESSING {len(checks)} CHECKS")
    print(f"{'='*80}\n")

    semaphore = asyncio.Semaphore(args.concurrency)
    results = []
    start_time = time.time()

    for i, check in enumerate(checks, 1):
        print(f"  [{i}/{len(checks)}] {check['code_section_number']} - {check['code_section_title']}")

        # Fetch section context
        section_context = fetch_section_context(supabase, check['section_id'])

        if not section_context:
            print(f"    ⚠ Section not found, skipping")
            continue

        # Analyze check
        result = await analyze_check(
            check=check,
            section_context=section_context,
            pdf_text=pdf_text,
            model=args.model,
            supabase=supabase,
            semaphore=semaphore
        )

        if result:
            results.append(result)

        # Save checkpoint every 10 checks
        if i % 10 == 0:
            save_checkpoint(results, args.assessment_id)

    # Final results
    duration = time.time() - start_time

    print(f"\n{'='*80}")
    print(f"ANALYSIS COMPLETE")
    print(f"{'='*80}")
    print(f"Total checks processed: {len(results)}")
    print(f"Duration: {format_duration(duration)}")
    print(f"Average time per check: {duration/len(results):.1f}s")

    # Summary stats
    statuses = {}
    for r in results:
        status = r['result'].get('compliance_status', 'unknown')
        statuses[status] = statuses.get(status, 0) + 1

    print(f"\nCompliance Status Breakdown:")
    for status, count in statuses.items():
        print(f"  {status}: {count} ({count/len(results)*100:.1f}%)")

    print(f"\n✓ Results saved to database (analysis_runs table)")
    print(f"✓ View in app: https://service-set4.vercel.app/assessments/{args.assessment_id}")
    print(f"{'='*80}\n")

    # Clean up checkpoint
    checkpoint_file = f"scripts/analysis_checkpoint_{args.assessment_id}.json"
    if os.path.exists(checkpoint_file):
        os.remove(checkpoint_file)

# ---------------------------
# CLI Entry Point
# ---------------------------

def main():
    parser = argparse.ArgumentParser(description='Text-based compliance analysis for assessments')
    parser.add_argument('--assessment-id', type=str, required=True, help='Assessment UUID')
    parser.add_argument('--env', type=str, choices=['dev', 'prod'], default='prod', help='Environment (dev or prod)')
    parser.add_argument('--model', type=str, default='gemini/gemini-2.0-flash-exp', help='LLM model to use')
    parser.add_argument('--concurrency', type=int, default=3, help='Number of concurrent requests')
    parser.add_argument('--limit', type=int, help='Limit number of checks to process (for testing)')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')

    args = parser.parse_args()

    # Run async main
    asyncio.run(process_assessment(args))

if __name__ == '__main__':
    main()
