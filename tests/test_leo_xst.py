"""Source fidelity and repeat-import regression checks for LEO XST."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / 'scripts'))
from leo_xst import attach_catalog, build_catalog, points


class LeoXstTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((APP / 'data/pump-catalog/leo-xst-source.json').read_text(encoding='utf-8-sig'))

    def test_source_frequencies_and_unavailable_executions_are_not_mixed(self):
        pumps, _, report = build_catalog(self.source)
        self.assertEqual(report['models'], 98)
        self.assertEqual(report['selectable'], 61)
        self.assertEqual(report['byFrequencyHz'], {'50': 61, '60': 37})
        for pump in pumps:
            self.assertEqual(pump['selectable'], pump['frequencyHz'] == 50)
            self.assertIsNone(pump['price'])
            self.assertIsNone(pump['priceCurrency'])
            if pump['frequencyHz'] == 60:
                self.assertIsNone(pump['power'])
                self.assertFalse(pump['active'])

    def test_motor_rating_net_weight_pressure_and_packaging_keep_their_source_meanings(self):
        pumps, _, _ = build_catalog(self.source)
        by_model = {p['model']: p for p in pumps}
        first = by_model['XST32-125/7']
        self.assertEqual((first['power'], first['weightKg']), (0.75, 27))
        self.assertEqual(first['dimensions']['Масса брутто, кг'], 33)
        self.assertEqual(first['dimensions']['Упаковочные размеры, мм'], '480 × 255 × 370')
        self.assertEqual(first['fluid']['Максимальное рабочее давление, бар'], 12)
        self.assertEqual((first['inletDn'], first['outletDn']), (50, 32))
        self.assertEqual(first['selectionFlowRange'], [1.25, 22])
        self.assertEqual(first['curve'][4], [12.5, 13.6])
        self.assertEqual(by_model['XST32-125/11']['power'], 1.1)
        self.assertEqual(by_model['XST32-125/11']['powerCurve'][4], [17, 1.15])
        self.assertEqual(by_model['XSTm32-125/7']['electric']['Фазность'], 'Однофазный')

    def test_repeat_import_preserves_other_manufacturers_and_source_ids(self):
        legacy = {'id': 'existing', 'manufacturer': 'CNP', 'model': 'Existing',
                  'price': 17, 'curve': [[1, 12], [5, 4]], 'custom': {'keep': True}}
        pumps, evidence = [deepcopy(legacy)], {'existing': {'custom': {'keep': True}}}
        attach_catalog(pumps, evidence, self.source)
        before = deepcopy((pumps, evidence))
        attach_catalog(pumps, evidence, self.source)
        self.assertEqual((pumps, evidence), before)
        self.assertEqual(pumps[0], legacy)
        self.assertEqual(evidence['existing'], {'custom': {'keep': True}})
        self.assertEqual(len(pumps), 99)
        self.assertIn('leo-xst-2746', evidence)

    def test_invalid_source_curves_and_changed_units_fail_before_import(self):
        for value in ['2|0,1', '2|1,2|1,3', '2|0,1|1,nan', '2|-1,1|2,2']:
            with self.assertRaises(ValueError):
                points(value)
        changed = deepcopy(self.source)
        changed['series'][0]['PumpDefaultParas'] = changed['series'][0]['PumpDefaultParas'].replace('UnitQ:1', 'UnitQ:2')
        with self.assertRaises(ValueError):
            build_catalog(changed)


if __name__ == '__main__':
    unittest.main()
