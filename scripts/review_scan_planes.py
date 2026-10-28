"""Apply explicit visual review labels and a provisional, uniform height alignment."""
from pathlib import Path
import argparse,json,os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import numpy as np
import trimesh


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);p.add_argument('--review',type=Path,required=True);args=p.parse_args()
    root=args.project.resolve();folder=root/'structure';data=json.loads((folder/'observed_planes.json').read_text(encoding='utf-8'));review=json.loads(args.review.read_text(encoding='utf-8'))
    if review['source_mesh_sha256']!=data['source_mesh_sha256']:raise ValueError('Review does not match this scan.')
    by_id={p['id']:p for p in data['planes']}
    for label in review['labels']:
        plane=by_id[label['id']];plane.update({'edit_name':label['name'],'semantic_type':label['type'],'semantic_review':label['note'],
            'semantic_source':'visual_review_of_source_triangle_projection_and_video','semantic_verified':False})
    floor=by_id[review['floor_reference']];ceiling=by_id[review['ceiling_reference']];window=by_id[review['window_reference']]
    up=np.asarray(floor['normal']);delta=np.asarray(ceiling['origin'])-floor['origin']
    if up@delta<0:up=-up
    height=float(delta@up);angle=float(np.degrees(np.arccos(np.clip(abs(up@np.asarray(ceiling['normal'])),-1,1))))
    if height<=0 or angle>10:raise ValueError('Height reference planes are not compatible.')
    height_m=json.loads((root/'project.json').read_text(encoding='utf-8'))['measurements_m']['height']
    if height_m is None:raise ValueError('No known height to set a provisional uniform scale.')
    scale=height_m/height
    length=-np.asarray(window['normal']);length-=up*(length@up);length/=np.linalg.norm(length)
    width=np.cross(length,up)
    rotation=np.stack([length,up,width])
    floor_origin=np.asarray(floor['origin']);origin=floor_origin+length*((np.asarray(window['origin'])-floor_origin)@length)
    transform=np.eye(4);transform[:3,:3]=rotation*scale;transform[:3,3]=-rotation@origin*scale
    sample=np.load(folder/'surface_samples.npz');points=sample['points'];normals=sample['normals'];colors=sample['colors']
    aligned=trimesh.transform_points(points,transform)
    floor_keep=(abs((points-floor_origin)@up)<data['parameters']['fit_search_half_thickness']*2.5)&(abs(normals@up)>np.cos(np.deg2rad(22)))
    floor_span=np.quantile(aligned[floor_keep],[.02,.98],axis=0)
    report={'source_mesh_sha256':data['source_mesh_sha256'],'status':'provisional_height_alignment',
        'height_reference_planes':[floor['id'],ceiling['id']],'height_reference_source_distance':height,'reference_plane_angle_deg':angle,
        'known_height_m':height_m,'uniform_scale':scale,'nonuniform_stretch_applied':False,'source_to_aligned_y_up':transform.tolist(),
        'height_is_calibration_constraint_not_independent_validation':True,'metric_scale_validated':False,
        'floor_observed_2_98_percentile_spans_m':(floor_span[1]-floor_span[0]).tolist(),
        'length_width_check':{'passed':None,'reason':'No reliable opposing wall pairs were confirmed. Observed floor extents include partial/warped scan regions and are not clear interior dimensions.'},
        'openings_verified':False,'notes':review['alignment_notes']}
    (folder/'alignment_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'reviewed_planes.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    aligned_data=json.loads(json.dumps(data));aligned_data.update({'coordinate_frame':'provisional_aligned_y_up','units':'m_provisional','metric_scale_applied':True,'metric_scale_validated':False,'alignment':report})
    for plane in aligned_data['planes']:
        plane['origin']=trimesh.transform_points([plane['origin']],transform)[0].tolist();plane['normal']=(rotation@plane['normal']).tolist()
        plane['basis_uv']=(np.asarray(plane['basis_uv'])@rotation.T).tolist()
        for loop in plane['contours']:loop['uv']=(np.asarray(loop['uv'])*scale).tolist()
        plane['fit_rmse_m_provisional']=plane['fit_rmse_source_units']*scale;plane['coordinate_frame']='provisional_aligned_y_up';plane['units']='m_provisional'
        plane['cell_size']*=scale;plane['grid_origin_uv']=(np.asarray(plane['grid_origin_uv'])*scale).tolist()
    (folder/'aligned_planes.json').write_text(json.dumps(aligned_data,ensure_ascii=False,indent=2),encoding='utf-8')
    scene=trimesh.load_scene(folder/'observed_planes.glb',process=False);scene.apply_transform(transform);scene.export(folder/'aligned_planes.glb')
    preview={'kind':'surface_sample','metric_scale_applied':True,'metric_scale_validated':False,'units':'m_provisional',
        'points':np.column_stack([aligned[::max(1,len(aligned)//12000)],colors[::max(1,len(aligned)//12000)]]).round(6).tolist(),'cameras':[]}
    (folder/'aligned_sample.json').write_text(json.dumps(preview),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
