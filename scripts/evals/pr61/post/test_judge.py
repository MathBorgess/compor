import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from PIL import Image

from judge import DIMENSIONS, build_packet, digest, notes, verify_art, write_once
from report import main as release_report


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
        with self.assertRaises(ValueError):
            verify_art(art, {'available': False, 'slot': 2}, ['Nome: Roda'])
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

if __name__ == '__main__':
    unittest.main()
