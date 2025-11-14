#!/usr/bin/env python3
"""
Two-phase LLM processing for building code sections.

Phase 1: Fast filter with lightweight model (YES/NO - needs consultation?)
Phase 2: Detailed question generation with stronger model (only for YES sections)

Usage:
    # Run both phases
    python scripts/process_sections_with_llm.py --input sections_with_references.json

    # Run only phase 1 (filter)
    python scripts/process_sections_with_llm.py --input sections.json --phase 1

    # Run only phase 2 (questions) - requires phase 1 output
    python scripts/process_sections_with_llm.py --input phase1_results.json --phase 2

    # Custom models
    python scripts/process_sections_with_llm.py --input sections.json --filter-model gpt-4o-mini --question-model gpt-4o
"""

import json
import argparse
import time
import asyncio
import random
from datetime import timedelta
from litellm import acompletion, RateLimitError

# ---------------------------
# Project Context
# ---------------------------

PROJECT_CONTEXT = """
Project Type: Storage facility
Size: 20,000 square feet
Location: Sacramento, California
"""

# ---------------------------
# Model Fallbacks
# ---------------------------

# Fallback models for when rate limits hit
FILTER_MODEL_FALLBACKS = [
    'gpt-4o-mini',
    'gemini/gemini-2.0-flash-exp',
    'claude-3-5-haiku-20241022',
    'gpt-3.5-turbo'
]

QUESTION_MODEL_FALLBACKS = [
    'gpt-4o',
    'gemini/gemini-2.0-flash-thinking-exp-01-21',
    'claude-opus-4-20250514',
    'gpt-4o-mini'
]

# ---------------------------
# Retry Logic
# ---------------------------

async def call_llm_with_retry(model, messages, temperature, max_retries=5, fallback_models=None):
    """
    Call LLM with exponential backoff retry and model fallback.

    If rate limit hit:
    1. Retry with exponential backoff
    2. If retries exhausted, try fallback models
    """
    models_to_try = [model]
    if fallback_models:
        models_to_try.extend(fallback_models)

    for model_index, current_model in enumerate(models_to_try):
        retries = 0
        base_delay = 1.0

        while retries < max_retries:
            try:
                response = await acompletion(
                    model=current_model,
                    messages=messages,
                    temperature=temperature,
                    response_format={"type": "json_object"}
                )

                # Success! Log if we used a fallback
                if model_index > 0:
                    print(f"    → Used fallback model: {current_model}")

                return response

            except RateLimitError as e:
                retries += 1

                # Calculate exponential backoff with jitter
                delay = base_delay * (2 ** retries) + random.uniform(0, 1)

                if retries < max_retries:
                    print(f"    ⚠ Rate limit hit for {current_model}, retry {retries}/{max_retries} in {delay:.1f}s")
                    await asyncio.sleep(delay)
                else:
                    # Retries exhausted for this model
                    if model_index < len(models_to_try) - 1:
                        print(f"    ⚠ Rate limit retries exhausted for {current_model}, trying fallback...")
                        break  # Try next model
                    else:
                        # No more fallbacks
                        print(f"    ✗ All models exhausted, giving up")
                        raise e

            except Exception as e:
                # Non-rate-limit error, don't retry
                print(f"    ✗ Error with {current_model}: {e}")
                raise e

    raise Exception("All retry attempts and fallback models failed")

# ---------------------------
# Phase 1: Filter Prompt
# ---------------------------

def build_filter_prompt(section_data):
    """
    Build the YES/NO filter prompt.
    Look for ambiguous language or explicit city requirements.
    """
    section = section_data['section_data']

    prompt = f"""Does this California Building Code section require consultation with Sacramento Building Department?

Section {section_data['section_number']}: {section_data['section_title']}
{section_data['section_text'][:300]}{"..." if len(section_data['section_text']) > 300 else ""}

ONLY flag as needs_consultation=true if:
- Section explicitly says "as approved by building official" or "as determined by authority having jurisdiction"
- Contains undefined terms that could be interpreted multiple ways (e.g., "sufficient", "adequate", "reasonable" without specific criteria)
- References local amendments or Sacramento-specific policies
- Has missing dimensional specifications that require city input

DO NOT flag if:
- Section has clear, specific requirements with exact dimensions/specifications
- Language like "where applicable", "when required", "as appropriate" refers to other code sections
- Section is just defining terms or referencing other sections
- Requirements are standard and don't need local interpretation

95% of sections should be NO. Only flag truly ambiguous sections.

Return JSON:
{{
  "needs_consultation": true|false,
  "reason": "brief explanation"
}}"""

    return prompt

# ---------------------------
# Phase 2: Question Generation Prompt
# ---------------------------

