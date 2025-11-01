#!/bin/bash
# Test script to demonstrate the comparison feature

set -e

echo "==========================================="
echo "CBC Scraper Regression Testing Demo"
echo "==========================================="
echo ""

# Check if baseline exists
if [ ! -f "cbc_2025.json" ]; then
    echo "❌ Error: cbc_2025.json baseline not found"
    echo "   Please run the scraper first without --compare to create a baseline"
    exit 1
fi

# Normalize baseline if needed
if [ ! -f "cbc_2025_normalized.json" ]; then
    echo "📋 Normalizing baseline for consistent comparisons..."
    python normalize_json.py cbc_2025.json
    mv cbc_2025_normalized.json cbc_2025.json
    echo "✅ Baseline normalized"
    echo ""
fi

# Test 1: Run with test mode and compare
echo "Test 1: Quick test with --test and --compare"
echo "-------------------------------------------"
python cbc.py --version 2025 --test --compare --dry-run
echo ""

# Check if new file was created
if [ -f "cbc_2025_new.json" ]; then
    echo "✅ New output file created: cbc_2025_new.json"
    
    # Show file sizes
    echo ""
    echo "File sizes:"
    ls -lh cbc_2025.json cbc_2025_new.json | awk '{print $5, $9}'
    
    echo ""
    echo "📋 Review the differences shown above"
    echo "📋 Check diff_report.json for detailed changes"
    echo ""
    echo "If changes are expected, run:"
    echo "  mv cbc_2025_new.json cbc_2025.json"
    echo ""
    echo "If changes are NOT expected, investigate the code changes"
else
    echo "✅ No differences detected - output matches baseline!"
fi

echo ""
echo "==========================================="
echo "Demo complete!"
echo "==========================================="

