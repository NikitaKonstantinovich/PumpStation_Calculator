import copy,importlib.util,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'frontend/scripts'))
from vertical_physical import enrich_vertical_physical
spec=importlib.util.spec_from_file_location('vertical_audit',ROOT/'frontend/scripts/audit-vertical-pumps.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

class VerticalPhysicalTests(unittest.TestCase):
    def fixture(self):
        p={'id':'x','manufacturer':'Example','model':'P1','type':'inline','weightKg':12,'dimensions':{'D':100},'curve':[[0,20],[5,10]],'price':123}
        d={'sources':{'s':{'title':'Exact catalogue'}},'pumps':{'x':{'manufacturer':'Example','model':'P1','execution':None,'weightKg':15,'dimensions':{'D':110,'H3':500},'provenance':{'weightKg':{'source':'s'},'dimensions':{'source':'s','page':2}}}}}
        return p,d
    def test_preserves_known_facts_and_hydraulics_and_is_idempotent(self):
        p,d=self.fixture();e={};enrich_vertical_physical(p,e,d)
        self.assertEqual((p['weightKg'],p['dimensions']),(12,{'D':100,'H3':500}))
        self.assertEqual((p['curve'],p['price']),([[0,20],[5,10]],123))
        before=copy.deepcopy((p,e));enrich_vertical_physical(p,e,d);self.assertEqual((p,e),before)
    def test_rejects_identity_execution_and_nonpositive_mass(self):
        for field,value in [('model','P2'),('execution','different'),('manufacturer','Other')]:
            p,d=self.fixture();p[field]=value
            with self.assertRaises(ValueError):enrich_vertical_physical(p,{},d)
        p,d=self.fixture();d['pumps']['x']['weightKg']=0
        with self.assertRaises(ValueError):enrich_vertical_physical(p,{},d)
    def test_numeric_dimensions_do_not_accept_temperature_or_mass(self):
        self.assertEqual(audit.numeric_dimensions({'dimensions':{'Масса, кг':3,'temperature':100}}),{})
        self.assertEqual(audit.numeric_dimensions({'dimensions':{'D1':250,'Нетто, кг':3}}),{'D1':250})
    def test_missing_data_stays_visible(self):
        p,d=self.fixture();p.update(series='P',weightKg=None,dimensions={},nominalFlow=5,power=1,inletDn=32,outletDn=32)
        row=audit.audit([p],{},d)[0]
        self.assertIn('масса',row['missing']);self.assertIn('численные размеры',row['missing'])
    def test_exact_reviewed_masses_and_conflicts(self):
        doc=audit.read(ROOT/'frontend/data/pump-catalog/vertical-physical-data.json')
        pumps=audit.read(ROOT/'frontend/public/pumps.json');by_model={(p['manufacturer'],p['model']):p for p in pumps}
        self.assertEqual(by_model['CNP','TD100-11/2']['weightKg'],56)
        self.assertIsNone(by_model['CNP','TD100-29/2'].get('weightKg'))
        for i in range(823,830):
            p=next(p for p in pumps if p['id']==str(i))
            self.assertIsNone(p['drawing']);self.assertIn('не соответствует',p['dataWarnings'][-1])
        self.assertNotIn('weightKg',doc['pumps']['nu-4e14ea94a467cc06'])
        for pid,fact in doc['pumps'].items():
            for field in ['weightKg','nominalFlow','dimensions']:
                if field in fact:self.assertIn(fact['provenance'][field]['source'],doc['sources'])

if __name__=='__main__':unittest.main()
