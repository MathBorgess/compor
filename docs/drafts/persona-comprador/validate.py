#!/usr/bin/env python3
"""Validate the draft contract locally; do not print submitted content."""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print('{"valid":false,"errors":["missing_jsonschema_dependency"]}')
    raise SystemExit(2)

SCHEMA_PATH = Path(__file__).with_name('schema.v1-draft.json')
MAX_BYTES = 512 * 1024
KEY_PATTERN = re.compile(r'\bsk-[A-Za-z0-9_-]{20,}')


def reject_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate key')
        result[key] = value
    return result


def parse_json(path):
    with path.open('rb') as file:
        raw = file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('file too large')
    return json.loads(raw, object_pairs_hook=reject_duplicates)


def validate(document, schema):
    Draft202012Validator.check_schema(schema)
    if not isinstance(document, dict):
        return ['schema_invalid']
    if KEY_PATTERN.search(json.dumps(document, ensure_ascii=False)):
        return ['possible_key']
    if not Draft202012Validator(schema).is_valid(document):
        return ['schema_invalid']

    errors = set()
    sources = {item['id']: item for item in document['fontes']}
    claims = {item['id']: item for item in document['afirmacoes']}
    all_ids = [item['id'] for group in (document['fontes'], document['afirmacoes'], document['implicacoes_criativas']) for item in group]
    if len(all_ids) != len(set(all_ids)):
        errors.add('duplicate_id')

    for claim in document['afirmacoes']:
        linked_sources = [sources.get(source_id) for source_id in claim['fontes_ids']]
        if any(source is None for source in linked_sources):
            errors.add('missing_source')
        if claim['estado'] in ('sustentado', 'divergente') and not any(source and source['procedencia'] not in ('hipotese', 'desconhecida') for source in linked_sources):
            errors.add('unsupported_state')
        previous = claim['substitui_id']
        if previous is not None and (previous not in claims or previous == claim['id'] or claims[previous]['vigente']):
            errors.add('invalid_replacement')
        seen = set()
        cursor = claim
        while cursor['substitui_id'] is not None and cursor['substitui_id'] in claims:
            if cursor['id'] in seen:
                errors.add('replacement_cycle')
                break
            seen.add(cursor['id'])
            cursor = claims[cursor['substitui_id']]

    for suggestion in document['implicacoes_criativas']:
        for claim_id in suggestion['afirmacoes_ids']:
            if claim_id not in claims:
                errors.add('missing_claim')
            elif not claims[claim_id]['vigente']:
                errors.add('inactive_claim')
    for question in document['perguntas_abertas']:
        if any(claim_id not in claims for claim_id in question['afirmacoes_ids']):
            errors.add('missing_claim')
    return sorted(errors)


def main():
    parser = argparse.ArgumentParser(description='Validate a proposed persona document without external calls')
    parser.add_argument('document', type=Path)
    args = parser.parse_args()
    try:
        schema = parse_json(SCHEMA_PATH)
        document = parse_json(args.document)
        errors = validate(document, schema)
    except (OSError, ValueError, json.JSONDecodeError, UnicodeDecodeError):
        errors = ['invalid_json_or_file']
    print(json.dumps({'valid': not errors, 'errors': errors}))
    return 0 if not errors else 1


if __name__ == '__main__':
    sys.exit(main())
