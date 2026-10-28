"""Provenance and geometric acceptance checks; no provider calls."""
import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prepare_video_project import parse_timeline,choose_structure_frames
from extract_scan_planes import extract


class ProvenanceTests(unittest.TestCase):
    def test_selected_timestamp_is_decoded_source_time(self):
        log='''[showinfo@source @ x] n: 7 pts: 700 pts_time:0.233333 checksum:ABCD
[showinfo@sample @ x] n: 0 pts: 0 pts_time:0 checksum:ABCD'''
        result=parse_timeline(log,2)
        self.assertEqual(result[1]['source_frame_index'],7)
        self.assertAlmostEqual(result[1]['source_timestamp_seconds'],.233333)

    def test_missing_source_checksum_is_rejected(self):
        with self.assertRaises(ValueError):parse_timeline('[showinfo@sample @ x] n: 0 pts: 0 pts_time:0 checksum:ABCD',2)

    def test_reference_selection_covers_timeline(self):
        frames=[{'id':i,'sharpness_laplacian_variance':i%5} for i in range(71)]
        selected=choose_structure_frames(frames)
        self.assertEqual(len(selected),12)
        self.assertLess(selected[0]['id'],6)
        self.assertGreater(selected[-1]['id'],64)


class GeometryTests(unittest.TestCase):
    def test_two_offset_planes_recovered_without_measurement_box(self):
        rng=np.random.default_rng(1)
        a=np.column_stack([rng.uniform(0,4,5000),rng.uniform(0,2,5000),rng.normal(0,.001,5000)])
        b=np.column_stack([rng.uniform(0,4,5000),rng.uniform(0,2,5000),3+rng.normal(0,.001,5000)])
        points=np.vstack([a,b]);normals=np.tile([0.,0.,1.],(len(points),1));colors=np.full((len(points),3),160,np.uint8)
        planes,_,_=extract(points,normals,colors)
        self.assertEqual(len(planes),2)
        self.assertTrue(any(abs(p['origin'][2])<.01 for p in planes))
        self.assertTrue(any(abs(p['origin'][2]-3)<.01 for p in planes))
        for p in planes:
            self.assertFalse(p['dimensions_verified'])
            self.assertFalse(p['semantic_verified'])
            self.assertLess(p['fit_rmse_source_units'],.005)
            self.assertEqual(p['source'],'scan_surface_plane_fit')


if __name__=='__main__':unittest.main()
