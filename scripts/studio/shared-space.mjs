import {upgradeVideoStudy} from './video-study-upgrade.mjs';
// Import the local video study once per browser; never replace an edited copy.
export async function receiveSharedSpace({projects,readRecord,writeRecords,fetch,explicit=false}){
 const marker='shared-space:assistant-video-v1';
 const savedId=await readRecord(marker);
 if(savedId){const item=projects.find(p=>p.id===savedId&&!p.deleted_at);if(item||!explicit)return {item,imported:false};}
 const response=await fetch('/api/shared-spaces/assistant-video');
 if(response.status===404)return {};
 if(!response.ok)throw new Error('视频初稿读取失败');
 const source=await response.json();
 const existing=projects.find(p=>p.kind==='space'&&!p.deleted_at&&p.scene.provenance?.model_type===source.scene.provenance.model_type&&p.scene.provenance?.source_video_sha256===source.scene.provenance.source_video_sha256);
 if(existing){await writeRecords([[marker,existing.id]]);return {item:existing,imported:false};}
 const id='assistant_video_'+crypto.randomUUID();
 const item={id,kind:'space',name:source.name,scene:upgradeVideoStudy(source.scene),thumbnail:source.thumbnail,updated:Date.now()};
 item.scene.space_review={...item.scene.space_review,accepted:true,empty:false};
 await writeRecords([['project:'+id,item],[marker,id]]);
 projects.unshift(item);
 return {item,imported:true};
}
