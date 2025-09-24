    #!/usr/bin/env python3
    # Suppress ALL warnings before ANY imports
    import os
    os.environ['GRPC_VERBOSITY'] = 'ERROR'
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    os.environ['GRPC_ENABLE_FORK_SUPPORT'] = '0'
    # Redirect stderr to devnull for the import
    import sys
    import io
    old_stderr = sys.stderr
    sys.stderr = io.StringIO()

    import pdfplumber
    import yaml
    import json
    from pathlib import Path
    import time
    from typing import Optional, Dict, Any
    import warnings
    warnings.filterwarnings('ignore')

    # Import Google AI with stderr suppressed
    import google.generativeai as genai

    # Restore stderr after import
    sys.stderr = old_stderr

    def extract_pdf_with_pages(pdf_path):
        """Extract text from PDF with page numbers preserved."""
        pages_content = []

        try:
            with pdfplumber.open(pdf_path) as pdf:
                print(f"Processing {len(pdf.pages)} pages...")

                for i, page in enumerate(pdf.pages, 1):
                    print(f"Extracting page {i}/{len(pdf.pages)}...", end="\r")
                    page_text = page.extract_text()
                    if page_text:
                        pages_content.append({
                            "page": i,
                            "text": page_text
                        })

            print("\nExtraction complete!")
            return pages_content

        except Exception as e:
            print(f"Error extracting PDF: {str(e)}")
            return []

    def format_pdf_for_llm(pages_content):
        """Format PDF content with clear page markers for LLM."""
        formatted_text = []

        for page_data in pages_content:
            formatted_text.append(f"[PAGE {page_data['page']} START]")
            formatted_text.append(page_data['text'])
            formatted_text.append(f"[PAGE {page_data['page']} END]\n")

        return "\n".join(formatted_text)

    def load_variable_checklist(yaml_path="variable_checklist.yaml"):
        """Load the variable checklist from YAML file."""
        with open(yaml_path, 'r') as f:
            return yaml.safe_load(f)

    def extract_single_variable_with_retry(variable_name, description, formatted_pdf_text, category_context="", max_retries=1):
        """Extract a single variable - fail immediately on rate limit."""

        try:
            result = extract_single_variable(variable_name, description, formatted_pdf_text, category_context)
            return result
        except Exception as e:
            error_str = str(e)

            # Check if it's a rate limit error
            if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                print(f"\n\n❌ RATE LIMITED! Stopping immediately.")
                print(f"Error: {error_str[:200]}...")
                print("\nTry again later or reduce the request rate.")
                sys.exit(1)  # Exit the script entirely
            else:
                # For other errors, just return None
                return None

    def extract_single_variable(variable_name, description, formatted_pdf_text, category_context=""):
        """Extract a single variable using focused prompting, chunking document if needed."""

        # Configure Gemini
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Please set GEMINI_API_KEY environment variable")

        genai.configure(api_key=api_key)
        # Use gemini-2.5-pro as requested
        model = genai.GenerativeModel('gemini-2.5-pro')

        # If document is too large, chunk it and search each chunk
        max_chars_per_chunk = 40000  # ~10k tokens

        if len(formatted_pdf_text) > max_chars_per_chunk:
            # Split into chunks
            chunks = []
            lines = formatted_pdf_text.split('\n')
            current_chunk = []
            current_size = 0

            for line in lines:
                line_size = len(line) + 1  # +1 for newline
                if current_size + line_size > max_chars_per_chunk and current_chunk:
                    chunks.append('\n'.join(current_chunk))
                    current_chunk = [line]
                    current_size = line_size
                else:
                    current_chunk.append(line)
                    current_size += line_size

            if current_chunk:
                chunks.append('\n'.join(current_chunk))

            # Search each chunk
            all_results = []
            for i, chunk in enumerate(chunks):
                if len(chunks) > 1:
                    print(f"[{i+1}/{len(chunks)}]", end=" ", flush=True)

                # Add retry logic for chunk extraction
                max_chunk_retries = 3
                for retry in range(max_chunk_retries):
                    try:
                        result = extract_from_chunk(variable_name, description, chunk, category_context, chunk_num=i+1, total_chunks=len(chunks), model=model)
                        if result and result != 'not_found':
                            all_results.append(result)
                        break  # Success, exit retry loop
                    except Exception as e:
                        error_str = str(e)
                        if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                            print(f"\n\n❌ RATE LIMITED on chunk {i+1}/{len(chunks)}!")
                            print(f"Error: {error_str[:200]}...")
                            print("\nStopping immediately. Try again later.")
                            sys.exit(1)  # Exit entirely on rate limit
                        elif retry == max_chunk_retries - 1:
                            print(f"(chunk failed)", end=" ", flush=True)
                        else:
                            break  # Non-rate-limit error, don't retry

                # No delays between chunks - go as fast as possible

            # Merge results from chunks
            if all_results:
                # If any chunk found it as not_applicable, use that
                if any(r == 'not_applicable' for r in all_results):
                    return 'not_applicable'

                # Otherwise merge the found results, preferring high confidence
                best_result = None
                for r in all_results:
                    if isinstance(r, dict) and 'value' in r:
                        if not best_result or r.get('confidence', 'low') == 'high':
                            best_result = r
                return best_result

            return None
        else:
            # Single chunk - process normally
            return extract_from_chunk(variable_name, description, formatted_pdf_text, category_context, model=model)

    def extract_from_chunk(variable_name, description, chunk_text, category_context="", chunk_num=1, total_chunks=1, model=None):
        """Extract from a single chunk of text."""

        # Create a highly focused prompt for this specific variable
        chunk_info = f" (Chunk {chunk_num}/{total_chunks})" if total_chunks > 1 else ""
        prompt = f"""You are a building code compliance expert extracting ONE SPECIFIC piece of information from construction documents{chunk_info}.

    CATEGORY: {category_context}
    VARIABLE NAME: {variable_name}
    WHAT YOU NEED TO FIND: {description}

    DOCUMENT TEXT (with page markers [PAGE X START] and [PAGE X END]):
    {chunk_text}

    YOUR TASK:
    Read the ENTIRE document and find information that DIRECTLY ANSWERS the question in the description.
    The description tells you EXACTLY what information is needed - read it carefully!

    IMPORTANT RULES:
    1. ONLY extract information that directly answers what the description asks for
    2. If the description asks for a list (e.g., "Parking, exterior routes, site arrival points..."), find and list those specific items
    3. If the description asks for specific editions/years, find the exact edition and year
    4. If the description asks whether something applies (yes/no question), determine if it applies
    5. If the description asks for dates, find actual dates in MM/DD/YYYY format
    6. If information is truly not in the document, return "not_found"
    7. If the variable does not apply to this project (e.g., federal facility questions for a private building), return "not_applicable"

    DECISION LOGIC:
    - First, determine if this variable is APPLICABLE to the project based on what you know
    - If NOT APPLICABLE (e.g., asking about federal agency for a private building), return "not_applicable"
    - If APPLICABLE but information not found in document, return "not_found"
    - If APPLICABLE and found, extract the specific information

    EXAMPLES OF GOOD VS BAD EXTRACTION:

    Example 1:
    Description: "Street address including state, city/town, and county"
    GOOD: "255 California Street, San Francisco, San Francisco County, CA 94111"
    BAD: "255 California Street" (missing county)

    Example 2:
    Description: "If federally owned/leased/altered, identify the agency"
    For a private building:
    GOOD: Return "not_applicable" (this is a private building)
    BAD: Return "not_found" (wrong - it doesn't apply)

    Example 3:
    Description: "Documented structural or technical constraints affecting compliance"
    GOOD: "Existing structural columns at lobby prevent widening entrance beyond 36 inches"
    BAD: "X-ray required before drilling" (that's a precaution, not a compliance constraint)

    Example 4:
    Description: "Define if work is new construction, addition, alteration/renovation, change of occupancy, site/civil, or maintenance only"
    GOOD: "alteration/renovation" (picks from the categories in the description)
    BAD: "Tenant Improvement" (not one of the categories asked for)

    CRITICAL: Make sure your YAML output is properly formatted! Use proper indentation and escape special characters.
    For multi-line quotes, use the literal block scalar (|) like this:
    quote: |
    First line of quote
    Second line of quote

    ANALYZE THE DOCUMENT AND RETURN:

    If NOT APPLICABLE to this project type:
    status: not_applicable
    reason: [brief explanation why it doesn't apply]

    If APPLICABLE but NOT FOUND:
    status: not_found

    If FOUND:
    status: found
    value: [the direct answer to what the description asks]
    page: [page number or list]
    quote: [supporting text from document - use | for multi-line]
    confidence: [high/medium/low]

    Return as YAML."""

        try:
            # Get response from model
            if not model:
                raise ValueError("Model not provided")

            response = model.generate_content(prompt)

            # Parse the response
            yaml_text = response.text
            if "```yaml" in yaml_text:
                yaml_text = yaml_text.split("```yaml")[1].split("```")[0]
            elif "```" in yaml_text:
                yaml_text = yaml_text.split("```")[1].split("```")[0]

            # Clean up common YAML issues
            # Remove tabs and replace with spaces
            yaml_text = yaml_text.replace('\t', '  ')

            try:
                result = yaml.safe_load(yaml_text)
            except yaml.YAMLError as ye:
                # Try to fix common YAML errors
                lines = yaml_text.split('\n')
                fixed_lines = []
                for line in lines:
                    # If line starts with quote: and has unescaped content
                    if line.strip().startswith('quote:') and not line.strip().startswith('quote: |'):
                        # Check if the quote is likely multi-line or has special chars
                        quote_content = line.split('quote:', 1)[1].strip()
                        if len(quote_content) > 80 or ':' in quote_content or '\n' in quote_content:
                            # Convert to literal block scalar
                            indent = len(line) - len(line.lstrip())
                            fixed_lines.append(' ' * indent + 'quote: |')
                            fixed_lines.append(' ' * (indent + 2) + quote_content)
                        else:
                            fixed_lines.append(line)
                    else:
                        fixed_lines.append(line)
                yaml_text = '\n'.join(fixed_lines)

                # Try parsing again
                try:
                    result = yaml.safe_load(yaml_text)
                except:
                    # If still fails, return None
                    print(f"    YAML parse error for {variable_name}, skipping")
                    return None

            # Process the result based on status
            if result and isinstance(result, dict):
                status = result.get('status', '')

                if status == 'not_applicable':
                    return 'not_applicable'  # Fixed: was returning 'none'
                elif status == 'not_found':
                    return None  # Will be filtered out
                elif status == 'found':
                    # Clean up the quote field if it exists
                    if 'quote' in result and result['quote']:
                        # Truncate very long quotes
                        if len(str(result['quote'])) > 500:
                            result['quote'] = str(result['quote'])[:497] + "..."

                    # Return the extracted data with description
                    return {
                        'description': description,
                        'value': result.get('value'),
                        'page': result.get('page'),
                        'quote': result.get('quote'),
                        'confidence': result.get('confidence', 'medium')
                    }

            return None

        except Exception as e:
            print(f"\n    Error extracting {variable_name}: {str(e)[:100]}...")
            return None

    def load_progress(progress_path):
        """Load previously extracted variables if they exist."""
        if progress_path.exists():
            try:
                with open(progress_path, 'r') as f:
                    return yaml.safe_load(f) or {}
            except:
                return {}
        return {}

    def save_progress(extracted_vars, progress_path):
        """Save current extraction progress."""
        sorted_vars = sort_dict_alphabetically(extracted_vars)
        with open(progress_path, 'w') as f:
            yaml.dump(sorted_vars, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)

    def extract_all_variables_sequentially(checklist, formatted_pdf_text, progress_path=None):
        """Extract all variables one by one with focused prompting, saving progress."""
        # Load any previous progress
        if progress_path:
            extracted_vars = load_progress(progress_path)
            if extracted_vars:
                print(f"Resuming from previous extraction ({len(extracted_vars)} categories already done)")
        else:
            extracted_vars = {}

        total_vars = sum(len(items) if isinstance(items, dict) else 1
                        for items in checklist.values())
        current_var = 0

        # Count already extracted vars
        for category, items in extracted_vars.items():
            if isinstance(items, dict):
                current_var += len(items)

        for category, items in checklist.items():
            # Skip if already extracted
            if category in extracted_vars:
                print(f"\nSkipping category: {category} (already extracted)")
                continue
            print(f"\nProcessing category: {category}")

            if isinstance(items, dict):
                extracted_category = {}

                for var_name, var_info in items.items():
                    current_var += 1

                    # Handle nested structures like housing_category
                    if isinstance(var_info, dict) and 'description' in var_info:
                        description = var_info['description']
                        print(f"  [{current_var}/{total_vars}] Extracting: {var_name}...", end=" ")

                        result = extract_single_variable_with_retry(
                            var_name,
                            description,
                            formatted_pdf_text,
                            category_context=category
                        )

                        if result == 'not_applicable':
                            extracted_category[var_name] = 'not_applicable'
                            print("✓ (not applicable)")
                        elif result and isinstance(result, dict):
                            extracted_category[var_name] = result
                            confidence = result.get('confidence', 'unknown')
                            print(f"✓ ({confidence} confidence)")
                        else:
                            print("✗ (not found)")

                        # No delay between requests - let rate limiting handle it
                        pass

                    elif isinstance(var_info, dict):
                        # Handle nested categories like housing_category.fha_multifamily
                        nested_extracted = {}
                        for nested_name, nested_info in var_info.items():
                            if isinstance(nested_info, dict) and 'description' in nested_info:
                                current_var += 1
                                description = nested_info['description']
                                print(f"  [{current_var}/{total_vars}] Extracting: {var_name}.{nested_name}...", end=" ")

                                result = extract_single_variable_with_retry(
                                    f"{var_name}.{nested_name}",
                                    description,
                                    formatted_pdf_text,
                                    category_context=f"{category}.{var_name}"
                                )

                                if result == 'not_applicable':
                                    nested_extracted[nested_name] = 'not_applicable'
                                    print("✓ (not applicable)")
                                elif result and isinstance(result, dict):
                                    nested_extracted[nested_name] = result
                                    confidence = result.get('confidence', 'unknown')
                                    print(f"✓ ({confidence} confidence)")
                                else:
                                    print("✗ (not found)")

                                pass  # No delay

                        if nested_extracted:
                            extracted_category[var_name] = nested_extracted

                if extracted_category:
                    extracted_vars[category] = extracted_category
                    # Save progress after completing each category
                    if progress_path:
                        save_progress(extracted_vars, progress_path)
                        print(f"  Progress saved to {progress_path}")

        return extracted_vars

    def sort_dict_alphabetically(d):
        """Recursively sort a dictionary alphabetically by keys."""
        if not isinstance(d, dict):
            return d

        sorted_dict = {}
        for key in sorted(d.keys()):
            value = d[key]
            if isinstance(value, dict):
                sorted_dict[key] = sort_dict_alphabetically(value)
            else:
                sorted_dict[key] = value
        return sorted_dict

    def clean_extracted_variables(variables):
        """Keep all extractions including 'none' values, but flag low confidence."""
        cleaned = {}

        for category, items in variables.items():
            if category == "_metadata":
                cleaned[category] = items
                continue

            if isinstance(items, dict):
                cleaned_items = {}

                for key, value in items.items():
                    if value == 'none' or value == 'not_applicable':
                        # Keep 'none' and 'not_applicable' values as-is
                        cleaned_items[key] = value
                    elif isinstance(value, dict) and 'value' in value:
                        # Flag low confidence extractions
                        if value.get('confidence') == 'low':
                            print(f"  Warning: Low confidence for {category}.{key}")
                            value['value'] = f"[LOW CONFIDENCE] {value['value']}"
                        cleaned_items[key] = value
                    elif isinstance(value, dict):
                        # Handle nested structures
                        nested_cleaned = {}
                        for nested_key, nested_value in value.items():
                            if nested_value == 'none' or nested_value == 'not_applicable':
                                nested_cleaned[nested_key] = nested_value
                            elif isinstance(nested_value, dict) and 'value' in nested_value:
                                if nested_value.get('confidence') == 'low':
                                    nested_value['value'] = f"[LOW CONFIDENCE] {nested_value['value']}"
                                nested_cleaned[nested_key] = nested_value

                        if nested_cleaned:
                            cleaned_items[key] = nested_cleaned

                if cleaned_items:
                    cleaned[category] = cleaned_items

        return cleaned

    def save_extracted_text(pages_content, output_path):
        """Save the extracted text to a markdown file."""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"# Extracted Text from PDF\n\n")
            f.write(f"**Source file:** `data/2024_0925_636386 - 255 California St_5TH FLOOR_IFC set Delta 2.pdf`\n\n")
            f.write("---\n\n")

            for page_data in pages_content:
                f.write(f"## Page {page_data['page']}\n\n")
                f.write(page_data['text'])
                f.write("\n\n---\n\n")

    def main():
        # Paths
        pdf_file = "../../data/2024_0925_636386 -  255 California St_5TH FLOOR_IFC set Delta 2.pdf"
        checklist_path = Path(__file__).parent / "variable_checklist.yaml"
        text_output_path = Path(__file__).parent.parent.parent / "output" / "pdf_extracted_text.md"
        vars_output_path = Path(__file__).parent.parent.parent / "output" / "vars_california_st.yaml"

        print(f"Loading PDF: {pdf_file}")

        # Step 1: Extract text from PDF with page numbers
        pages_content = extract_pdf_with_pages(pdf_file)

        if not pages_content:
            print("Failed to extract PDF content")
            return

        # Step 2: Save extracted text to markdown
        save_extracted_text(pages_content, text_output_path)
        print(f"Text extracted and saved to: {text_output_path}")

        # Step 3: Format PDF for LLM with page markers
        formatted_pdf = format_pdf_for_llm(pages_content)
        print(f"Formatted PDF text: {len(formatted_pdf)} characters")

        # Calculate how many chunks will be used
        max_chars_per_chunk = 40000
        num_chunks = (len(formatted_pdf) + max_chars_per_chunk - 1) // max_chars_per_chunk
        if num_chunks > 1:
            print(f"Document will be processed in {num_chunks} chunks of ~{max_chars_per_chunk} chars each")

        # Step 4: Load the variable checklist
        checklist = load_variable_checklist(checklist_path)

        # Step 5: Extract variables one by one with focused prompting
        print("\n" + "="*60)
        print("Starting sequential variable extraction...")
        print("="*60)

        # Use progress file to save and resume
        progress_path = vars_output_path.with_suffix('.progress.yaml')
        variables = extract_all_variables_sequentially(checklist, formatted_pdf, progress_path)

        # Step 6: Clean and process results
        print("\n" + "="*60)
        print("Processing extracted variables...")
        variables = clean_extracted_variables(variables)

        # Step 7: Add metadata
        variables["_metadata"] = {
            "source_pdf": "2024_0925_636386 - 255 California St_5TH FLOOR_IFC set Delta 2.pdf",
            "extraction_method": "gemini-2.0-flash-exp with sequential focused extraction",
            "total_pages": len(pages_content),
            "checklist_version": "variable_checklist.yaml",
            "note": "'none' indicates variable is not applicable to this project type"
        }

        # Step 8: Sort alphabetically
        variables = sort_dict_alphabetically(variables)

        # Step 9: Save to YAML
        with open(vars_output_path, 'w') as f:
            yaml.dump(variables, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)

        print("\n" + "="*60)
        print(f"Building variables extracted and saved to: {vars_output_path}")
        print(f"Extracted {len(variables) - 1} categories (plus metadata)")

        # Clean up progress file after successful completion
        if progress_path.exists():
            progress_path.unlink()
            print(f"Progress file cleaned up")

        # Also sort the checklist file for easier comparison
        print("\nSorting checklist file alphabetically...")
        sorted_checklist = sort_dict_alphabetically(checklist)
        with open(checklist_path, 'w') as f:
            yaml.dump(sorted_checklist, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)
        print(f"Checklist sorted: {checklist_path}")

        # Print summary
        print("\nSummary of extracted variables:")
        total_vars = 0
        found_vars = 0
        none_vars = 0
        high_confidence = 0
        medium_confidence = 0
        low_confidence = 0

        for category, values in variables.items():
            if category != "_metadata":
                if isinstance(values, dict):
                    cat_found = 0
                    cat_none = 0
                    for v in values.values():
                        if v == 'none' or v == 'not_applicable':
                            cat_none += 1
                            none_vars += 1
                        elif isinstance(v, dict) and 'value' in v:
                            cat_found += 1
                            found_vars += 1
                            conf = v.get('confidence', 'unknown')
                            if conf == 'high':
                                high_confidence += 1
                            elif conf == 'medium':
                                medium_confidence += 1
                            elif conf == 'low':
                                low_confidence += 1
                        elif isinstance(v, dict):
                            # Handle nested
                            for nv in v.values():
                                if nv == 'none' or nv == 'not_applicable':
                                    cat_none += 1
                                    none_vars += 1
                                elif isinstance(nv, dict) and 'value' in nv:
                                    cat_found += 1
                                    found_vars += 1
                                    conf = nv.get('confidence', 'unknown')
                                    if conf == 'high':
                                        high_confidence += 1
                                    elif conf == 'medium':
                                        medium_confidence += 1
                                    elif conf == 'low':
                                        low_confidence += 1

                    total_vars = found_vars + none_vars
                    print(f"  - {category}: {cat_found} found, {cat_none} not applicable")

        print(f"\nTotal variables processed: {total_vars}")
        print(f"  Found in document: {found_vars}")
        print(f"    High confidence: {high_confidence}")
        print(f"    Medium confidence: {medium_confidence}")
        print(f"    Low confidence: {low_confidence}")
        print(f"  Not applicable: {none_vars}")

    if __name__ == "__main__":
        main()