import copy, importlib.util, json, sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
spec = importlib.util.spec_from_file_location('mbl_import', ROOT/'scripts/import-onis-mbl2026.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class MblWorkbookTests(unittest.TestCase):
    def test_short_schema_and_mounting_holes(self):
        row = ['MBL 32-125-0.75/2E',80,70,435,140,191,112,257,'4*14'] + [None]*6
        model, layout, headers, cells, d = m.parse_row(row)
        self.assertEqual(layout,'small'); self.assertNotIn('H',d)
        self.assertEqual(d['H1'],112); self.assertEqual(d['H2'],257)
        self.assertNotIn('S',d)
        self.assertEqual(m.spatial_from_dimensions(d,layout,'test')['ports'][1]['point'],[80,0,145])
        for change in [(7,None),(8,56),(6,True)]:
            bad=copy.deepcopy(row);bad[change[0]]=change[1]
            with self.assertRaises(ValueError):m.parse_row(bad)

    def test_large_motor_is_not_discharge_and_axial_w_is_not_width(self):
        d={'A':128,'D':785,'F':353,'K':350,'Y':314,'H':448,'H1':200,'H2':488,'W':1000}
        s=m.spatial_from_dimensions(d,'large','test')
        self.assertEqual(s['boundsMm'],[0,-176.5,-200,785,176.5,288])
        self.assertEqual(s['ports'][1]['point'],[128,0,248])

    def fixture(self):
        doc=json.loads((ROOT/'data/pump-catalog/onis-spatial-data.json').read_text(encoding='utf8'))
        pumps=json.loads((ROOT/'public/pumps.json').read_text(encoding='utf8'))
        facts=[f for f in doc['pumps'].values() if f.get('source')==m.SOURCE_KEY]
        rows=[[f['model']]+f['sourceRow'] for f in facts]
        return doc,pumps,rows

    def test_whole_scope_rejects_missing_duplicate_unknown_and_old_series(self):
        doc,pumps,rows=self.fixture()
        for bad in [rows[:-1],rows+[rows[0]],[['MBL 32-160-1.5/2']+rows[0][1:]]+rows[1:]]:
            with self.assertRaises(ValueError):m.prepare_document(pumps,doc,[('test',bad)],{})

    def test_no_weights_prices_or_non_mbl_changes_and_repeat_preparation(self):
        doc,pumps,rows=self.fixture(); before=copy.deepcopy(pumps)
        new=m.prepare_document(pumps,doc,[('test',rows)],doc['sources'][m.SOURCE_KEY])
        self.assertEqual(pumps,before)
        self.assertEqual(m.prepare_document(pumps,new,[('test',rows)],new['sources'][m.SOURCE_KEY]),new)
        for p in pumps:
            if p.get('series')!='MBL (2026)':
                self.assertEqual(new['pumps'].get(p['id']),doc['pumps'].get(p['id']))
            else:
                self.assertNotIn('netWeightKg',new['pumps'][p['id']])


if __name__=='__main__':unittest.main()
