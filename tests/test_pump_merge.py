"""Importer invariants independent of access to the private reference repository."""
import importlib.util
import unittest
import json
import sqlite3
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location('pump_merge', Path(__file__).resolve().parents[1] / 'scripts/merge-pump-catalogs.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class MergeTests(unittest.TestCase):
    def test_cnp_browser_and_sqlite_physical_records_match(self):
        path = merge.FRONTEND.parent / 'database/pumps-merged.sqlite'
        if not path.exists():
            self.skipTest('Local merged SQLite is not available')
        pumps = merge.read_json(merge.PUBLIC / 'pumps.json')
        with closing(sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            for p in pumps:
                if p['manufacturer'] == 'CNP':
                    row = db.execute('SELECT payload_json FROM catalog_models WHERE id=?',(p['id'],)).fetchone()
                    self.assertEqual(json.loads(row[0]),p,p['model'])

    def test_cnp_enrichment_is_fill_only_idempotent_and_execution_safe(self):
        p = {'id':'x','model':'CHLF2-20','manufacturer':'CNP','weightKg':12,'curve':[[0,20],[2,15]]}
        doc = {'pumps':{'x':{'model':'CHLF2-20','weightKg':9,'inletConnection':'G1',
                           'provenance':{'weightKg':{'source':'selector'},'inletConnection':{'source':'selector'}}}},
               'sources':{'selector':{'title':'CNP selector'}}}
        evidence = {}
        merge.enrich_cnp_physical(p,evidence,doc)
        self.assertEqual(p['weightKg'],12)
        self.assertEqual(p['connectionSourceValue']['inlet'],'G1')
        self.assertEqual(p['curve'],[[0,20],[2,15]])
        self.assertIn('cnpPhysicalData',evidence)
        before = merge.deepcopy(p)
        merge.enrich_cnp_physical(p,evidence,doc)
        self.assertEqual(p,before)
        p['execution'] = 'another-execution'
        with self.assertRaises(ValueError):
            merge.enrich_cnp_physical(p,evidence,doc)

    def test_reviewed_cnp_facts_preserve_group_boundaries_and_source_identity(self):
        data = merge.read_json(merge.DATA / 'cnp-physical-data.json')
        by_model = {r['model']:r for r in data['pumps'].values()}
        for model, weight in [('NIS50-32-160/5.5',105),('NIS80-65-160/11',175),
                              ('NIS65-40-200/2.2',91),('NIS250-200-315/75',840),
                              ('NIS200-150-250G/30',426),('CDM10-1',31),('CDM125-6',777)]:
            self.assertEqual(by_model[model]['weightKg'],weight,model)
        self.assertNotIn('weightKg',by_model['TD100-11/2'])
        self.assertNotIn('40WQ10-7-0.55(II)',by_model)
        for fact in data['pumps'].values():
            for field in ['weightKg','inletDn','outletDn','inletConnection','outletConnection']:
                if field in fact:
                    self.assertIn(fact['provenance'][field]['source'],data['sources'])
        pumps = merge.read_json(merge.PUBLIC / 'pumps.json')
        for p in pumps:
            if p['id'] in data['pumps']:
                self.assertEqual(p['model'],data['pumps'][p['id']]['model'])

    def test_missing_values_do_not_erase_previous_information(self):
        old = {'article': '123', 'dimensions': {'length': 100, 'width': 20}, 'enabled': True}
        incoming = {'article': '—', 'dimensions': {'length': 105, 'width': None, 'height': 200}, 'enabled': False}
        self.assertEqual(merge.supplement(old, incoming), {'article': '123', 'dimensions': {'length': 105, 'width': 20, 'height': 200}, 'enabled': False})
        self.assertEqual(old['dimensions']['length'], 100)

    def test_missing_is_not_zero_or_false(self):
        for value in [None, '', '—', '-', [], {}]:
            self.assertFalse(merge.present(value))
        for value in [0, False, '0']:
            self.assertTrue(merge.present(value))

    def test_model_normalization_does_not_merge_executions(self):
        self.assertEqual(merge.model_key('CHLF(T)15-30'), merge.model_key('CHLF15-30'))
        self.assertEqual(merge.model_key('CDM 32-3'), merge.model_key('CDM32-3'))
        self.assertNotEqual(merge.model_key('CDM32-3'), merge.model_key('CDMF32-3'))
        self.assertNotEqual(merge.model_key('ECH(M)2-30'), merge.model_key('ECH2-30'))

    def test_liters_per_second_are_converted_once(self):
        self.assertEqual(merge.point_rows([{'q_lps': 10, 'h_m': 20}]), [[36, 20]])
        self.assertEqual(merge.point_rows([{'q_m3h': 36, 'q_lps': 10, 'h_m': 20}]), [[36, 20]])

    def test_conflicting_points_are_rejected(self):
        self.assertEqual(merge.curve([[10, 20], [0, 30], [10, 20]]), [[0, 30], [10, 20]])
        for points in [[[10, 20], [10, 21]], [[-1, 30]], [[1, float('nan')]]]:
            with self.assertRaises(ValueError):
                merge.curve(points)

    def test_net_price_is_not_relabelled_as_foreign_list_price(self):
        net = merge.list_price({'price': {'amount': 900, 'currency': 'RUB', 'price_kind': 'calculated_purchase_price'}})
        self.assertEqual(net['priceKind'], 'net')
        self.assertEqual(net['priceCurrency'], 'RUB')
        retail = merge.list_price({'price': {'list_price_cny_vat': 100, 'amount': 585, 'discount_percent': 55}})
        self.assertEqual((retail['price'], retail['priceCurrency'], retail['discountPercent']), (100, 'CNY', 55))


if __name__ == '__main__':
    unittest.main()
