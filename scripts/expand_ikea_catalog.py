"""Import attributed products and regular CNY prices without changing placements."""
from pathlib import Path
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
import re,json,base64,io,hashlib
from datetime import datetime,timezone
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'单视频流程/试验01/furniture_layout'
PRODUCTS=[
 ('kallax-shelving-unit-white-70351886','kallax','floor',[.765,.39,.765]),
 ('kallax-shelving-unit-white-20351884','kallax','floor',[.765,.39,1.465]),
 ('billy-bookcase-white-10351568','bookcase','floor',[.8,.28,2.02]),
 ('lack-side-table-white-70352939','coffee','floor',[.55,.55,.45]),
 ('lack-coffee-table-white-90449905','coffee','floor',[.9,.55,.45]),
 ('micke-desk-white-80354276','micke','floor',[1.05,.5,.75]),
 ('hektar-he-ke-ta-luo-di-deng-shen-hui-se-00216547','floor_lamp','floor',[.5,.5,1.81]),
 ('hektar-he-ke-ta-diao-deng-shen-hui-se-70390369','pendant','ceiling',[.22,.22,.26]),
 ('hektar-he-ke-ta-3-tou-xi-ding-deng-gui-shen-hui-se-90297488','track_light','ceiling',[.81,.15,.26]),
 ('hektar-he-ke-ta-qiang-mian-jia-shi-she-deng-shen-hui-se-70216539','wall_light','wall',[.15,.2,.2])]
def fetch(slug):
 cache=ROOT/'.cache/ikea-source'/(slug+'.html');cache.parent.mkdir(parents=True,exist_ok=True)
 if not cache.exists():cache.write_bytes(urlopen(Request('https://www.ikea.cn/cn/zh/p/'+slug+'/',headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read())
 s=cache.read_text(encoding='utf8');m=re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>',s,re.S)
 if not m:raise ValueError('No product data: '+slug)
 a=json.loads(m[1])
 def dec(i,depth=0):
  if depth>12:return None
  v=a[i] if isinstance(i,int) and i>=0 else None
  if isinstance(v,dict):return {k:dec(x,depth+1) for k,x in v.items()}
  if isinstance(v,list):return [dec(x,depth+1) for x in v]
  return v
 index=next(i for i,v in enumerate(a) if isinstance(v,dict) and 'productId'in v and 'dimension'in v)
 return dec(index)
def build(row):
 slug,style,mount,fallback=row;p=fetch(slug);article=p['productId'];dims={}
 for d in p['dimension']:
  if '厘米' in d['second']:
   m=re.search(r'[\d.]+',d['second'])
   if m:dims[d['first']]=float(m[0])/100
 result=[dims.get('宽度',dims.get('直径',fallback[0])),dims.get('深度',dims.get('直径',fallback[1])),dims.get('高度',fallback[2])]
 if '长度'in dims and style in ['coffee','micke']:result=[dims['长度'],dims.get('宽度',fallback[1]),dims.get('高度',fallback[2])]
 if style=='track_light':result=[dims.get('长度',fallback[0]),dims.get('宽度',fallback[1]),dims.get('高度',fallback[2])]
 verified=style not in ['pendant','wall_light','track_light','floor_lamp']
 url=p['images'][0]['url'];raw=urlopen(url,timeout=30).read();im=Image.open(io.BytesIO(raw)).convert('RGB');im.thumbnail((480,480));b=io.BytesIO();im.save(b,format='JPEG',quality=85);raw=b.getvalue()
 return {'id':'ikea_'+style+'_'+article,'label':'IKEA '+p['name']+' '+p['type'],'article_number':'.'.join([article[:3],article[3:6],article[6:]]),'brand':'IKEA','style':style,'mount':mount,'dimensions':result,'dimension_source':'manufacturer_official_dimensions' if verified else 'partial_official_dimensions_display_envelope','dimensions_source_verified':verified,'source_dimension_details':p['dimension'],'geometry_type':'dimension_matched_parametric_proxy','geometry_note':'Simplified model; pendant/wall lamp envelope may require confirmation.','color':[.8,.8,.8,1],'source_url':'https://www.ikea.cn/cn/zh/p/'+slug+'/','price_cny':p['price']['regularPrice'],'price_kind':'regular_price_excluding_member_promotions','price_checked_at':datetime.now(timezone.utc).isoformat(),'reference_image':'data:image/jpeg;base64,'+base64.b64encode(raw).decode(),'reference_image_url':url,'reference_image_sha256':hashlib.sha256(raw).hexdigest()}
def main():
 scene=json.loads((FOLDER/'room.scene.json').read_text(encoding='utf8'));assets=scene['assets'];fail=[]
 # Refresh the original three prices too; never infer one from a different variant.
 for a in assets:
  if a.get('brand')=='IKEA':
   try:
    p=fetch(a['source_url'].strip('/').split('/')[-1]);a.update(price_cny=p['price']['regularPrice'],price_kind='regular_price_excluding_member_promotions',price_checked_at=datetime.now(timezone.utc).isoformat())
   except Exception as e:fail.append(str(e))
 with ThreadPoolExecutor(max_workers=5) as pool:
  for row,outcome in zip(PRODUCTS,pool.map(lambda row:attempt(row),PRODUCTS)):
   if isinstance(outcome,dict):
    assets[:]=[a for a in assets if a['id']!=outcome['id']];assets.append(outcome)
   else:fail.append(outcome)
 (FOLDER/'room.scene.json').write_text(json.dumps(scene,ensure_ascii=False,indent=2),encoding='utf8')
 (FOLDER/'catalog/ikea_assets.json').write_text(json.dumps([a for a in assets if a.get('brand')=='IKEA'],ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'ikea_count':len(assets),'failures':fail},ensure_ascii=True))
def attempt(row):
 try:return build(row)
 except Exception as e:return row[0]+': '+str(e)
if __name__=='__main__':main()
