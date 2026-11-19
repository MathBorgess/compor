"""Verifica localmente os insumos congelados de uma referência visual aprovada."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


def checked_file(root, entry):
    relative = Path(entry['path'])
    path = (root / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(root):
        raise ValueError('O arquivo deve pertencer ao pacote da referência')
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
        raise ValueError(f'Arquivo alterado: {relative}')
    return path


def verify(manifest):
    manifest = manifest.resolve()
    root = manifest.parent
    record = json.loads(manifest.read_text(encoding='utf-8'))
    approval = record['approval']
    if (record['status'] != 'referencia-visual-aprovada' or approval['scope'] != 'imagem'
            or not all(isinstance(approval[key], str) and approval[key].strip()
                       for key in ('source', 'literal', 'date'))):
        raise ValueError('O pacote exige registro de aprovação da imagem pelo criador')
    for role in ('briefing', 'caption', 'prompt', 'references'):
        checked_file(root, record[role])
    reference_manifest = root / record['references']['path']
    references = json.loads(reference_manifest.read_text(encoding='utf-8'))['orientation']
    for item in references:
        checked_file(reference_manifest.parent, item)
    if set(record['images']) != {'original', 'feed'}:
        raise ValueError('São necessários o PNG original e a prévia de feed')
    original_entry, feed_entry = (record['images'][role] for role in ('original', 'feed'))
    with Image.open(checked_file(root, original_entry)) as original, Image.open(checked_file(root, feed_entry)) as feed:
        if original.format != 'PNG' or feed.format != 'PNG' or list(original.size) != original_entry['dimensions']:
            raise ValueError('Imagem fora do contrato')
        expected_size = (360, max(1, round(original.height * 360 / original.width)))
        pixels = original.convert('RGBA')
        art = Image.new('RGB', pixels.size, 'white')
        art.paste(pixels, mask=pixels.getchannel('A'))
        expected_feed = art.resize(expected_size, Image.Resampling.LANCZOS)
        if feed.size != expected_size or ImageChops.difference(expected_feed, feed.convert('RGB')).getbbox() is not None:
            raise ValueError('A prévia deve corresponder aos pixels do PNG original')
    excitement, specificity = (record['human'][key] for key in ('excitement', 'specificity'))
    for grade in (excitement, specificity):
        if grade is not None and (type(grade) is not int or not 1 <= grade <= 5):
            raise ValueError('Notas autorrelatadas devem estar na escala de 1 a 5')
    return {'version': record['version'], 'visualApproved': True,
            'imageSha256': record['images']['original']['sha256'],
            'references': len(references), 'excitement': excitement, 'specificity': specificity,
            'favorable': excitement >= 4 and specificity >= 4
            if excitement is not None and specificity is not None else None}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.manifest), ensure_ascii=False, indent=2))
