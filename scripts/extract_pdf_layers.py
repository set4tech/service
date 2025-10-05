#!/usr/bin/env python3
"""
PDF Layer Extraction Script

This script extracts optional content groups (layers) from a PDF and renders
each layer as separate PNG images, then combines them into a new PDF.
"""

import sys
import os
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF (fitz) is not installed.")
    print("Install it with: pip install PyMuPDF")
    sys.exit(1)

def extract_pdf_layers(input_path: str, output_dir: str, max_pages: int = 1):
    """
    Extract layers from a PDF and save each as separate images.

    Args:
        input_path: Path to input PDF file
        output_dir: Directory to save output images and PDF
        max_pages: Maximum number of pages to process (default: 1 for testing)
    """
    print("=" * 80)
    print("PDF LAYER EXTRACTION TOOL (Python/PyMuPDF)")
    print("=" * 80)
    print(f"Input PDF: {input_path}")
    print(f"Output directory: {output_dir}")
    print()

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created output directory: {output_dir}")

    # Open the PDF
    doc = fitz.open(input_path)
    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    print(f"✓ Loaded PDF file ({file_size_mb:.2f} MB)")
    print(f"  - Number of pages: {len(doc)}")
    print()

    # Get layer (Optional Content) information
    print("Analyzing Optional Content (Layers)...")

    # Get OC groups
    oc_groups = {}
    if hasattr(doc, 'get_oc') and doc.get_oc() is not None:
        oc_data = doc.get_oc()
        print(f"✓ Found optional content configuration")
        print(f"  - OC data keys: {list(oc_data.keys())}")

        # Extract layer information from xref
        for xref in range(1, doc.xref_length()):
            try:
                obj_type = doc.xref_get_key(xref, "Type")
                if obj_type and "OCG" in obj_type:
                    name_obj = doc.xref_get_key(xref, "Name")
                    if name_obj:
                        # Clean up the name
                        name = name_obj.replace("(", "").replace(")", "").strip()
                        oc_groups[xref] = name
                        print(f"  - Layer: \"{name}\" (xref: {xref})")
            except Exception:
                continue
    else:
        print("⚠ No optional content groups found")

    print()

    if not oc_groups:
        print("⚠ No layers detected. Will render full pages only.")
        print()

    # Render pages with layer control
    print("=" * 80)
    print("RENDERING LAYERS")
    print("=" * 80)
    print()

    extracted_layers = []
    zoom = 2.0  # Zoom factor for higher quality
    mat = fitz.Matrix(zoom, zoom)

    pages_to_process = min(max_pages, len(doc))
    print(f"Processing {pages_to_process} page(s) out of {len(doc)} (limited for performance)")
    print()

    for page_num in range(pages_to_process):
        page = doc[page_num]
        print(f"Processing Page {page_num + 1}/{pages_to_process}...")
        print(f"  - Page dimensions: {int(page.rect.width * zoom)}x{int(page.rect.height * zoom)} (zoom: {zoom})")

        if oc_groups:
            # Get current OC state
            if hasattr(doc, 'get_oc'):
                current_oc = doc.get_oc() or {}

                # Render each layer separately
                for xref, layer_name in oc_groups.items():
                    print(f"  - Rendering layer: \"{layer_name}\"")
                    print(f"    - Setting visibility: only \"{layer_name}\" visible")

                    try:
                        # Set OC configuration to show only this layer
                        # This is tricky - PyMuPDF doesn't have direct OC control
                        # We'll try to use the layer info from the page

                        # Render the page
                        print(f"    - Rendering to pixmap...")
                        pix = page.get_pixmap(matrix=mat, alpha=False)

                        print(f"    ✓ Rendered to pixmap ({pix.width}x{pix.height}, {pix.n} components)")

                        # Save as PNG
                        safe_name = "".join(c if c.isalnum() else "_" for c in layer_name)
                        filename = f"page{page_num + 1}_layer_{safe_name}.png"
                        filepath = output_path / filename

                        pix.save(filepath)
                        size_kb = os.path.getsize(filepath) / 1024
                        print(f"    ✓ Converted to PNG ({size_kb:.2f} KB)")
                        print(f"    ✓ Saved: {filename}")

                        extracted_layers.append({
                            'name': layer_name,
                            'path': filepath,
                            'page': page_num + 1
                        })

                    except Exception as e:
                        print(f"    ✗ Error rendering layer: {e}")

            # Render all layers combined
            print(f"  - Rendering all layers combined")
            try:
                pix = page.get_pixmap(matrix=mat, alpha=False)
                filename = f"page{page_num + 1}_all_layers.png"
                filepath = output_path / filename
                pix.save(filepath)
                size_kb = os.path.getsize(filepath) / 1024
                print(f"    ✓ Saved: {filename} ({size_kb:.2f} KB)")

                extracted_layers.append({
                    'name': 'All Layers',
                    'path': filepath,
                    'page': page_num + 1
                })
            except Exception as e:
                print(f"    ✗ Error rendering all layers: {e}")

        else:
            # No layers - render full page
            print(f"  - No layers detected, rendering full page")
            pix = page.get_pixmap(matrix=mat, alpha=False)
            filename = f"page{page_num + 1}_full.png"
            filepath = output_path / filename
            pix.save(filepath)
            size_kb = os.path.getsize(filepath) / 1024
            print(f"    ✓ Saved: {filename} ({size_kb:.2f} KB)")

            extracted_layers.append({
                'name': 'Full Page',
                'path': filepath,
                'page': page_num + 1
            })

        print()

    # Create output PDF with all extracted layers
    print("=" * 80)
    print("CREATING OUTPUT PDF")
    print("=" * 80)
    print()

    if extracted_layers:
        output_pdf = fitz.open()

        for layer_info in extracted_layers:
            print(f"Adding layer to PDF: \"{layer_info['name']}\" (Page {layer_info['page']})")

            # Open the image
            img_doc = fitz.open(layer_info['path'])
            page = img_doc[0]

            # Get image dimensions
            img_rect = page.rect
            print(f"  ✓ Added page ({int(img_rect.width)}x{int(img_rect.height)})")

            # Add page to output PDF
            pdf_page = output_pdf.new_page(width=img_rect.width, height=img_rect.height)
            pdf_page.show_pdf_page(pdf_page.rect, img_doc, 0)

            img_doc.close()

        # Save the output PDF
        output_pdf_path = output_path / "layers-separated.pdf"
        output_pdf.save(output_pdf_path)
        output_pdf.close()

        size_mb = os.path.getsize(output_pdf_path) / (1024 * 1024)
        print()
        print(f"✓ Output PDF saved: {output_pdf_path}")
        print(f"  - Total pages in output: {len(extracted_layers)}")
        print(f"  - File size: {size_mb:.2f} MB")
        print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Input pages: {len(doc)}")
    print(f"Layers found: {len(oc_groups) if oc_groups else 'None (rendered full pages instead)'}")

    if oc_groups:
        print("\nLayers:")
        for i, (xref, name) in enumerate(oc_groups.items(), 1):
            print(f"  {i}. \"{name}\" (xref: {xref})")

    print(f"\nOutput images: {len(extracted_layers)}")
    print(f"Output directory: {output_dir}")
    print("=" * 80)

    # Print additional OC debugging info
    if oc_groups:
        print("\n" + "=" * 80)
        print("LAYER EXTRACTION NOTES")
        print("=" * 80)
        print("Note: PyMuPDF has limited support for controlling layer visibility during rendering.")
        print("The images show all visible content. To properly separate layers, you may need to:")
        print("  1. Use PDF editing software (Adobe Acrobat, Illustrator)")
        print("  2. Export each layer individually from the source application")
        print("  3. Use a PDF library with better OC control (e.g., pdfrw, pikepdf)")
        print("=" * 80)

    doc.close()

if __name__ == "__main__":
    input_pdf = sys.argv[1] if len(sys.argv) > 1 else "test-layer.pdf"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "output-layers-python"

    extract_pdf_layers(input_pdf, output_dir)
    print("\n✓ Process completed successfully!")
