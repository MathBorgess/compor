import unittest
import fixed_control as f


class FixedPixelAssessment(unittest.TestCase):
    def test_no_pair_abstains_and_hides_price_and_usability_when_unknown(self):
        case={'caseId':'c','optionalId':'optional','arms':{
            'with':{'state':'observed','sha256':'a','estimatedUsd':0.003},
            'without':{'state':'missing_file','sha256':None,'estimatedUsd':None}}}
        orig={'c':case}
        for arm in f.j.ARMS:
            meta={'caseId':'c','shown':False,'sha256':None,'arm':arm,'refIds':['optional']}
            answer={'cases':[{'case':'P1','slots':[],'pairs':[],'change':'Sem par observado.'}]}
            _,_,bound=f.unblind({'cases':{'P1':meta}},answer,orig)[0]
            self.assertIsNone(bound['usable'])
            self.assertIsNone(bound['attributes'][0]['score'])
            case['arms'][arm]=bound
        report=f.stats([case])
        self.assertEqual(report['arms']['with']['observed'],0)
        self.assertEqual(report['arms']['with']['knownSubtotalUsd'],.003)
        self.assertIsNone(report['arms']['without']['imageCostUsd'])
        self.assertIsNone(report['fullCaseMacroDelta'])

    def test_same_optional_scored_twice_and_lookup_resists_unrelated_hash_or_absent_attribute(self):
        case={'caseId':'c','optionalId':'optional','arms':{
            'with':{'state':'observed','sha256':'a','estimatedUsd':.003},
            'without':{'state':'observed','sha256':'b','estimatedUsd':.002}}}
        for arm,score in [('with',2),('without',0)]:
            meta={'caseId':'c','shown':True,'sha256':case['arms'][arm]['sha256'],'arm':arm,'refIds':['fixed','optional']}
            slot={'slot':'A','usable':True,'criticalFailures':[],'attributes':[
                {'ref':'R1','score':2,'evidence':'Símbolo central.'},
                {'ref':'R2','score':score,'evidence':'Cor visível no fundo.'}],'reason':'Texto legível.'}
            result={'cases':[{'case':'P1','slots':[slot],'pairs':[],'change':'Aumentar o selo.'}]}
            index={'cases':{'P1':meta}}
            case['arms'][arm]=f.unblind(index,result,{'c':case})[0][2]
            meta['sha256']='different'
            with self.assertRaisesRegex(ValueError,'divergente'):
                f.unblind(index,result,{'c':case})
            meta['sha256']=case['arms'][arm]['sha256']
            slot['attributes'].pop()
            with self.assertRaisesRegex(ValueError,'Unidades'):
                f.unblind(index,result,{'c':case})
        report=f.stats([case])
        self.assertEqual(report['fullCaseMacroDelta'],1)
        self.assertEqual(report['cases'][0]['attributes'][1]['delta'],2)
        self.assertEqual(report['arms']['with']['imageUsdPerUsable'],.003)
