#!/bin/sh
# Only synthetic fixtures, the mocked provider, and deterministic judge contracts run here.
set -eu
cd "$(dirname "$0")"
: "${COMPOR_EVAL_PYTHON:=python3}"
export COMPOR_EVAL_PYTHON
"$COMPOR_EVAL_PYTHON" -B -c 'from PIL import Image; print("Pillow", Image.__version__)'
node dataset/verify.mjs
node --test --test-timeout=60000 planner/*.test.mjs runner/*.test.mjs metrics/*.test.mjs plan-judge/*.test.mjs
"$COMPOR_EVAL_PYTHON" -B -m unittest discover -s pixels -p 'test_*.py'
