"""Project actual textured scan triangles near each fitted plane for visual review."""
from pathlib import Path
import argparse,json,os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
import numpy as np
import trimesh,cv2
from PIL import Image,ImageDraw


def main():
    p=argparse.ArgumentParser();p.add_argument('--structure',type=Path,required=True);args=p.parse_args();out=args.structure.resolve()
    data=json.loads((out/'observed_planes.json').read_text(encoding='utf-8'))
    mesh=trimesh.load_scene(data['source_mesh'],process=False).to_geometry()
    centers=mesh.triangles_center;normals=mesh.face_normals;colors=np.asarray(mesh.visual.to_color().vertex_colors)[:,:3]
    width,height=700,540;sheet=Image.new('RGB',(width*3,height*((len(data['planes'])+2)//3)),'#101827');draw=ImageDraw.Draw(sheet)
    for i,plane in enumerate(data['planes']):
        n=np.asarray(plane['normal']);origin=np.asarray(plane['origin']);basis=np.asarray(plane['basis_uv'])
        delta=abs((centers-origin)@n)
        faces=np.flatnonzero((abs(normals@n)>np.cos(np.deg2rad(22)))&(delta<data['parameters']['fit_search_half_thickness']*2.5))
        uv=(centers[faces]-origin)@basis.T;lo,hi=np.quantile(uv,[.005,.995],axis=0);scale=min(660/max(hi[0]-lo[0],1e-8),460/max(hi[1]-lo[1],1e-8))
        tile=np.full((490,680,3),[16,24,39],np.uint8)
        for f in faces[np.argsort(delta[faces])[::-1]]:
            ids=mesh.faces[f];xy=((mesh.vertices[ids]-origin)@basis.T-(lo+hi)/2)*[scale,-scale]+[340,245]
            cv2.fillConvexPoly(tile,np.round(xy).astype(np.int32),tuple(int(v) for v in colors[ids].mean(axis=0)))
        Image.fromarray(tile).save(out/(plane['id']+'_texture.jpg'),quality=94)
        x,y=i%3*width,i//3*height;sheet.paste(Image.fromarray(tile),(x+10,y+35));draw.text((x+12,y+8),f"{plane['id']} | family {plane['family']} | {len(faces)} source triangles",fill='white')
    sheet.save(out/'textured_plane_overview.jpg',quality=93);print('Projected scan triangles for semantic review.',flush=True)


if __name__=='__main__':main()
