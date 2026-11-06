/* Video decoding can reuse imageio-ffmpeg without a system-wide installation. */
const fs=require('node:fs'),path=require('node:path');
const isFile=p=>{try{return fs.statSync(p).isFile();}catch{return false;}};
function executable(name,folders){for(const folder of folders){const candidate=path.join(folder.replace(/^"|"$/g,''),name);if(isFile(candidate))return candidate;}return null;}
function resolveMedia(root,{env=process.env,platform=process.platform}={}){
 const suffix=platform==='win32'?'.exe':'',folders=String(env.PATH||env.Path||'').split(path.delimiter).filter(Boolean),scripts=path.join(root,'.venv',platform==='win32'?'Scripts':'bin');
 let ffmpeg=env.STUDIO_FFMPEG_PATH;
 if(ffmpeg&&!isFile(ffmpeg))throw Error('STUDIO_FFMPEG_PATH 指向的 FFmpeg 文件不存在');
 ffmpeg||=executable('ffmpeg'+suffix,[scripts]);
 const binaries=path.join(root,'.venv',platform==='win32'?'Lib/site-packages':'lib');
 const imageioFolders=platform==='win32'?[path.join(binaries,'imageio_ffmpeg/binaries')]:fs.existsSync(binaries)?fs.readdirSync(binaries).filter(n=>/^python\d/.test(n)).map(n=>path.join(binaries,n,'site-packages/imageio_ffmpeg/binaries')):[];
 if(!ffmpeg)for(const folder of imageioFolders){if(!fs.existsSync(folder))continue;const names=fs.readdirSync(folder).filter(n=>/^ffmpeg-/.test(n)&&(platform==='win32'?n.endsWith('.exe'):!n.endsWith('.exe'))).sort().reverse();ffmpeg=names.map(n=>path.join(folder,n)).find(isFile);if(ffmpeg)break;}
 ffmpeg||=executable('ffmpeg'+suffix,folders);
 if(ffmpeg){const ffprobe=executable('ffprobe'+suffix,[path.dirname(ffmpeg),scripts,...folders]);return {ffmpeg:{file:ffmpeg,prefix:[]},ffprobe:ffprobe?{file:ffprobe,prefix:[]}:null};}
 throw Error('未找到本机 FFmpeg。请恢复项目 .venv 中的 imageio-ffmpeg 环境，或设置 STUDIO_FFMPEG_PATH；无需配置 AI 密钥。');
}
module.exports={resolveMedia};
