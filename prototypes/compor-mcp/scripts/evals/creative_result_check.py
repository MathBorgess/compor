"""Checks immutable edit lineage in a recorded two-turn Codex evaluation."""

def is_expected_edit(snapshots, turns, source_hash):
    completed = [e.get('tool') for turn in turns for e in turn.get('events', [])
                 if e.get('method') == 'item/completed' and e.get('type') == 'mcpToolCall'
                 and e.get('status') == 'completed']
    if len(snapshots) != 2:
        return False
    first, second = snapshots
    try:
        return (first['revision'] == 1 and second['revision'] == 2
                and first['piece_id'] == second['piece_id']
                and second['parent_version_id'] == first['version_id']
                and first['layers'][0]['text'] == 'Botânica em Aquarela'
                and second['layers'][0]['text'] == 'Flores em Aquarela'
                and first['base_sha256'] == second['base_sha256'] == source_hash
                and 'creative_local_edit_text' in completed)
    except (KeyError, IndexError, TypeError):
        return False
