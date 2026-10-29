import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("cdm_flow_audit", Path(__file__).resolve().parents[1] / "scripts/audit-cdm-flow.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CdmFlowAuditTests(unittest.TestCase):
    def setUp(self):
        # Actual lower-casing arrow vertices from CDM20-5 STEP face 247.
        self.arrow = [[8,105.5,-97.171241], [8,101.339746,-97.171241],
                      [-23,105.5,-94.748351], [-23,114.5,-94.748351],
                      [8,114.5,-97.171241], [8,118.660254,-97.171241],
                      [23,110,-94.748351]]

    def test_actual_cdm20_marker_points_positive_x(self):
        self.assertEqual(audit.arrow_direction(self.arrow), 1)

    def test_reversed_marker_is_not_silently_assumed_positive(self):
        self.assertEqual(audit.arrow_direction([[-x,y,z] for x,y,z in self.arrow]), -1)

    def test_cylinder_seam_can_split_shaft_without_reversing_head(self):
        partial = [[0 if x == -23 else x,y,z] for x,y,z in self.arrow]
        self.assertEqual(audit.arrow_direction(partial), 1)

    def test_model_height_and_projection_side_do_not_change_direction(self):
        self.assertEqual(audit.arrow_direction([[x,y+100,-z] for x,y,z in self.arrow]), 1)

    def test_hexagonal_plug_is_not_a_flow_marker(self):
        plug = [[5.196152,77,109.5],[0,74,109.5],[5.196152,83,109.5],
                [0,86,109.5],[-5.196152,83,109.5],[-6,80,109.5],[-5.196152,77,109.5]]
        self.assertIsNone(audit.arrow_direction(plug))

    def test_incomplete_and_distorted_outlines_are_inconclusive(self):
        self.assertIsNone(audit.arrow_direction(self.arrow[:-1]))
        distorted = [v.copy() for v in self.arrow]
        distorted[-1][1] += 3
        self.assertIsNone(audit.arrow_direction(distorted))


if __name__ == "__main__":
    unittest.main()