def build_questions_prompt(section_data):
    """
    Build detailed question generation prompt.
    Only called for sections flagged in Phase 1.
    """
    section = section_data['section_data']
    references = section['section_references']

    # Build references section
    references_text = ""
    if references:
        references_text = "\n\nREFERENCED SECTIONS:\n"
        for ref in references:
            target = ref['target_section']
            citation = ref.get('citation_text', '')
            references_text += f"\n- {target['number']}: {target['title']}"
            if citation:
                references_text += f" (Citation: {citation})"

    prompt = f"""Generate specific questions to ask Sacramento Building Department about this code section.

Project: 20,000 sqft storage facility in Sacramento, CA

Section {section_data['section_number']}: {section_data['section_title']}
{section_data['section_text']}
{references_text}

Generate:
1. Specific questions to ask the building department
2. Severity level (how critical is this clarification?)
3. Context/reasoning for why we need clarification

Return JSON:
{{
  "questions": ["specific question 1", "specific question 2", ...],
  "severity": "low|medium|high",
  "context": "explanation of why we need clarification",
  "suggested_approach": "how to ask (e.g., email, phone, in-person meeting)"
}}

Severity levels:
- high: Critical for permit approval, must resolve before submitting
- medium: Important clarification, should address during review
- low: Minor question, can be resolved during plan check"""

    return prompt

# ---------------------------
# LLM Processing Functions
# ---------------------------

