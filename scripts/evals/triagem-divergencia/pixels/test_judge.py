from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import judge as j


class PixelWitnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fee = j.expected_packet('dev-feira')

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.round=self.root/'round-0'
        self.round.mkdir()
        j.write_json(self.round/'revision.json',{'round':0})
        self.out=self.round/'pixels'

    def fixture(self):
        root=self.round/self.fee['id']
        root.mkdir()
        refs=[{'id':e['id'],'sha256':e['transport']['sha256']} for e in self.fee['visualInput']['entries']]
        opt=self.fee['rubric']['optionalId']
        inputs={'with':refs,'without':[r for r in refs if r['id']!=opt]}
        prompts=[j.digest(str(i).encode()) for i in range(3)]
        j.write_json(root/'ablation.json',{'state':'complete','source':'with','optional':opt,'prompts':prompts,'inputs':inputs})
        for arm,values in inputs.items():
            d=root/arm
            d.mkdir()
            receipts=[]
            for i in range(1,4):
                from PIL import Image
                image=d/f'art-{i}.png'
                Image.new('RGB',(24,32),(i,ord(arm[-1]),84)).save(image)
                b=image.read_bytes()
                receipts.append({'sha256':j.digest(b),'bytes':len(b),'promptHash':prompts[i-1],
                                 'referenceIds':[r['id'] for r in values],'delivered':values,
                                 'settingsSha256':'0'*64,'model':'fixture'})
            j.write_json(d/'images.json',receipts)
        return root

    def test_no_images_is_unknown_for_all_and_does_not_call_judge(self):
        j.prepare(self.root,0,self.out)
        with patch('judge.subprocess.run',side_effect=RuntimeError('Não deveria chamar juiz')):
            j.judge(self.out)
        v=j.read(self.out/'judgments.json')
        self.assertEqual(len(v['cases']),5)
        for c in v['cases']:
            for a in c['arms'].values():
                self.assertEqual(len(a['slots']),3)
                for s in a['slots']:
                    self.assertIsNone(s['usable'])
                    self.assertIsNone(s['sha256'])
                    self.assertTrue(all(v['score'] is None for v in s['attributes']))
                self.assertTrue(all(pair['score'] is None for pair in a['pairs']))
        stats=j.read(self.out/'attribute-scores.json')
        self.assertTrue(all(row['points'] is None and row['unknown']==3 for row in stats))
        self.assertTrue(all(c['split']=='dev' for c in j.read(self.out/'feedback-dev.json')['cases']))

    def test_different_prompts_or_altered_files_fail_before_judge(self):
        root=self.fixture()
        art=root/'with/art-1.png'
        orig=art.read_bytes()
        art.write_bytes(orig+b'x')
        with self.assertRaisesRegex(ValueError,'Bytes'):
            j.load_case(self.round,self.fee)
        art.write_bytes(orig)
        a=root/'without/images.json'
        v=j.read(a)
        v[0]['promptHash']='1'*64
        j.write_json(a,v)
        with self.assertRaisesRegex(ValueError,'Prompt'):
            j.load_case(self.round,self.fee)

    def test_missing_is_not_substituted_and_scope_matches_across_groups(self):
        root=self.fixture()
        (root/'without/art-2.png').unlink()
        j.prepare(self.root,0,self.out)
        appearances=0
        for panel in (self.out/'group-1',self.out/'group-2'):
            check=j.read(panel/'index.json')
            prompt=(panel/'blind/prompt.txt').read_text()
            self.assertNotIn('round-0',prompt)
            self.assertNotIn('"with"',prompt)
            self.assertNotIn('dev-feira',prompt)
            self.assertNotIn('holdout',prompt)
            rows=[]
            for label,meta in check['cases'].items():
                observed={k:s for k,s in meta['slots'].items() if s['state']=='observed'}
                slots=[{'slot':s,'usable':True,'reason':'Nome e local legíveis na base.',
                        'criticalFailures':[],'attributes':[{'ref':'R'+str(i+1),'score':2,'evidence':'Detalhe visível no rodapé.'}
                                                        for i in range(len(meta['refIds']))]} for s in observed]
                pairs=[{'pair':a+b,'score':1,'evidence':'Mudou o tratamento do fundo.'}
                       for a,b in j.itertools.combinations(j.SLOTS,2) if a in observed and b in observed]
                rows.append({'case':label,'slots':slots,'pairs':pairs,'change':'Verificar a escala dos detalhes.'})
            for meta, result in j.unblind(check,{'cases':rows}):
                if meta['caseId']!=self.fee['id']:
                    continue
                appearances+=1
                self.assertEqual(meta['refIds'],[r['id'] for r in self.fee['rubric']['references']])
                if meta['arm']=='without':
                    missing=result['slots'][1]
                    self.assertEqual(missing['state'],'missing_image_file')
                    self.assertIsNone(missing['usable'])
                    self.assertIsNone(missing['path'])
                    self.assertIsNone(missing['sha256'])
                    self.assertTrue(all(a['score'] is None for a in missing['attributes']))
                    self.assertEqual(sum(p['score'] is not None for p in result['pairs']),1)
        self.assertEqual(appearances,2)

    def test_critical_failure_and_unverified_case(self):
        root=self.fixture()
        j.write_json(root/'ablation.json',{'state':'not-submitted','reason':'identical_after_triage'})
        outcomes=j.load_case(self.round,self.fee)
        for arm in outcomes.values():
            self.assertTrue(all(s['state']=='identical_after_triage' and s['sha256'] is None for s in arm))
        slots={k:{'state':'observed','position':p,'sha256':'a'*64,'path':'a'} for p,k in enumerate(j.SLOTS,1)}
        meta={'caseId':'dev-feira','arm':'with','split':'dev','refIds':[],'optionalId':'X','slots':slots}
        fake=[{'slot':k,'usable':True,'reason':'Parecer.', 'attributes':[],
               'criticalFailures':[{'kind':'missing_fact','location':'Local ausente da base.'}]} for k in j.SLOTS]
        row={'case':'P1','slots':fake,'pairs':[{'pair':a+b,'evidence':'Pares.','score':1}
                                                for a,b in j.itertools.combinations(j.SLOTS,2)],'change':'Checar o local.'}
        with self.assertRaisesRegex(ValueError,'falha crítica'):
            j.unblind({'cases':{'P1':meta}},{'cases':[row]})


if __name__=='__main__':
    unittest.main()
