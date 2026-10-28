#!/usr/bin/env python3
"""Extract, render and PREPARE one synthetic trajectory continuation; never run a model."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import tempfile
import time

import artifacts

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('compor_fixed_renderer', HERE / 'render' / 'renderer.py')
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return artifacts.strict_json(Path(path).read_bytes())


def file_hash(path):
    return artifacts.sha(Path(path).read_bytes())


def prefix_matches(data, expected):
    """The MCP transcript may only have appended complete records since extraction."""
    rolling = hashlib.sha256()
    for line in data.splitlines(keepends=True):
        rolling.update(line)
        if rolling.hexdigest() == expected:
            return True
    return False


def stable_extraction(report):
    result = deepcopy(report)
    # Appending later turn calls can add identical wire candidates, but never
    # changes per-turn evidence, plans, sources, asset bytes or technical patches.
    result.pop('wire_sha256', None)
    result.pop('limitations', None)
    for artifact in result.get('artifacts', []):
        artifact.pop('mcp_evidence', None)
    return result


def extraction(run, turn, destination, assets, previous=None):
    previous = previous or (run / f't{turn - 1}-artifacts' if turn > 3 else None)
    if not destination.exists():
        report = artifacts.extract_artifacts(run, turn, destination, assets, previous)
        require(report['status'] == 'ready_for_render', f'Extraction blocked: {report["status"]}; inspect {destination / "report.json"}')
        return report, False
    require(destination.is_dir(), 'Artifact destination is not a directory')
    report = read(destination / 'report.json')
    require(report.get('status') == 'ready_for_render', 'Existing extraction is not ready; preserve it for explicit repair')
    require(prefix_matches((run / 'mcp.jsonl').read_bytes(), report['wire_sha256']),
            'MCP transcript differs from the original extraction prefix')
    with tempfile.TemporaryDirectory(prefix='compor-advance-verify-') as temp:
        fresh = Path(temp) / 'extraction'
        verified = artifacts.extract_artifacts(run, turn, fresh, assets, previous)
        require(verified['status'] == 'ready_for_render', 'Existing extraction no longer validates against source/asset evidence')
        require(stable_extraction(report) == stable_extraction(verified), 'Existing extraction report differs from verified sources')
        for file in fresh.rglob('*'):
            if file.is_file() and file.name != 'report.json':
                existing = destination / file.relative_to(fresh)
                require(existing.is_file() and file.read_bytes() == existing.read_bytes(),
                        f'Existing extracted file differs from its source: {file.relative_to(fresh)}')
    return report, True


def verify_render(payload, png_path, report_path):
    require(png_path.is_file() and report_path.is_file(), 'Partial existing render; preserve it for explicit repair')
    report = read(report_path)
    require(report.get('status') == 'rendered', 'Existing renderer report is not successful')
    require(report['input_sha256'] == renderer.digest(renderer.canonical(payload)), 'Existing render input hash differs')
    require(report['piece_sha256'] == renderer.digest(renderer.canonical(payload['piece'])), 'Existing render piece hash differs')
    require(report['png_sha256'] == file_hash(png_path), 'Existing PNG checksum differs')
    require(report['renderer_sha256'] == file_hash(HERE / 'render' / 'renderer.py'), 'Existing PNG used another renderer')
    catalog = read(HERE / 'render' / 'fonts.json')
    require(report['font_catalog_sha256'] == renderer.digest(renderer.canonical(catalog)), 'Existing font catalog differs')
    require(report['policy'] == renderer.POLICY, 'Existing render policy differs')
    expected_runtime = {'python': platform.python_version(), 'pillow': renderer.PIL.__version__, 'platform': platform.platform()}
    require(report['runtime'] == expected_runtime, 'Existing renderer runtime differs')
    require(report['report_payload_sha256'] == renderer.digest(renderer.canonical(
        {k: v for k, v in report.items() if k != 'report_payload_sha256'})), 'Renderer report checksum differs')
    core = {k: v for k, v in report.items() if k not in ('render_core_sha256', 'png_sha256', 'png_bytes', 'report_payload_sha256')}
    require(report['render_core_sha256'] == renderer.digest(renderer.canonical(core)), 'Renderer core checksum differs')
    for layer in report['layers']:
        if layer['kind'] == 'image':
            require(layer['asset_ref'] in payload['assets'], 'Rendered asset is absent from verified input')
            require(layer['asset_path'] == payload['assets'][layer['asset_ref']], 'Rendered asset path differs')
            require(layer['asset_sha256'] == file_hash(layer['asset_path']), 'Rendered asset bytes changed')
        elif layer['kind'] == 'text':
            settings = layer['settings']
            expected_font = catalog['fonts'][settings['font_ref']]['weights'][str(settings['font_weight'])]
            require(layer['font_path'] == expected_font and layer['font_sha256'] == file_hash(expected_font),
                    'Rendered font file or bytes changed')
    with renderer.Image.open(png_path) as image:
        require(list(image.size) == report['size_px'], 'PNG dimensions differ from renderer report')
        for name, value in {
            'compor_input_sha256': report['input_sha256'],
            'compor_render_core_sha256': report['render_core_sha256'],
            'compor_renderer_sha256': report['renderer_sha256'],
            'compor_font_catalog_sha256': report['font_catalog_sha256'],
        }.items():
            require(image.info.get(name) == value, f'PNG provenance metadata differs: {name}')
    return report


def render_one(directory, artifact):
    source = (directory / artifact['render_input']).resolve()
    require(source.is_relative_to(directory.resolve()), 'Render input escapes artifact directory')
    payload = read(source)
    require(artifacts.sha(artifacts.canonical(payload)) == artifact['render_input_sha256'], 'Render input checksum differs from extraction')
    require(artifacts.sha(artifacts.canonical(payload['piece'])) == artifact['mapped_piece_sha256'], 'Mapped piece checksum differs')
    renders = directory / 'renders'
    renders.mkdir(exist_ok=True)
    png, report_path = renders / f'{artifact["id"]}.png', renders / f'{artifact["id"]}.json'
    started = time.monotonic_ns()
    reused = png.exists() or report_path.exists()
    if not reused:
        try:
            data, report = renderer.compose(payload)
        except Exception as error:
            # Never repair or replace an invalid plan. Persist failure beside it.
            artifacts.save(report_path, {'status': 'failed', 'error': {'type': type(error).__name__, 'message': str(error)},
                                        'input_sha256': artifacts.sha(artifacts.canonical(payload))})
            raise
        artifacts.save(png, data, raw=True)
        artifacts.save(report_path, report)
    report = verify_render(payload, png, report_path)
    elapsed = (time.monotonic_ns() - started) / 1_000_000
    return {
        'artifact_id': artifact['id'], 'piece_id': artifact['piece_id'], 'version': artifact['version'],
        'png': str(png), 'png_sha256': report['png_sha256'], 'report': str(report_path),
        'report_sha256': file_hash(report_path), 'reused_verified': reused,
        'render_and_verify_wall_ms': None if reused else elapsed,
        'reuse_verification_wall_ms': elapsed if reused else None,
        'asset_refs': artifact['asset_refs'],
        'layers': [{key: layer[key] for key in ('id', 'kind', 'asset_ref') if key in layer}
                   for layer in payload['piece']['layers']],
    }


def source_case(path, run, turn):
    case = read(path)
    require(case.get('synthetic') is True and isinstance(case.get('id'), str), 'Source case must be explicitly synthetic')
    require(set(case) <= {'id', 'synthetic', 'turns', 'description'}, 'Source case contains unsupported fields')
    require(isinstance(case.get('turns'), list) and len(case['turns']) >= 5, 'Expected the five-turn trajectory')
    for index, entry in enumerate(case['turns']):
        require(isinstance(entry, dict) and set(entry) <= {'id', 'prompt', 'images'} and isinstance(entry.get('prompt'), str),
                'Case turns accept only id, prompt and images')
        if index < turn:
            submitted = read(run / f'turn-{index + 1:02d}.json')
            require(entry['prompt'] == submitted.get('prompt'), f'Previously submitted prompt changed: T{index + 1}')
        images = entry.get('images', [])
        require(isinstance(images, list) and all(isinstance(name, str) for name in images), 'Invalid case image paths')
        # Relocation of the derived JSON must not reinterpret relative images.
        if images:
            entry['images'] = [str((Path(name) if Path(name).is_absolute() else path.parent / name).resolve()) for name in images]
    return case


def prepare_case(case, run, turn, rendered, destination=None):
    if turn == 5:
        return None
    derived = deepcopy(case)
    next_turn = derived['turns'][turn]
    existing_images = next_turn.get('images', [])
    attached = [{
        'attachment_index': index + 1 + len(existing_images),
        'artifact_id': item['artifact_id'], 'piece_id': item['piece_id'], 'version': item['version'],
        'render_status': 'rendered', 'png_sha256': item['png_sha256'],
        'asset_refs': item['asset_refs'], 'layers': item['layers'],
    } for index, item in enumerate(rendered)]
    technical = {'completed_turn': turn, 'render_status': 'rendered', 'attachments': attached}
    next_turn['prompt'] = 'Resultados técnicos do coordenador, sem avaliação criativa:\n' + json.dumps(
        technical, ensure_ascii=False, separators=(',', ':')) + '\n\n' + next_turn['prompt']
    next_turn['images'] = [*existing_images, *[item['png'] for item in rendered]]
    destination = destination or run / f'resume-after-t{turn}.json'
    if destination.exists():
        require(read(destination) == derived, 'Existing prepared continuation differs; refusing overwrite')
    else:
        artifacts.save(destination, derived)
    return {'path': str(destination), 'sha256': file_hash(destination), 'next_turn': turn + 1,
            'execution_started': False}


def advance(run, turn, case_path, assets_path, *, artifact_dir=None, report_path=None,
            resume_path=None, previous_artifacts=None):
    run, case_path, assets_path = Path(run).resolve(), Path(case_path).resolve(), Path(assets_path).resolve()
    require(run.is_dir(), 'Run directory does not exist')
    destination = Path(report_path).resolve() if report_path else run / f'advance-t{turn}.json'
    artifact_directory = Path(artifact_dir).resolve() if artifact_dir else run / f't{turn}-artifacts'
    resume_destination = Path(resume_path).resolve() if resume_path else run / f'resume-after-t{turn}.json'
    previous = Path(previous_artifacts).resolve() if previous_artifacts else None
    require(turn == 5 or destination != resume_destination, 'Report and continuation paths must be distinct')
    inputs = {'source_case': {'path': str(case_path), 'sha256': file_hash(case_path)},
              'assets': {'path': str(assets_path), 'sha256': file_hash(assets_path)},
              'extractor_sha256': file_hash(HERE / 'artifacts.py'),
              'renderer_sha256': file_hash(HERE / 'render' / 'renderer.py'),
              'coordinator_sha256': file_hash(__file__)}
    if any(value is not None for value in (artifact_dir, report_path, resume_path, previous_artifacts)):
        inputs['explicit_destinations'] = {'artifacts': str(artifact_directory), 'report': str(destination),
                                          'resume': str(resume_destination) if turn < 5 else None}
    if previous is not None:
        inputs['previous_artifacts'] = {'path': str(previous), 'report_sha256': file_hash(previous / 'report.json')}
    prior = read(destination) if destination.exists() else None
    if prior:
        require(prior.get('status') in ('ready_to_resume', 'completed'), 'Existing advance failure requires explicit repair; never overwritten')
        require(prior['inputs'] == inputs, 'Existing advance inputs changed')
    report = {'schema_version': 1, 'run': str(run), 'turn': turn, 'status': 'failed', 'inputs': inputs,
              'outputs': {'artifact_directory': str(artifact_directory), 'renders': [], 'resume_case': None},
              'timing_ms': {}, 'errors': [], 'generation_executed': False, 'model_execution_started': False}
    started = time.monotonic_ns()
    try:
        case = source_case(case_path, run, turn)
        stage = time.monotonic_ns()
        extracted, reused = extraction(run, turn, artifact_directory, assets_path, previous)
        report['timing_ms']['extraction_or_verification'] = (time.monotonic_ns() - stage) / 1_000_000
        report['extraction_reused_verified'] = reused
        for artifact in extracted['artifacts']:
            report['outputs']['renders'].append(render_one(artifact_directory, artifact))
        report['outputs']['resume_case'] = prepare_case(case, run, turn, report['outputs']['renders'], resume_destination)
        report['status'] = 'completed' if turn == 5 else 'ready_to_resume'
    except Exception as error:
        report['errors'].append({'type': type(error).__name__, 'message': str(error)})
    report['timing_ms']['total'] = (time.monotonic_ns() - started) / 1_000_000
    if prior:
        require(report['status'] == prior['status'], f'Existing advance no longer validates: {report["errors"]}')
        require(report['outputs']['resume_case'] == prior['outputs']['resume_case'], 'Existing continuation hash differs')
        require(len(prior['outputs']['renders']) == len(report['outputs']['renders']), 'Existing rendered output count differs')
        for old, current in zip(prior['outputs']['renders'], report['outputs']['renders']):
            require(old['png_sha256'] == current['png_sha256'] and old['report_sha256'] == current['report_sha256'],
                    'Existing rendered output hash differs')
        return {**prior, 'reused_and_verified_now': True}
    artifacts.save(destination, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--turn', type=int, choices=(3, 4, 5))
    for value in (3, 4, 5):
        group.add_argument(f'--turn{value}', dest='turn', action='store_const', const=value)
    parser.add_argument('--source-case', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--artifact-dir', type=Path, help='Alternate extraction/render directory; existing failures are preserved')
    parser.add_argument('--report-path', type=Path, help='Alternate immutable advance report path')
    parser.add_argument('--resume-path', type=Path, help='Alternate prepared case path for T3/T4')
    parser.add_argument('--previous-artifacts', type=Path, help='Explicit preceding extraction directory for T4/T5')
    args = parser.parse_args()
    try:
        report = advance(args.run, args.turn, args.source_case, args.assets,
                         artifact_dir=args.artifact_dir, report_path=args.report_path,
                         resume_path=args.resume_path, previous_artifacts=args.previous_artifacts)
        report_path = args.report_path.resolve() if args.report_path else args.run.resolve() / f'advance-t{args.turn}.json'
        print(json.dumps({'status': report['status'], 'report': str(report_path),
                          'resume_case': report['outputs']['resume_case'], 'errors': report['errors']}, ensure_ascii=False))
        return 0 if report['status'] in ('ready_to_resume', 'completed') else 1
    except Exception as error:
        blocked = {'status': 'blocked', 'run': str(args.run.resolve()), 'turn': args.turn,
                   'inputs': {'source_case': str(args.source_case.resolve()), 'assets': str(args.assets.resolve())},
                   'outputs': {}, 'model_execution_started': False, 'generation_executed': False,
                   'error': {'type': type(error).__name__, 'message': str(error)}}
        if args.run.is_dir():
            failure = args.run / f'advance-t{args.turn}-blocked-{time.time_ns()}.json'
            artifacts.save(failure, blocked)
            blocked['failure_report'] = str(failure.resolve())
        print(json.dumps(blocked, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
