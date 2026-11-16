import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def module(name, file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
converter=module('collar_converter','convert-collar-cadir.py')
measurement=module('collar_measurement','measure-collar-step.py')
FIXTURE=ROOT/'tests/fixtures/collar-dn100-native.json'
TEMP=ROOT/'work'
TEMP.mkdir(exist_ok=True)

class CollarStepTest(unittest.TestCase):
    def test_native_torus_trim_roundtrip_keeps_real_dimensions_and_volume(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as folder:
            step=Path(folder)/'collar.step'; report=converter.export(FIXTURE,step)
            measured=measurement.measure(step)
            self.assertEqual(len(measured),1)
            self.assertEqual({k:v for k,v in measured[0].items() if k!='volumeMm3'}, {
                'lengthMm':16,'outerDiameterMm':114.3,'innerDiameterMm':110.3,
                'wallThicknessMm':2,'lipOuterDiameterMm':158,'lipThicknessMm':2})
            # The broken direct writer produces ~94560 mm³ and a -6 mm torus
            # extension. This independent volume regression detects that failure.
            self.assertAlmostEqual(measured[0]['volumeMm3'],37988.528968,places=4)
            self.assertGreater(report['bodies'][0]['nativePointCount'],0)

    def test_off_axis_and_missing_boundary_are_rejected(self):
        data=json.loads(FIXTURE.read_text(encoding='utf-8'))
        surface=next(s for s in data['model']['surfaces'] if s['geometry']['kind']=='torus')
        surface['geometry']['center']['y']=1
        with self.assertRaisesRegex(ValueError,'Off-axis'):
            converter.segments_from_body(data['model'],data['model']['bodies'][0])
        data=json.loads(FIXTURE.read_text(encoding='utf-8'))
        surfaces={s['id']:s['geometry'] for s in data['model']['surfaces']}
        missing={f['id'] for f in data['model']['faces'] if surfaces[f['surface']].get('radius')==55.15}
        data['model']['shells'][0]['members']=[m for m in data['model']['shells'][0]['members'] if m['id'] not in missing]
        with self.assertRaises(ValueError):
            converter.segments_from_body(data['model'],data['model']['bodies'][0])

    def test_no_display_crosscheck_cannot_silently_pass(self):
        data=json.loads(FIXTURE.read_text(encoding='utf-8')); data['model']['tessellations']=[]
        with tempfile.TemporaryDirectory(dir=TEMP) as folder:
            src=Path(folder)/'source.json';src.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'Native trim validation failed'):
                converter.export(src,Path(folder)/'out.step')

if __name__=='__main__': unittest.main()
