"""Conservative metric crop, direction correction and independent horizontal checks."""
from pathlib import Path
import json
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"重建小样/room_editable_v1"
SOURCE=ROOT/"重建小样/kiri_3dgs_images/unpacked/3DModel.glb"


def main():
    candidates=json.loads((OUT/"candidate_dimensions.json").read_text())
    planes=candidates["raw_plane_offsets"]
    scale=candidates["uniform_scale_m_per_raw_unit"]
    basis=np.load(OUT/"manhattan_basis.npy")
    rotation=basis[[2,0,1]]
    transform=np.eye(4);transform[:3,:3]=scale*rotation
    transform[:3,3]=-scale*np.array([planes["window_end"],planes["side_a"],planes["floor"]])
    assert np.isclose(np.linalg.det(rotation),1,atol=1e-6)
    scene=trimesh.load_scene(SOURCE,process=False);mesh=scene.to_geometry()
    original_faces=len(mesh.faces)
    mesh.apply_transform(transform)
    lower=np.array([-.15,-.15,-.10]);upper=np.array([4.70,2.65,3.15])
    inside=((mesh.vertices>=lower)&(mesh.vertices<=upper)).all(axis=1)
    face_mask=inside[mesh.faces].all(axis=1)
    mesh.update_faces(face_mask);mesh.remove_unreferenced_vertices()
    # GLB uses Y-up; scene JSON and PLY retain the explicit right-handed Z-up frame.
    export_transform=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],dtype=float)
    exported=trimesh.Scene();exported.add_geometry(mesh,node_name="scan_room",geom_name="scan_room",transform=export_transform)
    exported.export(OUT/"cleaned_scan.glb")
    pts,faces=trimesh.sample.sample_surface(mesh,40000,seed=9)
    visual=mesh.visual.to_color();rgb=np.asarray(visual.vertex_colors)[mesh.faces[faces],:3].mean(axis=1).clip(0,255).astype(np.uint8)
    trimesh.points.PointCloud(pts,colors=rgb).export(OUT/"cleaned_points.ply")
    (OUT/"cleaned_points.json").write_text(json.dumps(np.column_stack([pts,rgb]).round(5).tolist()),encoding="utf-8")
    np.savez_compressed(OUT/"cleaned_samples.npz",points=pts,normals=mesh.face_normals[faces],colors=rgb)
    raw=np.load(OUT/"analysis_samples.npz")
    aligned=trimesh.transform_points(raw["points"],transform)
    normals=raw["normals"]@rotation.T
    width_checks=[]
    for center in np.arange(.5,3.6,.5):
        mask=(abs(aligned[:,0]-center)<.22)&(aligned[:,1]>.9)&(aligned[:,1]<3)&(aligned[:,2]>.4)&(aligned[:,2]<2.6)&(abs(normals[:,1])>.80)
        values=aligned[mask,1]
        if len(values)<20:continue
        bins=np.arange(.9,3.01,.04);hist,edges=np.histogram(values,bins=bins)
        peak=hist.argmax();mid=(edges[peak]+edges[peak+1])/2
        local=values[abs(values-mid)<.08]
        width_checks.append({"length_position_m":round(float(center),2),"observed_side_b_m":round(float(np.median(local)),3),"support_samples":len(local)})
    # Window bounding candidate from dark frame/rail texture on the observed end plane.
    colors=raw["colors"]
    mask=(abs(aligned[:,0])<.20)&(aligned[:,1]>-.05)&(aligned[:,1]<2.1)&(aligned[:,2]>.10)&(aligned[:,2]<2.95)&(colors.mean(axis=1)<115)
    dark=aligned[mask]
    window_bounds=np.quantile(dark[:,1:],[.03,.97],axis=0).tolist() if len(dark)>30 else None
    report={"coordinate_system":"right_handed_z_up","units":"meter","uniform_scale_source":"user_height_3m_between_observed_floor_and_ceiling_modes","uniform_scale_m_per_source_unit":scale,"world_to_metric_transform":transform.tolist(),"glb_z_up_to_y_up_transform":export_transform.tolist(),"source_faces":original_faces,"cleaned_faces":len(mesh.faces),"removed_faces":original_faces-len(mesh.faces),"crop_bounds_m":[lower.tolist(),upper.tolist()],"crop_note":"Conservative observed-scan crop; deliberately larger than the measured 4 x 1.8 m footprint to retain warped walls.","known_room_dimensions_m":[4.0,1.8,3.0],"independent_side_b_width_checks":width_checks,"raw_automatic_end_plane_length_m":candidates["estimated_length_m"],"raw_automatic_end_plane_rejected":True,"raw_automatic_side_plane_width_m":candidates["estimated_width_m"],"rectangular_scan_validation_passed":False,"window_dark_frame_candidate_bounds_yz_m":window_bounds,"window_dark_frame_support_samples":len(dark),"semantics_note":"Room directions visually confirmed against tile floor, ceiling pipes, window and wall 16; openings require photo-assisted review."}
    (OUT/"cleanup_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))


if __name__=="__main__":main()
