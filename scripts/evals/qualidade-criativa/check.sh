#!/bin/sh
# Synthetic fixtures, local capture, and mocked transports only.
set -eu
cd "$(dirname "$0")"
: "${COMPOR_EVAL_PYTHON:=python3}"
export COMPOR_EVAL_PYTHON
"$COMPOR_EVAL_PYTHON" -B verificar-dataset.py
"$COMPOR_EVAL_PYTHON" -B -m unittest discover -s . -p 'test_*.py'
node reexecutar-revisor-offline.mjs