async def process_filter(section_data, model):
    """Phase 1: Filter section with lightweight model."""
    prompt = build_filter_prompt(section_data)

    # Get fallback models (exclude the primary model if it's already in the list)
    fallbacks = [m for m in FILTER_MODEL_FALLBACKS if m != model]

    response = await call_llm_with_retry(
        model=model,
        messages=[
            {"role": "system", "content": "You are a building code expert. Identify sections that need city consultation."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        fallback_models=fallbacks
    )

    result = json.loads(response.choices[0].message.content)

    section = section_data['section_data']

    return {
        'chapter': section_data['chapter'],
        'section_key': section_data['section_key'],
        'section_number': section_data['section_number'],
        'section_title': section_data['section_title'],
        'section_text': section_data['section_text'],
        'section_references': section['section_references'],
        'needs_consultation': result['needs_consultation'],
        'filter_reason': result['reason'],
        'section_data': section_data['section_data']  # Keep for phase 2
    }

async def process_questions(section_data, model):
    """Phase 2: Generate detailed questions with stronger model."""
    prompt = build_questions_prompt(section_data)

    # Get fallback models (exclude the primary model if it's already in the list)
    fallbacks = [m for m in QUESTION_MODEL_FALLBACKS if m != model]

    response = await call_llm_with_retry(
        model=model,
        messages=[
            {"role": "system", "content": "You are a building code expert. Generate specific questions for the building department."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        fallback_models=fallbacks
    )

    result = json.loads(response.choices[0].message.content)

    return {
        **section_data,  # Keep all phase 1 data
        'questions': result['questions'],
        'severity': result['severity'],
        'context': result['context'],
        'suggested_approach': result.get('suggested_approach', None)
    }

# ---------------------------
# Helper Functions
# ---------------------------

def format_duration(seconds):
    """Format seconds into human-readable duration."""
    return str(timedelta(seconds=int(seconds)))

def save_progress(results, output_file):
    """Save progress to file."""
    temp_file = f"{output_file}.progress"
    with open(temp_file, 'w') as f:
        json.dump(results, f, indent=2)

def load_progress(output_file):
    """Load progress from file."""
    temp_file = f"{output_file}.progress"
    try:
        with open(temp_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

# ---------------------------
# Batch Processing
# ---------------------------

async def process_batch(sections, model, process_fn, semaphore, progress_dict, phase_name):
    """Generic batch processor for either phase."""
    async def process_with_semaphore(section_data):
        async with semaphore:
            section_start = time.time()
            try:
                result = await process_fn(section_data, model)
                duration = time.time() - section_start

                progress_dict['completed'] += 1
                progress_dict['results'].append(result)

                print(f"  [{progress_dict['completed']}/{progress_dict['total']}] {section_data['section_number']} - Completed in {duration:.1f}s")

                # Save progress every 10 sections
                if progress_dict['completed'] % 10 == 0:
                    save_progress(progress_dict['results'], progress_dict['output_file'])

                return result
            except Exception as e:
                print(f"  ERROR processing {section_data['section_number']}: {e}")
                return None

    tasks = [process_with_semaphore(section) for section in sections]
    return await asyncio.gather(*tasks)

# ---------------------------
# Main Processing Logic
# ---------------------------

async def run_phase1(sections, args):
    """Phase 1: Filter sections with lightweight model."""
    print(f"\n{'='*80}")
    print(f"PHASE 1: FILTERING WITH {args.filter_model}")
    print(f"{'='*80}")
    print(f"Processing {len(sections)} sections")
    print(f"Concurrency: {args.concurrency}\n")

    progress_dict = {
        'completed': 0,
        'total': len(sections),
        'results': [],
        'output_file': args.phase1_output
    }

    semaphore = asyncio.Semaphore(args.concurrency)
    start_time = time.time()

    await process_batch(sections, args.filter_model, process_filter, semaphore, progress_dict, "Phase 1")

    duration = time.time() - start_time

    # Save results
    with open(args.phase1_output, 'w') as f:
        json.dump(progress_dict['results'], f, indent=2)

    # Count how many need consultation
    needs_consultation = [r for r in progress_dict['results'] if r and r['needs_consultation']]

    print(f"\n{'='*80}")
    print(f"PHASE 1 COMPLETE")
    print(f"{'='*80}")
    print(f"Total sections: {len(sections)}")
    print(f"Need consultation: {len(needs_consultation)} ({len(needs_consultation)/len(sections)*100:.1f}%)")
    print(f"Duration: {format_duration(duration)}")
    print(f"Saved to: {args.phase1_output}")
    print(f"{'='*80}\n")

    return needs_consultation

async def run_phase2(sections, args):
    """Phase 2: Generate questions for flagged sections."""
    print(f"\n{'='*80}")
    print(f"PHASE 2: QUESTION GENERATION WITH {args.question_model}")
    print(f"{'='*80}")
    print(f"Processing {len(sections)} flagged sections")
    print(f"Concurrency: {args.concurrency}\n")

    progress_dict = {
        'completed': 0,
        'total': len(sections),
        'results': [],
        'output_file': args.output
    }

    semaphore = asyncio.Semaphore(args.concurrency)
    start_time = time.time()

    await process_batch(sections, args.question_model, process_questions, semaphore, progress_dict, "Phase 2")

    duration = time.time() - start_time

    # Save results
    with open(args.output, 'w') as f:
        json.dump(progress_dict['results'], f, indent=2)

    print(f"\n{'='*80}")
    print(f"PHASE 2 COMPLETE")
    print(f"{'='*80}")
    print(f"Total sections: {len(sections)}")
    print(f"Duration: {format_duration(duration)}")
    print(f"Saved to: {args.output}")
    print(f"{'='*80}\n")

async def main_async(args):
    """Main processing logic."""

    # Load input
    print(f"Loading sections from {args.input}...")
    with open(args.input, 'r') as f:
        sections = json.load(f)
    print(f"Loaded {len(sections)} sections\n")

    if args.phase == 'both' or args.phase == '1':
        # Run Phase 1: Filter
        flagged_sections = await run_phase1(sections, args)

        if args.phase == 'both' and flagged_sections:
            # Run Phase 2: Questions
            await run_phase2(flagged_sections, args)
        elif args.phase == 'both' and not flagged_sections:
            print("No sections flagged for consultation. Skipping Phase 2.")

    elif args.phase == '2':
        # Phase 2 only - input should be phase 1 output
        flagged_sections = [s for s in sections if s.get('needs_consultation', False)]
        if not flagged_sections:
            print("ERROR: No sections with needs_consultation=true found in input")
            return
        await run_phase2(flagged_sections, args)

def main():
    parser = argparse.ArgumentParser(description='Two-phase LLM processing for building code sections')
    parser.add_argument('--input', type=str, required=True, help='Input JSON file')
    parser.add_argument('--output', type=str, help='Final output JSON file', default='consultation_questions.json')
    parser.add_argument('--phase1-output', type=str, help='Phase 1 output file', default='phase1_filtered.json')
    parser.add_argument('--filter-model', type=str, help='Model for phase 1 filtering', default='gpt-4o-mini')
    parser.add_argument('--question-model', type=str, help='Model for phase 2 questions', default='gpt-4o')
    parser.add_argument('--concurrency', type=int, help='Number of concurrent requests', default=10)
    parser.add_argument('--phase', type=str, choices=['1', '2', 'both'], default='both', help='Which phase to run')
    parser.add_argument('--no-fallback', action='store_true', help='Disable model fallbacks (fail on rate limit)')

    args = parser.parse_args()

    # If no-fallback is set, clear the fallback lists
    if args.no_fallback:
        FILTER_MODEL_FALLBACKS.clear()
        QUESTION_MODEL_FALLBACKS.clear()

    # Run async main
    asyncio.run(main_async(args))

if __name__ == '__main__':
    main()
