"""Link reconstructed local cameras to exact video frames, without merging fragments."""
from pathlib import Path
import argparse,json
import pycolmap


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();root=args.project.resolve()
    project=json.loads((root/'project.json').read_text(encoding='utf-8'))
    by_name={Path(f['file']).name:f for f in project['frames']};links=[];fragments=[]
    sparse=root/'local/sparse'
    for folder in sorted(sparse.iterdir()):
        if not folder.is_dir() or not (folder/'images.bin').exists():continue
        rec=pycolmap.Reconstruction(folder);model_id=int(folder.name)
        fragments.append({'id':model_id,'coordinate_frame':f'colmap_fragment_{model_id}','units':'arbitrary','images':len(rec.images),'points':len(rec.points3D)})
        for image in rec.images.values():
            f=by_name.get(image.name)
            if not f:raise ValueError('Local model uses a non-video source image.')
            correspondences=[]
            for point in image.points2D:
                if not point.has_point3D():continue
                xyz=rec.points3D[point.point3D_id]
                correspondences.append({'pixel':point.xy.tolist(),'point3d_id':int(point.point3D_id),'xyz':xyz.xyz.tolist(),'error_px':float(xyz.error)})
            links.append({'frame_id':f['id'],'source_frame_index':f['source_frame_index'],'source_timestamp_seconds':f['source_timestamp_seconds'],
                'image':f['file'],'model_id':model_id,'coordinate_frame':f'colmap_fragment_{model_id}',
                'camera_position':image.projection_center().tolist(),'correspondences':correspondences})
    linked={l['frame_id'] for l in links}
    result={'source':'single_video','fragments':fragments,'fragments_aligned':False,'metric_scale_applied':False,
        'registered_unique_frames':len(linked),'unregistered_frames':[f['id'] for f in project['frames'] if f['id'] not in linked],
        'local_source_mapping_verified':True,'cloud_source_mapping_verified':False,'links':sorted(links,key=lambda l:(l['frame_id'],l['model_id']))}
    (root/'frame_pose_links.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'registered_unique_frames':len(linked),'independent_fragments':len(fragments),'fragments_aligned':False}))


if __name__=='__main__':main()
