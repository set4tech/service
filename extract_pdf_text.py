import pdfplumber
import sys
from pathlib import Path

def extract_pdf_text(pdf_path):
    """Extract all text from a PDF file."""
    text_content = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            print(f"Processing {len(pdf.pages)} pages...")

            for i, page in enumerate(pdf.pages, 1):
                print(f"Extracting page {i}/{len(pdf.pages)}...", end="\r")
                page_text = page.extract_text()
                if page_text:
                    text_content.append(f"## Page {i}\n")
                    text_content.append(page_text)
                    text_content.append("\n\n---\n\n")

        print("\nExtraction complete!")
        return "".join(text_content)

    except Exception as e:
        return f"Error extracting PDF: {str(e)}"

def main():
    pdf_file = "data/2024_0925_636386 -  255 California St_5TH FLOOR_IFC set Delta 2.pdf"

    print(f"Loading PDF: {pdf_file}")

    # Extract text
    extracted_text = extract_pdf_text(pdf_file)

    # Save to markdown file
    output_file = "output/pdf_extracted_text.md"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"# Extracted Text from PDF\n\n")
        f.write(f"**Source file:** `{pdf_file}`\n\n")
        f.write("---\n\n")
        f.write(extracted_text)

    print(f"Text extracted and saved to: {output_file}")
    print(f"Total characters extracted: {len(extracted_text)}")

if __name__ == "__main__":
    main()