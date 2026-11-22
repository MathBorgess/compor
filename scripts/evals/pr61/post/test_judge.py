import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from PIL import Image

from judge import (
    DIMENSIONS,
    EXTENDED_CASES_DEFAULT,
    VALID_FORMATS,
    build_extended_packet,
    build_packet,
    digest,
    dimensions_for,
    extended_notes,
    json_file,
    notes,
    verify_art,
    verify_extended_piece,
    write_once,
)
from report import main as release_report, render_extended


class VisualJudgeTest(unittest.TestCase):
    def test_blind_packet_has_three_slots_with_one_receipt_matched_image(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = []
            for index in range(3):
                case_id = f'fixture-{index}'
                cases.append({'id': case_id, 'context': {key: key for key in ('idea', 'offer', 'audience', 'goal', 'direction')} | {'offerFacts': [{'status': 'confirmed', 'label': 'Nome', 'value': 'Roda'}]}, 'rubric': {'split': 'reserva' if index else 'desenvolvimento', 'allowedCopy': ['Roda']}})
                (root / case_id).mkdir()
            fixture = root / 'cases.json'
            write_once(fixture, cases)
            art = root / 'fixture-0' / 'art-1.png'
            Image.new('RGB', (480, 600), 'red').save(art)
            write_once(art.parent / 'receipts.json', [None, {'state': 'complete', 'revision': 'revision', 'sha256': digest(art.read_bytes())}])
            blind = root / 'blind'
            blind.mkdir()
            packets, attachments, mapping = build_packet(fixture, root, blind, 'seed', 'revision')
            self.assertEqual(len(packets), 3)
            self.assertEqual(len(attachments), 4)
            prompt = (blind / 'prompt.txt').read_text()
            self.assertNotIn('fixture-0', prompt)
            self.assertNotIn('split', prompt)
            self.assertTrue(all(len(case['slots']) == 3 for case in mapping.values()))
            self.assertEqual(sum(slot['available'] for case in mapping.values() for slot in case['slots'].values()), 1)
            self.assertEqual(packets[0]['fatosConfirmados'], ['Nome: Roda'])
            with Image.open(attachments[-1]) as original:
                self.assertEqual(original.size, (480, 600))
            with Image.open((blind / f"{attachments[-1].name.split('-')[0]}-feed.png")) as panel:
                self.assertEqual(panel.size, (1080, 474))

    def test_proxies_are_computed_without_accepting_missing_evidence(self):
        record = {'available': True, 'slot': 2}
        ratings = {key: {'nota': 2, 'evidencia': 'Texto grande e visível'} for key in DIMENSIONS}
        art = {'status': 'avaliada', 'dimensoes': ratings, 'fidelidadeFactual': 'fiel', 'fatos': [{'fato': 'Nome: Roda', 'estado': 'confirmado', 'evidencia': 'Roda no centro'}], 'falhasCriticas': []}
        scored = verify_art(art, record, ['Nome: Roda'])
        self.assertEqual(scored['slot'], 2)
        self.assertTrue(scored['prontaNoProxy'])
        ratings['leitura']['nota'] = 1
        scored = verify_art(art, record, ['Nome: Roda'])
        self.assertFalse(scored['prontaNoProxy'])
        self.assertEqual(notes([{'artes': [scored, {'status': 'sem_pixels'}]}])['semPixels'], 1)
        missing = {'available': False, 'slot': 2}
        with self.assertRaises(ValueError):
            verify_art(art, missing, ['Nome: Roda'])
        abstained = verify_art({'status': 'sem_pixels'}, missing, ['Nome: Roda'])
        self.assertEqual(abstained, {'slot': 2, 'status': 'sem_pixels'})
        art['fidelidadeFactual'] = 'infiel'
        with self.assertRaises(ValueError):
            verify_art(art, record, ['Nome: Roda'])
        ratings['leitura']['evidencia'] = ''
        with self.assertRaises(ValueError):
            verify_art(art, record, ['Nome: Roda'])

    def test_published_evidence_is_immutable(self):
        with tempfile.TemporaryDirectory() as directory:
            result = Path(directory) / 'result.json'
            write_once(result, {'value': 1})
            with self.assertRaises(FileExistsError):
                write_once(result, {'value': 2})
            self.assertEqual(json.loads(result.read_text()), {'value': 1})
            self.assertEqual(list(Path(directory).iterdir()), [result])


    def test_report_retains_holdouts_until_the_fourth_complete_round(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private = root / 'juiz-visual-retido'
            private.mkdir()
            status = 'sem_pixels'
            reserved = [{'id': f'holdout-{index}', 'resumo': {'prontasNoProxy': 0}, 'diagnostico': 'Sem pixels', 'artes': [{'status': status, 'slot': i} for i in (1, 2, 3)]} for index in range(2)]
            for index in range(4):
                folder = root / f'round-{index}'
                folder.mkdir()
                meta = {'round': index, 'revision': f'revision-{index}', 'judge': {'model': 'fixture', 'thread': f'thread-{index}'}, 'rubricaSha256': 'rubrica', 'fixtureSha256': 'fixture'}
                write_once(folder / 'complete.json', meta)
                write_once(folder / 'judge-5.json', {**meta, 'casos': []})
                write_once(private / f'round-{index}.json', {**meta, 'casos': {'desenvolvimento': [], 'reserva': reserved}, 'grupos': {'desenvolvimento': notes([]), 'reserva': notes(reserved)}})
                if index < 3:
                    with patch('sys.argv', ['report.py', directory]), self.assertRaises(FileNotFoundError):
                        release_report()
                    self.assertFalse((root / 'juiz-visual-quatro-rodadas.json').exists())
            with patch('sys.argv', ['report.py', directory]):
                release_report()
            self.assertIn('holdout-1', (root / 'juiz-visual-quatro-rodadas.md').read_text())

    def test_extended_cases_fixture_covers_all_formats_and_splits(self):
        cases = json_file(EXTENDED_CASES_DEFAULT)
        self.assertEqual(len(cases), 8)
        splits = [case['rubric']['split'] for case in cases]
        self.assertEqual(splits.count('desenvolvimento'), 5)
        self.assertEqual(splits.count('reserva'), 3)
        formats = {case['format'] for case in cases}
        self.assertEqual(formats, set(VALID_FORMATS))
        for case in cases:
            voice = case['context']['brandVoice']
            self.assertTrue(voice['tone'].strip())
            self.assertTrue(voice['examples'].strip())
            self.assertTrue(voice['avoid'].strip())
            confirmed = [fact for fact in case['context']['offerFacts'] if fact['status'] == 'confirmed']
            self.assertGreaterEqual(len(confirmed), 1)

    def test_extended_packet_builds_format_panels_safe_zones_and_blinds_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base_context = {
                'idea': 'Ideia teste',
                'offer': 'Oferta teste',
                'audience': 'Público teste',
                'goal': 'Objetivo teste',
                'direction': 'Direção teste',
                'brandVoice': {'tone': 'Direto', 'examples': 'Exemplo real.', 'avoid': 'destrave'},
                'offerFacts': [{'status': 'confirmed', 'label': 'Marca', 'value': 'Compor'}],
            }
            cases = [
                {'id': 'ext-single-0', 'format': 'single', 'expectedFrames': 1, 'captionIncluded': True, 'context': base_context, 'rubric': {'split': 'desenvolvimento', 'allowedCopy': ['Compor']}},
                {'id': 'ext-carousel-1', 'format': 'carousel', 'expectedFrames': 3, 'captionIncluded': True, 'context': base_context, 'rubric': {'split': 'desenvolvimento', 'allowedCopy': ['Compor']}},
                {'id': 'ext-collection-2', 'format': 'collection', 'expectedFrames': 2, 'captionIncluded': True, 'context': base_context, 'rubric': {'split': 'reserva', 'allowedCopy': ['Compor']}},
                {'id': 'ext-story-3', 'format': 'story', 'expectedFrames': 1, 'captionIncluded': False, 'context': base_context, 'rubric': {'split': 'reserva', 'allowedCopy': ['Compor']}},
            ]
            fixture = root / 'casos-estendidos.json'
            write_once(fixture, cases)

            def write_frame(case_id, filename, size, color):
                folder = root / case_id
                folder.mkdir(exist_ok=True)
                path = folder / filename
                Image.new('RGB', size, color).save(path)
                return {'state': 'complete', 'revision': 'rev-1', 'sha256': digest(path.read_bytes())}

            # Single (4:5) + caption
            r_single = write_frame('ext-single-0', 'art-1.png', (1024, 1280), 'navy')
            write_once(root / 'ext-single-0' / 'receipts.json', {'art-1.png': r_single})
            (root / 'ext-single-0' / 'caption.txt').write_text('Legenda complementar com ação clara.', encoding='utf-8')

            # Carousel (3 frames expected, only 2 available -> partial missing pixels)
            r_car_1 = write_frame('ext-carousel-1', 'frame-1.png', (1024, 1280), 'teal')
            r_car_2 = write_frame('ext-carousel-1', 'frame-2.png', (1024, 1280), 'teal')
            write_once(root / 'ext-carousel-1' / 'receipts.json', {'frame-1.png': r_car_1, 'frame-2.png': r_car_2})

            # Collection (2 frames complete) + caption
            r_col_1 = write_frame('ext-collection-2', 'frame-1.png', (1024, 1280), 'olive')
            r_col_2 = write_frame('ext-collection-2', 'frame-2.png', (1024, 1280), 'olive')
            write_once(root / 'ext-collection-2' / 'receipts.json', {'frame-1.png': r_col_1, 'frame-2.png': r_col_2})
            (root / 'ext-collection-2' / 'caption.txt').write_text('Bastidores da coleção editorial.', encoding='utf-8')

            # Story (9:16 864x1536) without caption
            r_story = write_frame('ext-story-3', 'frame-1.png', (864, 1536), 'maroon')
            write_once(root / 'ext-story-3' / 'receipts.json', {'frame-1.png': r_story})

            blind = root / 'blind'
            blind.mkdir()
            packets, attachments, decoding = build_extended_packet(fixture, root, blind, 'seed-ext', 'rev-1')
            self.assertEqual(len(packets), 4)
            # 4 panels + 6 verified original frames (1 single + 2 carousel + 2 collection + 1 story)
            self.assertEqual(len(attachments), 10)
            prompt = (blind / 'prompt.txt').read_text(encoding='utf-8')
            for leaked in ('ext-single-0', 'ext-carousel-1', 'ext-collection-2', 'ext-story-3', 'split'):
                self.assertNotIn(leaked, prompt)
            packets_json = json.dumps(packets, ensure_ascii=False)
            for leaked in ('desenvolvimento', 'reserva', 'split'):
                self.assertNotIn(leaked, packets_json)

            by_real_id = {entry['id']: (blind_id, entry) for blind_id, entry in decoding.items()}
            packet_by_blind = {p['id']: p for p in packets}

            single_blind, single_rec = by_real_id['ext-single-0']
            self.assertTrue(single_rec['available'])
            self.assertTrue(single_rec['includeCaption'])
            self.assertIn('legenda', packet_by_blind[single_blind])
            with Image.open(blind / f'{single_blind}-panel.png') as img:
                self.assertEqual(img.size, (360, 474))

            car_blind, car_rec = by_real_id['ext-carousel-1']
            self.assertFalse(car_rec['available'])
            self.assertTrue(car_rec['missingCaption'])
            with Image.open(blind / f'{car_blind}-panel.png') as img:
                self.assertEqual(img.size, (1080, 474))

            col_blind, col_rec = by_real_id['ext-collection-2']
            self.assertTrue(col_rec['available'])
            self.assertIn('coesaoVisual', packet_by_blind[col_blind]['dimensoesAplicaveis'])
            self.assertIn('progressaoOuRitmo', packet_by_blind[col_blind]['dimensoesAplicaveis'])
            with Image.open(blind / f'{col_blind}-panel.png') as img:
                self.assertEqual(img.size, (720, 474))

            story_blind, story_rec = by_real_id['ext-story-3']
            self.assertTrue(story_rec['available'])
            self.assertFalse(story_rec['includeCaption'])
            self.assertNotIn('legenda', packet_by_blind[story_blind])
            self.assertIn('zonasSeguras', packet_by_blind[story_blind]['dimensoesAplicaveis'])
            with Image.open(blind / f'{story_blind}-panel.png') as img:
                self.assertEqual(img.size, (720, 664))

    def test_verify_extended_piece_validates_conditional_dimensions_and_voice_failures(self):
        story_record = {
            'format': 'story',
            'expectedFrames': 1,
            'includeCaption': False,
            'frames': [{'index': 1, 'available': True}],
            'available': True,
        }
        story_dims = {dim: {'nota': 2, 'evidencia': 'Texto limpo na área central'} for dim in dimensions_for('story', False)}
        story_piece = {
            'status': 'avaliada',
            'dimensoes': story_dims,
            'fidelidadeFactual': 'fiel',
            'fatos': [{'fato': 'Marca: Compor', 'estado': 'confirmado', 'evidencia': 'Compor no centro'}],
            'falhasCriticas': [],
        }
        verified = verify_extended_piece(story_piece, story_record, ['Marca: Compor'])
        self.assertTrue(verified['prontaNoProxy'])

        # Missing conditional dimension should fail
        broken = {**story_piece, 'dimensoes': {k: v for k, v in story_dims.items() if k != 'zonasSeguras'}}
        with self.assertRaises(ValueError):
            verify_extended_piece(broken, story_record, ['Marca: Compor'])

        # Voice cliché / avoid violation marks piece infiel & not ready
        cliche_piece = {
            **story_piece,
            'fidelidadeFactual': 'infiel',
            'falhasCriticas': [{'tipo': 'cliche_ou_evitar', 'trecho': 'destrave seu negócio', 'justificativa': 'Palavra proibida em brandVoice.avoid'}],
        }
        cliche_verified = verify_extended_piece(cliche_piece, story_record, ['Marca: Compor'])
        self.assertFalse(cliche_verified['prontaNoProxy'])

        # Critical failure with fidelidadeFactual == 'fiel' must be rejected
        incoherent = {**cliche_piece, 'fidelidadeFactual': 'fiel'}
        with self.assertRaises(ValueError):
            verify_extended_piece(incoherent, story_record, ['Marca: Compor'])

        # Missing pixels cannot be scored
        missing_carousel = {
            'format': 'carousel',
            'expectedFrames': 5,
            'includeCaption': True,
            'frames': [{'index': i, 'available': i <= 3} for i in range(1, 6)],
            'available': False,
        }
        with self.assertRaises(ValueError):
            verify_extended_piece(story_piece, missing_carousel, ['Marca: Compor'])
        abstained = verify_extended_piece({'status': 'sem_pixels'}, missing_carousel, ['Marca: Compor'])
        self.assertEqual(abstained['availableFrames'], 3)
        self.assertEqual(abstained['status'], 'sem_pixels')

        summary = extended_notes([{'peca': verified}, {'peca': cliche_verified}, {'peca': abstained}])
        self.assertEqual(summary['casos'], 3)
        self.assertEqual(summary['disponiveis'], 2)
        self.assertEqual(summary['semPixels'], 1)
        self.assertEqual(summary['prontasNoProxy'], 1)
        self.assertEqual(summary['comFalhaCritica'], 1)
        self.assertEqual(summary['porFormato']['story']['casos'], 2)
        self.assertEqual(summary['porFormato']['carousel']['semPixels'], 1)

    def test_extended_report_retains_holdouts_and_renders_format_table(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private = root / 'juiz-visual-retido'
            private.mkdir()
            for index in range(2):
                folder = root / f'round-{index}'
                folder.mkdir()
                meta = {
                    'suite': 'extended',
                    'round': index,
                    'revision': f'rev-{index}',
                    'judge': {'model': 'fixture', 'thread': f'thread-{index}'},
                    'rubricaSha256': 'rubrica-ext',
                    'fixtureSha256': 'fixture-ext',
                }
                write_once(folder / 'complete.json', {'round': index, 'revision': f'rev-{index}'})
                ready_nota = 1 if index == 0 else 2
                holdout_story = {
                    'id': 'ext-story-res',
                    'format': 'story',
                    'expectedFrames': 1,
                    'includeCaption': False,
                    'missingCaption': False,
                    'diagnostico': 'Zonas seguras respeitadas na revisão final.',
                    'peca': {
                        'status': 'avaliada',
                        'format': 'story',
                        'expectedFrames': 1,
                        'availableFrames': 1,
                        'includeCaption': False,
                        'dimensoes': {dim: {'nota': ready_nota, 'evidencia': 'Evidência teste'} for dim in dimensions_for('story', False)},
                        'fidelidadeFactual': 'fiel',
                        'fatos': [{'fato': 'Preço: R$ 49', 'estado': 'confirmado', 'evidencia': 'R$ 49 legível'}],
                        'falhasCriticas': [],
                        'prontaNoProxy': ready_nota == 2,
                    },
                }
                holdout_col = {
                    'id': 'ext-collection-res',
                    'format': 'collection',
                    'expectedFrames': 3,
                    'includeCaption': True,
                    'missingCaption': False,
                    'diagnostico': 'Coesão editorial mantida.',
                    'peca': {
                        'status': 'avaliada',
                        'format': 'collection',
                        'expectedFrames': 3,
                        'availableFrames': 3,
                        'includeCaption': True,
                        'dimensoes': {dim: {'nota': 2, 'evidencia': 'Evidência editorial'} for dim in dimensions_for('collection', True)},
                        'fidelidadeFactual': 'fiel',
                        'fatos': [{'fato': 'Padaria: Miolo', 'estado': 'confirmado', 'evidencia': 'Miolo na capa'}],
                        'falhasCriticas': [],
                        'prontaNoProxy': True,
                    },
                }
                reserved = [holdout_story, holdout_col]
                write_once(folder / 'judge-5-extended.json', {**meta, 'casos': []})
                write_once(
                    private / f'extended-round-{index}.json',
                    {
                        **meta,
                        'casos': {'desenvolvimento': [], 'reserva': reserved},
                        'grupos': {'desenvolvimento': extended_notes([]), 'reserva': extended_notes(reserved)},
                    },
                )
                if index == 0:
                    with patch('sys.argv', ['report.py', directory, '--suite', 'extended', '--rounds', '2']), self.assertRaises(FileNotFoundError):
                        release_report()
            with patch('sys.argv', ['report.py', directory, '--suite', 'extended', '--rounds', '2']):
                release_report()
            md = (root / 'juiz-visual-estendido.md').read_text(encoding='utf-8')
            self.assertIn('Desempenho por formato', md)
            self.assertIn('ext-story-res', md)
            self.assertIn('O grupo reservado melhorou no proxy', md)
            self.assertIn('Zonas seguras', md)


if __name__ == '__main__':
    unittest.main()
