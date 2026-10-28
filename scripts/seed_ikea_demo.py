"""Import a small, source-attributed IKEA catalogue and seed a test layout."""
from pathlib import Path
from urllib.request import Request,urlopen
import argparse,base64,hashlib,json,re,html
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[1]
PRODUCTS=[
 {'id':'ikea_micke_80354281','label':'IKEA MICKE 米克书桌','article_number':'803.542.81','dimensions':[.73,.50,.75],'source_dimensions_cm':[73,50,75],'style':'micke','mount':'floor','color':[.94,.94,.92,1],
  'source_url':'https://www.ikea.cn/cn/zh/p/micke-desk-white-80354281/','cache_name':'micke'},
 {'id':'ikea_ps2026_chair_20617959','label':'IKEA PS 2026 彩色折叠椅','article_number':'206.179.59','dimensions':[.45,.51,.76],'source_dimensions_cm':[45,51,76],'style':'ps2026_chair','mount':'floor','color':[.2,.42,.68,1],
  'source_url':'https://www.ikea.cn/cn/zh/p/ikea-ps-2026-zhe-die-yi-hua-mu-lan-se-hei-se-hong-se-20617959/','cache_name':'ps_chair'},
 {'id':'ikea_rashult_70486668','label':'IKEA RÅSHULT 拉舍手推车','article_number':'704.866.68','dimensions':[.28,.38,.65],'source_dimensions_cm':[28,38,65],'source_dimension_axes':['length','width','height'],'style':'trolley','mount':'floor','color':[.49,.61,.52,1],
  'source_url':'https://www.ikea.cn/cn/zh/p/rashult-la-she-shou-tui-che-hui-lu-se-70486668/','cache_name':'rashult'}
]


def main():
    p=argparse.ArgumentParser();p.add_argument('--project',type=Path,required=True);args=p.parse_args();project=args.project.resolve();folder=project/'furniture_layout';catalog=folder/'catalog';catalog.mkdir(exist_ok=True)
    assets=[]
    for product in PRODUCTS:
        item={k:v for k,v in product.items() if k!='cache_name'};cache=ROOT/'.cache/ikea-source'/(product['cache_name']+'.html')
        if cache.exists():body=cache.read_text(encoding='utf-8')
        else:
            with urlopen(Request(item['source_url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as r:body=r.read().decode('utf-8')
        match=re.search(r'<meta\s+name="og:image"\s+content="([^"]+)"',body)
        if not match:raise ValueError('Product page has no identifiable primary image.')
        image_url=html.unescape(match.group(1));image_path=catalog/(item['id']+'.jpg')
        if not image_url.startswith('https://file.app.ikea.cn/'):raise ValueError('Unexpected image host.')
        if not image_path.exists():
            with urlopen(image_url,timeout=30) as response:image_path.write_bytes(response.read())
        from PIL import Image
        with Image.open(image_path) as image:image.verify()
        item.update({'brand':'IKEA','dimension_source':'manufacturer_official_dimensions','dimensions_source_verified':True,'dimensions_physically_measured':False,
            'source_retrieved_utc':datetime.now(timezone.utc).isoformat(),'reference_image_url':image_url,
            'reference_image_sha256':hashlib.sha256(image_path.read_bytes()).hexdigest(),'reference_image':'data:image/jpeg;base64,'+base64.b64encode(image_path.read_bytes()).decode('ascii'),
            'geometry_type':'dimension_matched_parametric_proxy','geometry_note':'Official outer dimensions; simplified display geometry, not a manufacturer-supplied mesh or image-to-3D reconstruction.'})
        assets.append(item)
    (catalog/'ikea_assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
    scene=json.loads((folder/'room.scene.json').read_text(encoding='utf-8'))
    if any(f.get('purpose')!='test_layout_not_final_office_plan' and f.get('asset_id') not in {a['id'] for a in assets} for f in scene['furniture']):raise ValueError('Current layout has non-demo furniture; retain it and import the catalogue separately.')
    scene['assets']=[a for a in scene.get('assets',[]) if a['id'] not in {v['id'] for v in assets}]+assets
    scene['layout_settings'].update({'catalog_revision':'ikea-sample-v1','scenario':'ikea_test_area_function_verification'})
    placements=[('ikea_test_desk',assets[0],[1.55,.27,0],0),('ikea_test_chair',assets[1],[2.18,.28,0],90),('ikea_test_trolley',assets[2],[2.70,.24,0],0)]
    scene['furniture']=[{'id':identifier,'label':asset['label'],'kind':'furniture','asset_id':asset['id'],'mount':'floor','dimensions':asset['dimensions'],'position':position,'rotation_deg':angle,
        'dimension_source':'manufacturer_official_dimensions','source_url':asset['source_url'],'article_number':asset['article_number'],'purpose':'test_layout_not_final_office_plan'} for identifier,asset,position,angle in placements]
    scene['provenance'].update({'furniture_stage':'official_dimension_ikea_parametric_proxies','furniture_sources':[a['source_url'] for a in assets],'image_to_3d_provider_used':False})
    (folder/'room.scene.json').write_text(json.dumps(scene,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'ikea_assets':len(assets),'reference_images_verified':len(assets),'provider_calls':0}))


if __name__=='__main__':main()
