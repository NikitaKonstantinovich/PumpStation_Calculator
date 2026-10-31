import copy, importlib.util, json, sqlite3, sys, tempfile, unittest
from contextlib import closing
from pathlib import Path
FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND/'scripts'))
from onis_spatial import enrich_onis_spatial
spec = importlib.util.spec_from_file_location('apply_onis', FRONTEND/'scripts/apply-onis-spatial-data.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class OnisSpatialTests(unittest.TestCase):
    def fixture(self):
        doc = json.loads((FRONTEND/'data/pump-catalog/onis-spatial-data.json').read_text(encoding='utf-8'))
        pid, fact = next((k,v) for k,v in doc['pumps'].items() if v['series'] == 'INL')
        pump = {**{k:fact[k] for k in ('manufacturer','model','series','article','execution')}, 'id':pid, 'price':123, 'curve':[[0,25],[10,15]], 'dimensions':{}}
        return pump, {'sources':doc['sources'], 'pumps':{pid:fact}}

    def test_identity_dimensions_provenance_idempotence_and_preservation(self):
        p,d = self.fixture();e = {'userNote':'preserve'}
        enrich_onis_spatial(p,e,d); before=copy.deepcopy((p,e));enrich_onis_spatial(p,e,d)
        self.assertEqual((p,e),before);self.assertEqual(p['price'],123);self.assertEqual(p['curve'],[[0,25],[10,15]])
        self.assertEqual(e['userNote'],'preserve');self.assertIn('onisSpatialData',e)
        for key in ('manufacturer','model','series','article','execution'):
            bad=copy.deepcopy(p);bad[key]='different'
            with self.assertRaises(ValueError):enrich_onis_spatial(bad,{},d)

    def test_conflict_rejects_entire_candidate(self):
        p,d=self.fixture();p['dimensions']['overall_height']=1;before=copy.deepcopy(p)
        with self.assertRaises(ValueError):enrich_onis_spatial(p,{},d)
        self.assertEqual(p,before)

    def test_net_mass_validation_and_preservation_of_user_notes(self):
        p,d=self.fixture();f=d['pumps'][p['id']]
        f.update(netWeightKg=32,netWeightPdfPage=16,note='Reviewed drawing',supersedesNotes=['Old import note'])
        p['physicalNote']='User note. Old import note'
        enrich_onis_spatial(p,{},d)
        self.assertEqual(p['weightKg'],32)
        self.assertIn('Нетто',p['physicalDataSources']['Масса'])
        self.assertIn('User note.',p['physicalNote'])
        self.assertNotIn('Old import note',p['physicalNote'])
        for weight in [0,-1,float('nan'),35]:
            bad=copy.deepcopy(d);bad['pumps'][p['id']]['netWeightKg']=weight
            before=copy.deepcopy(p)
            with self.assertRaises(ValueError):enrich_onis_spatial(p,{},bad)
            self.assertEqual(p,before)

    def test_sqlite_catalog_write_second_import_and_failed_identity(self):
        p,d=self.fixture()
        with tempfile.TemporaryDirectory(dir=FRONTEND/'work') as temp:
            root=Path(temp);(root/'frontend/public').mkdir(parents=True);(root/'frontend/data/pump-catalog').mkdir(parents=True);(root/'database').mkdir()
            pp=root/'frontend/public/pumps.json';rp=root/'frontend/data/pump-catalog/records.json'
            pp.write_text(json.dumps([p]),encoding='utf-8');rp.write_text(json.dumps({p['id']:{'custom':'keep'}}),encoding='utf-8')
            (rp.parent/'onis-spatial-data.json').write_text(json.dumps(d),encoding='utf-8')
            with closing(sqlite3.connect(root/'database/pumps-merged.sqlite')) as db, db:
                db.execute('CREATE TABLE catalog_models(id TEXT PRIMARY KEY, model TEXT, payload_json TEXT, evidence_json TEXT)')
                db.execute('CREATE TABLE catalog_metadata(key TEXT PRIMARY KEY,value TEXT)')
                db.execute('INSERT INTO catalog_models VALUES(?,?,?,?)',(p['id'],p['model'],json.dumps(p),json.dumps({'custom':'keep'})))
            self.assertEqual(module.apply(root),[p['id']]);self.assertEqual(module.apply(root),[])
            saved=json.loads(pp.read_text(encoding='utf-8'))[0]
            with closing(sqlite3.connect(root/'database/pumps-merged.sqlite')) as db, db:
                row=db.execute('SELECT payload_json,evidence_json FROM catalog_models').fetchone()
                self.assertEqual(json.loads(row[0]),saved);self.assertEqual(json.loads(row[1])['custom'],'keep')
                db.execute('UPDATE catalog_models SET model=?',('wrong model',))
            old=pp.read_bytes()
            with self.assertRaises(ValueError):module.apply(root)
            self.assertEqual(pp.read_bytes(),old)


if __name__ == '__main__':unittest.main()
