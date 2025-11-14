#!/bin/bash
#
# Compliance Analysis Pipeline Runner
#
# Runs all 3 phases sequentially:
#   Phase 1: Text-based analysis → JSON
#   Phase 2: Vision analysis on flagged items → JSON
#   Phase 3: Database seeding from JSON
#
# Usage:
#   ./run_pipeline.sh <assessment-id> [env]
#
# Example:
#   ./run_pipeline.sh 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 prod
#

set -e  # Exit on error

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <assessment-id> [env]"
    echo "Example: $0 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 prod"
    exit 1
fi

ASSESSMENT_ID=$1
ENV=${2:-prod}
MODEL=${3:-gemini/gemini-2.0-flash-exp}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    RESULTS_DIR="$SCRIPT_DIR/results/$ASSESSMENT_ID"
    LOG_DIR="$RESULTS_DIR/logs"
    
# Create directories
mkdir -p "$RESULTS_DIR"
mkdir -p "$LOG_DIR"

# File paths
PREFILTER_RESULTS="$RESULTS_DIR/prefilter_results.json"
TEXT_RESULTS="$RESULTS_DIR/text_results.json"
VISION_RESULTS="$RESULTS_DIR/vision_results.json"
MERGED_RESULTS="$RESULTS_DIR/merged_results.json"

PHASE0_LOG="$LOG_DIR/phase0.log"
PHASE1_LOG="$LOG_DIR/phase1.log"
PHASE2_LOG="$LOG_DIR/phase2.log"
PHASE3_LOG="$LOG_DIR/phase3.log"

echo "================================================================================"
echo "COMPLIANCE ANALYSIS PIPELINE"
echo "================================================================================"
echo "Assessment ID: $ASSESSMENT_ID"
echo "Environment:   $ENV"
echo "Model:         $MODEL"
echo "Results dir:   $RESULTS_DIR"
echo "================================================================================"
echo ""

# Activate virtual environment if it exists
if [ -f "$SCRIPT_DIR/../../venv/bin/activate" ]; then
    echo "[SETUP] Activating virtual environment..."
    source "$SCRIPT_DIR/../../venv/bin/activate"
fi

# Phase 0: Pre-filtering
echo ""
echo "================================================================================"
echo "PHASE 0: PRE-FILTERING"
echo "================================================================================"
echo "Starting: $(date)"
echo "Log:      $PHASE0_LOG"
echo ""

python "$SCRIPT_DIR/phase0_prefilter.py" \
    --assessment-id "$ASSESSMENT_ID" \
    --env "$ENV" \
    --output "$PREFILTER_RESULTS" \
    --model "gemini/gemini-2.0-flash-thinking-exp-1219" \
    --concurrency 10 \
    2>&1 | tee "$PHASE0_LOG"

PHASE0_EXIT=$?

if [ $PHASE0_EXIT -ne 0 ]; then
    echo ""
    echo "[ERROR] Phase 0 failed with exit code $PHASE0_EXIT"
    echo "See log: $PHASE0_LOG"
    exit $PHASE0_EXIT
fi

echo ""
echo "[PHASE 0] Complete! Results saved to: $PREFILTER_RESULTS"
echo ""

# Phase 1: Text Analysis
echo ""
echo "================================================================================"
echo "PHASE 1: TEXT-BASED ANALYSIS"
echo "================================================================================"
echo "Starting: $(date)"
echo "Log:      $PHASE1_LOG"
echo ""

python "$SCRIPT_DIR/phase1_text_analysis.py" \
    --assessment-id "$ASSESSMENT_ID" \
    --env "$ENV" \
    --output "$TEXT_RESULTS" \
    --prefilter-input "$PREFILTER_RESULTS" \
    --model "$MODEL" \
    2>&1 | tee "$PHASE1_LOG"

PHASE1_EXIT=$?

if [ $PHASE1_EXIT -ne 0 ]; then
    echo ""
    echo "[ERROR] Phase 1 failed with exit code $PHASE1_EXIT"
    echo "See log: $PHASE1_LOG"
    exit $PHASE1_EXIT
fi

echo ""
echo "[PHASE 1] Complete! Results saved to: $TEXT_RESULTS"
echo ""

# Check if vision analysis is needed
NEEDS_VISION=$(python -c "
import json
with open('$TEXT_RESULTS', 'r') as f:
    data = json.load(f)
print(data.get('needs_vision_count', 0))
")

if [ "$NEEDS_VISION" -eq 0 ]; then
    echo "[INFO] No checks need vision analysis. Skipping Phase 2."
    echo "[INFO] Creating empty vision results file..."
    echo '{"assessment_id": "'$ASSESSMENT_ID'", "analyzed": [], "not_applicable": []}' > "$VISION_RESULTS"
else
    # Phase 2: Vision Analysis
    echo ""
    echo "================================================================================"
    echo "PHASE 2: VISION-BASED ANALYSIS"
    echo "================================================================================"
    echo "Starting: $(date)"
    echo "Log:      $PHASE2_LOG"
    echo "Checks:   $NEEDS_VISION flagged for vision"
    echo ""

    python "$SCRIPT_DIR/phase2_vision_analysis.py" \
        --input "$TEXT_RESULTS" \
        --output "$VISION_RESULTS" \
        --model "$MODEL" \
        --concurrency 2 \
        2>&1 | tee "$PHASE2_LOG"

    PHASE2_EXIT=$?

    if [ $PHASE2_EXIT -ne 0 ]; then
        echo ""
        echo "[ERROR] Phase 2 failed with exit code $PHASE2_EXIT"
        echo "See log: $PHASE2_LOG"
        exit $PHASE2_EXIT
    fi

    echo ""
    echo "[PHASE 2] Complete! Results saved to: $VISION_RESULTS"
    echo ""
fi

# Phase 3: Database Seeding
echo ""
echo "================================================================================"
echo "PHASE 3: DATABASE SEEDING"
echo "================================================================================"
echo "Starting: $(date)"
echo "Log:      $PHASE3_LOG"
echo ""

python "$SCRIPT_DIR/phase3_seed_database.py" \
    --text-results "$TEXT_RESULTS" \
    --vision-results "$VISION_RESULTS" \
    --env "$ENV" \
    --model "$MODEL" \
    2>&1 | tee "$PHASE3_LOG"

PHASE3_EXIT=$?

if [ $PHASE3_EXIT -ne 0 ]; then
    echo ""
    echo "[ERROR] Phase 3 failed with exit code $PHASE3_EXIT"
    echo "See log: $PHASE3_LOG"
    exit $PHASE3_EXIT
fi

echo ""
echo "[PHASE 3] Complete! Results inserted to database."
echo ""

# Summary
echo ""
echo "================================================================================"
echo "PIPELINE COMPLETE"
echo "================================================================================"
echo "Assessment ID: $ASSESSMENT_ID"
echo "Completed:     $(date)"
echo ""
echo "Results:"
echo "  - Prefilter:      $PREFILTER_RESULTS"
echo "  - Text results:   $TEXT_RESULTS"
echo "  - Vision results: $VISION_RESULTS"
echo "  - Merged results: $MERGED_RESULTS"
echo ""
echo "Logs:"
echo "  - Phase 0: $PHASE0_LOG"
echo "  - Phase 1: $PHASE1_LOG"
echo "  - Phase 2: $PHASE2_LOG"
echo "  - Phase 3: $PHASE3_LOG"
echo "================================================================================"
echo ""
