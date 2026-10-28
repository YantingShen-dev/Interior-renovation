"""Fit editable, observed plane patches to a scan; never create a measured room box."""
from __future__ import annotations
import argparse,json,os,hashlib
from pathlib import Path
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import cv2
import numpy as np
import trimesh
from PIL import Image,ImageDraw


def fit_plane(points):
    center=points.mean(axis=0)
    _,_,vh=np.linalg.svd(points-center,full_matrices=False)
    n=vh[-1];return center,n,float(np.sqrt(np.mean(((points-center)@n)**2)))


def frame_for_normal(normal):
    helper=np.eye(3)[np.argmin(np.abs(normal))]
    u=np.cross(normal,helper);u/=np.linalg.norm(u)
    return np.array([u,np.cross(normal,u)])


def extract(points,normals,colors):
    """Return fitted patches in the source coordinate frame, with occupancy boundaries."""
    rng=np.random.default_rng(17)
    extent=np.linalg.norm(np.quantile(points,.99,axis=0)-np.quantile(points,.01,axis=0))
    if not np.isfinite(extent) or extent<=0:raise ValueError('Degenerate scan bounds.')
    thickness=extent*.0035
    test=normals[rng.choice(len(normals),min(8000,len(normals)),replace=False)]
    candidates=test[rng.choice(len(test),min(360,len(test)),replace=False)]
    counts=(np.abs(candidates@test.T)>np.cos(np.deg2rad(10))).sum(axis=1)
    modes=[]
    for idx in np.argsort(counts)[::-1]:
        n=candidates[idx]
        if any(abs(n@m)>np.cos(np.deg2rad(22)) for m in modes):continue
        selected=normals[np.abs(normals@n)>np.cos(np.deg2rad(12))]
        _,vectors=np.linalg.eigh(selected.T@selected);n=vectors[:,-1]
        if n[np.argmax(abs(n))]<0:n=-n
        modes.append(n)
        if len(modes)==6:break
    patches=[];masks=[]
    for family,n in enumerate(modes):
        aligned=abs(normals@n)>np.cos(np.deg2rad(14));values=points[aligned]@n
        if len(values)<400:continue
        low,high=np.quantile(values,[.005,.995]);bins=max(30,min(400,int((high-low)/thickness)))
        hist,edges=np.histogram(values,bins=bins,range=(low,high))
        smooth=np.convolve(hist,[.2,.6,.2],mode='same');peaks=[]
        for index in np.argsort(smooth)[::-1]:
            offset=(edges[index]+edges[index+1])/2
            if any(abs(offset-o)<thickness*5 for o in peaks):continue
            mask=aligned&(abs(points@n-offset)<thickness*1.8)
            if mask.sum()<max(400,len(points)*.005):continue
            center,refined,rmse=fit_plane(points[mask])
            if refined@n<0:refined=-refined
            if abs(refined@n)<np.cos(np.deg2rad(10)):continue
            basis=frame_for_normal(refined);uv=(points[mask]-center)@basis.T
            lo,hi=np.quantile(uv,[.005,.995],axis=0)
            cell=max(hi-lo)/150
            if cell<=0:continue
            shape=np.ceil((hi-lo)/cell).astype(int)+5
            pix=np.floor((uv-lo)/cell).astype(int)+2
            valid=((pix>=0)&(pix<shape)).all(axis=1)
            occupancy=np.zeros((shape[1],shape[0]),np.uint8);occupancy[pix[valid,1],pix[valid,0]]=255
            # Close only tiny sampling gaps; large missing regions remain unknown.
            occupancy=cv2.morphologyEx(occupancy,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
            number,labels,stats,_=cv2.connectedComponentsWithStats(occupancy)
            keep=[i for i in range(1,number) if stats[i,cv2.CC_STAT_AREA]>=max(30,occupancy.size*.002)]
            occupancy=np.where(np.isin(labels,keep),255,0).astype(np.uint8)
            contours,hierarchy=cv2.findContours(occupancy,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
            if not contours:continue
            boundaries=[]
            for i,contour in enumerate(contours):
                if abs(cv2.contourArea(contour))<8:continue
                simplified=cv2.approxPolyDP(contour,1.2,True).reshape(-1,2)
                uv_loop=(simplified-2+.5)*cell+lo
                boundaries.append({'kind':'outer' if hierarchy[0,i,3]<0 else 'unknown_gap','uv':uv_loop.round(7).tolist()})
            if not boundaries:continue
            identifier=f'plane_{len(patches):02d}'
            patches.append({'id':identifier,'family':family,'semantic_type':'unclassified','semantic_verified':False,
                'origin':center.tolist(),'normal':refined.tolist(),'basis_uv':basis.tolist(),
                'fit_rmse_source_units':rmse,'sample_support':int(mask.sum()),'contours':boundaries,
                'coordinate_frame':'source_mesh','units':'unverified','dimensions_verified':False,
                'source':'scan_surface_plane_fit','boundary_method':'sample_occupancy_150_cells_morph_close_3',
                'gap_policy':'Missing scan regions are unknown, not confirmed doors or windows.',
                'cell_size':float(cell),'grid_origin_uv':lo.tolist(),'grid_padding':2})
            masks.append((occupancy,mask,colors[mask],uv))
            peaks.append(offset)
            if len(peaks)==4:break
    return patches,masks,{'normal_families':[n.tolist() for n in modes],'fit_search_half_thickness':thickness*1.8}


def save_results(out,points,normals,colors,source):
    out.mkdir(parents=True,exist_ok=True)
    patches,masks,parameters=extract(points,normals,colors)
    scene=trimesh.Scene();palette=[[92,179,201,230],[218,180,91,230],[138,181,128,230],[175,144,198,230]]
    cols=4;w,h=460,390;sheet=Image.new('RGB',(w*cols,h*max(1,(len(patches)+cols-1)//cols)),'#101827');draw=ImageDraw.Draw(sheet)
    for i,(p,(occupancy,mask,cs,uv)) in enumerate(zip(patches,masks)):
        ys,xs=np.nonzero(occupancy)
        # Every occupied cell is a planar quad; unknown gaps stay unfilled.
        grid=np.stack([xs,ys],axis=1)[:,None,:]+np.array([[0,0],[1,0],[1,1],[0,1]])[None,:,:]
        flat=(grid.reshape(-1,2)-2)*p['cell_size']+p['grid_origin_uv']
        vertices=np.asarray(p['origin'])+flat@np.asarray(p['basis_uv'])
        indices=np.arange(len(xs))[:,None]*4+np.array([[0,1,2,0,2,3]])
        mesh=trimesh.Trimesh(vertices,indices.reshape(-1,3),process=True)
        mesh.visual.vertex_colors=np.tile(palette[p['family']%len(palette)],(len(mesh.vertices),1))
        mesh.metadata.update({'plane_id':p['id'],'source':'scan_surface_plane_fit','semantic_type':'unclassified','dimensions_verified':False})
        scene.add_geometry(mesh,node_name=p['id'],geom_name=p['id'])
        tile=np.full((320,440,3),[16,24,39],np.uint8)
        low,high=np.quantile(uv,[.005,.995],axis=0);scale=min(410/max(high[0]-low[0],1e-8),285/max(high[1]-low[1],1e-8))
        pixel=(uv-(low+high)/2)*[scale,-scale]+[220,160]
        for (x,y),c in zip(pixel.astype(int),cs):
            if 1<=x<439 and 1<=y<319:cv2.circle(tile,(int(x),int(y)),1,tuple(int(v) for v in c),-1)
        for loop in p['contours']:
            xy=(np.asarray(loop['uv'])-(low+high)/2)*[scale,-scale]+[220,160]
            cv2.polylines(tile,[xy.astype(np.int32)],True,(243,182,80) if loop['kind']=='outer' else (230,90,125),1)
        Image.fromarray(tile).save(out/(p['id']+'.jpg'),quality=92)
        x,y=i%cols*w,i//cols*h;sheet.paste(Image.fromarray(tile),(x+10,y+45))
        draw.text((x+12,y+8),f"{p['id']} | family {p['family']} | {p['sample_support']} samples",fill='white')
        draw.text((x+12,y+26),f"RMSE {p['fit_rmse_source_units']:.4f} | source units",fill='#a5c2d5')
    if patches:scene.export(out/'observed_planes.glb')
    sheet.save(out/'plane_overview.jpg',quality=93)
    with Path(source).open('rb') as handle:digest=hashlib.file_digest(handle,'sha256').hexdigest()
    model={'schema_version':'observed-scan-planes-1','source_mesh':str(source),'source_mesh_sha256':digest,'metric_scale_applied':False,
        'measurement_box_generated':False,'semantic_openings_extracted':False,'parameters':parameters,'planes':patches}
    (out/'observed_planes.json').write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf-8')
    np.savez_compressed(out/'surface_samples.npz',points=points,normals=normals,colors=colors)
    print(json.dumps({'observed_plane_patches':len(patches),'measurement_box_generated':False,'output':str(out)},ensure_ascii=False),flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--mesh',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--samples',type=int,default=160000);args=p.parse_args()
    mesh=trimesh.load_scene(args.mesh,process=False).to_geometry()
    points,faces=trimesh.sample.sample_surface(mesh,args.samples,seed=17)
    visual=mesh.visual.to_color()
    colors=np.asarray(visual.vertex_colors)[mesh.faces[faces],:3].mean(axis=1).astype(np.uint8)
    save_results(args.output.resolve(),points,mesh.face_normals[faces],colors,args.mesh.resolve())


if __name__=='__main__':main()
