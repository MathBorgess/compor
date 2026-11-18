from html.parser import HTMLParser
import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

import gallery
import judge


class Inputs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.choices=[]
        self.originals=[]

    def handle_starttag(self,tag,attrs):
        fields=dict(attrs)
        if tag=='input' and fields.get('type')=='radio':
            self.choices.append(fields)
        if tag=='a' and fields.get('href','').endswith('.png'):
            self.originals.append(fields['href'])


def pair_fixture(run,p):
    folder=run/'round-0'
    root=folder/p['id']
    root.mkdir(parents=True)
    judge.write_json(folder/'revision.json',{'round':0})
    prompts=[f'Rota {i} com textura & cor.' for i in (1,2,3)]
    hashes=[judge.digest(s.encode()) for s in prompts]
    all_inputs=[{'id':e['id'],'sha256':e['transport']['sha256']} for e in p['visualInput']['entries']]
    opt=p['rubric']['optionalId']
    inputs={'with':all_inputs,'without':[r for r in all_inputs if r['id']!=opt]}
    judge.write_json(root/'ablation.json',{'state':'complete','optional':opt,'prompts':hashes,'inputs':inputs})
    for arm,refs in inputs.items():
        d=root/arm;d.mkdir()
        receipts=[]
        for pos in (1,2,3):
            image=d/f'art-{pos}.png'
            Image.new('RGB',(1024,1280),(pos*36,72,len(refs)*27)).save(image,optimize=True)
            b=image.read_bytes()
            receipts.append({'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'promptHash':hashes[pos-1],
                             'referenceIds':[v['id'] for v in refs],'delivered':refs,'settingsSha256':'1'*64,'model':'fixture'})
        judge.write_json(d/'images.json',receipts)
    judge.write_json(root/'with/plan.json',{'plan':{'items':[{'position':i+1,'prompt':text} for i,text in enumerate(prompts)]}})
    return root


class GalleryTests(unittest.TestCase):
    def test_no_reconciled_art_no_gallery(self):
        with TemporaryDirectory() as temp:
            run=Path(temp)
            out=run/'view.html'
            self.assertFalse(gallery.generate(run,out))
            self.assertFalse(out.exists())

    def test_verified_pairs_choices_are_opt_in_and_partial_lot_disables_them(self):
        with TemporaryDirectory() as temp:
            run=Path(temp)
            p=judge.expected_packet('dev-feira')
            root=pair_fixture(run,p)
            out=run/'view.html'
            self.assertTrue(gallery.generate(run,out))
            page=Inputs();page.feed(out.read_text())
            self.assertEqual(len(page.choices),8)
            self.assertEqual(sum(f['value']=='none' for f in page.choices),2)
            self.assertTrue(all('checked' not in f for f in page.choices))
            self.assertEqual(len(set(page.originals)),6)
            self.assertTrue(all((run/link).exists() for link in page.originals))
            self.assertNotIn('src="https://',out.read_text())
            (root/'without/art-2.png').unlink()
            partial=run/'partial.html'
            self.assertTrue(gallery.generate(run,partial))
            page=Inputs();page.feed(partial.read_text())
            self.assertFalse(page.choices)
            self.assertEqual(len(set(page.originals)),5)
            v=judge.read(root/'with/plan.json')
            v['plan']['items'][0]['prompt']='texto trocado'
            judge.write_json(root/'with/plan.json',v)
            with self.assertRaisesRegex(ValueError,'Prompt diverge'):
                gallery.generate(run,run/'corrupt.html')
            self.assertFalse((run/'corrupt.html').exists())


if __name__=='__main__':
    unittest.main()
