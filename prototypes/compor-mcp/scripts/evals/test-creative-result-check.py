import copy
import json
from pathlib import Path
import unittest
from creative_result_check import is_expected_edit

EVIDENCE = Path(__file__).resolve().parents[4] / 'docs/evals/2026-10-29-phoenix-e2e'

def read(name):
    return json.loads((EVIDENCE / name).read_text())

def verdict(d):
    return is_expected_edit(d['snapshots'], d['turns'], d['source_sha256'])

class LineageCheck(unittest.TestCase):
    def test_valid_prior_edit(self):
        self.assertTrue(verdict(read('codex-creative-conversation-v3.json')))
    def test_two_pieces_are_not_an_edit(self):
        self.assertFalse(verdict(read('codex-creative-conversation-after-guidance.json')))
    def test_wrong_lineage_and_missing_edit_are_rejected(self):
        d = read('codex-creative-conversation-v3.json')
        wrong = copy.deepcopy(d)
        wrong['snapshots'][1]['parent_version_id'] = 'incorrect'
        self.assertFalse(verdict(wrong))
        for turn in d['turns']:
            turn['events'] = [e for e in turn['events'] if e.get('tool') != 'creative_local_edit_text']
        self.assertFalse(verdict(d))

if __name__ == '__main__':
    unittest.main()
