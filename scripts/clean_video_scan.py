"""Conservative height-band cleanup after explicit plane review; preserve raw scan."""
from pathlib import Path
import argparse,json,os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import numpy as np
import trimesh


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();folder=args.project.resolve()/'structure'
    source=json.loads((folder/'observed_planes.json').read_text(encoding='utf-8'));alignment=json.loads((folder/'alignment_report.json').read_text(encoding='utf-8'))
    if source['source_mesh_sha256']!=alignment['source_mesh_sha256']:raise ValueError('Alignment belongs to another scan.')
    transform=np.asarray(alignment['source_to_aligned_y_up']);mesh=trimesh.load_scene(source['source_mesh'],process=False).to_geometry();mesh.apply_transform(transform)
    before=len(mesh.faces);height=alignment['known_height_m'];bounds=[-.2,height+.2]
    keep=(mesh.vertices[:,1]>=bounds[0])&(mesh.vertices[:,1]<=bounds[1]);mesh.update_faces(keep[mesh.faces].all(axis=1));mesh.remove_unreferenced_vertices()
    if not len(mesh.faces):raise ValueError('Height-band cleanup retained no surfaces.')
    mesh.export(folder/'cleaned_aligned_scan.glb')
    points,faces=trimesh.sample.sample_surface(mesh,20000,seed=17);visual=mesh.visual.to_color();colors=np.asarray(visual.vertex_colors)[mesh.faces[faces],:3].mean(axis=1)
    preview={'kind':'surface_sample','metric_scale_applied':True,'metric_scale_validated':False,'units':'m_provisional','points':np.column_stack([points,colors]).round(6).tolist(),'cameras':[]}
    (folder/'cleaned_sample.json').write_text(json.dumps(preview),encoding='utf-8')
    report={'source_mesh_sha256':source['source_mesh_sha256'],'source_faces':before,'retained_faces':len(mesh.faces),'removed_faces':before-len(mesh.faces),'removed_fraction':(before-len(mesh.faces))/before,
        'crop_method':'provisional_height_band_only','y_bounds_m_provisional':bounds,'horizontal_measured_box_crop_applied':False,
        'source_to_aligned_y_up':transform.tolist(),'metric_scale_validated':False,'note':'Only obvious out-of-height geometry was trimmed. Interior ghost/warped surfaces may remain. No wall or opening boundary was filled.'}
    (folder/'cleanup_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))


if __name__=='__main__':main()
