"""Read back a real run's provenance, GLB objects and provisional scale invariants."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
import trimesh


def read(path):return json.loads(path.read_text(encoding='utf-8'))
def digest(path):
    with path.open('rb') as handle:return hashlib.file_digest(handle,'sha256').hexdigest()


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();root=args.project.resolve()
    project=read(root/'project.json');assert project['input']['extra_source_photos']==0
    assert digest(root.parent/project['input']['video'])==project['input']['video_sha256']
    expected={Path(f['file']).name:f['sha256'] for f in project['frames']}
    for f in project['frames']:
        assert digest(root/f['file'])==f['sha256']
        assert 0<=f['source_frame_index']<project['input']['source_frame_count']
        assert 0<=f['source_timestamp_seconds']<=project['input']['duration_seconds']
    task=read(root/'cloud/task.json');assert task['status']==2
    assert {f['file']:f['sha256'] for f in task['input_image_manifest']}==expected
    structure=read(root/'structure/observed_planes.json');assert not structure['measurement_box_generated'];assert not structure['semantic_openings_extracted']
    assert digest(Path(structure['source_mesh']))==structure['source_mesh_sha256']
    scene=trimesh.load_scene(root/'structure/observed_planes.glb',process=False)
    assert set(scene.geometry)=={p['id'] for p in structure['planes']}
    for plane in structure['planes']:
        mesh=scene.geometry[plane['id']]
        error=abs((mesh.vertices-plane['origin'])@plane['normal'])
        assert error.max()<1e-4
    alignment=read(root/'structure/alignment_report.json');transform=np.asarray(alignment['source_to_aligned_y_up'])
    singular=np.linalg.svd(transform[:3,:3],compute_uv=False);assert np.allclose(singular,alignment['uniform_scale'])
    floor,ceiling=[next(p for p in structure['planes'] if p['id']==pid) for pid in alignment['height_reference_planes']]
    coords=trimesh.transform_points([floor['origin'],ceiling['origin']],transform)
    assert abs(coords[0,1])<1e-8;assert abs(coords[1,1]-alignment['known_height_m'])<1e-8
    aligned=trimesh.load_scene(root/'structure/aligned_planes.glb',process=False);assert len(aligned.geometry)==len(structure['planes'])
    cleaned=trimesh.load_scene(root/'structure/cleaned_aligned_scan.glb',process=False).to_geometry();cleanup=read(root/'structure/cleanup_report.json')
    assert len(cleaned.faces)==cleanup['retained_faces']
    assert cleaned.bounds[0,1]>=-.20001 and cleaned.bounds[1,1]<=alignment['known_height_m']+.20001
    assert not alignment['metric_scale_validated'];assert alignment['length_width_check']['passed'] is None
    print(json.dumps({'video_frames_verified':len(expected),'independent_plane_objects_verified':len(scene.geometry),'uniform_height_reference_verified':True,'cleaned_mesh_faces_verified':len(cleaned.faces),'full_room_dimension_check_passed':False}))


if __name__=='__main__':main()
