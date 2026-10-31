"""Offline regression tests for the creative conversation lineage validator."""
import copy
import unittest
from creative_result_check import is_expected_edit


def synthetic_result():
    digest = 'e' * 64
    first = {
        'piece_id': 'piece_a', 'version_id': 'v_1', 'parent_version_id': None,
        'revision': 1, 'base_sha256': digest,
        'layers': [{'text': 'Botânica em Aquarela'}],
    }
    second = {
        'piece_id': 'piece_a', 'version_id': 'v_2', 'parent_version_id': 'v_1',
        'revision': 2, 'base_sha256': digest,
        'layers': [{'text': 'Flores em Aquarela'}],
    }
    turns = [{'events': [
        {'method': 'item/completed', 'type': 'mcpToolCall',
         'status': 'completed', 'tool': 'creative_local_edit_text'},
    ]}]
    return [first, second], turns, digest


class LineageCheck(unittest.TestCase):
    def test_valid_edit(self):
        self.assertTrue(is_expected_edit(*synthetic_result()))

    def test_two_pieces_are_not_an_edit(self):
        snapshots, turns, digest = synthetic_result()
        snapshots[1]['piece_id'] = 'piece_b'
        snapshots[1]['revision'] = 1
        snapshots[1]['parent_version_id'] = None
        self.assertFalse(is_expected_edit(snapshots, turns, digest))

    def test_wrong_lineage_and_missing_edit_are_rejected(self):
        snapshots, turns, digest = synthetic_result()
        wrong = copy.deepcopy(snapshots)
        wrong[1]['parent_version_id'] = 'incorrect'
        self.assertFalse(is_expected_edit(wrong, turns, digest))
        turns[0]['events'] = []
        self.assertFalse(is_expected_edit(snapshots, turns, digest))


if __name__ == '__main__':
    unittest.main()
