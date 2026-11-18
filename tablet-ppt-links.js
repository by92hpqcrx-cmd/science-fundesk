/* FunDesk native tablet slide player (does not use Office preview) */
(()=>{'use strict';
const ROOT='./tablet-ppt/';
const DECKS={pickup:{title:'📥 領取平板',file:'fundesk-tablet-pickup.pptx',count:18},
returns:{title:'🔌 歸還平板',file:'fundesk-tablet-return.pptx',count:15}};
const ID='fundesk-native-ppt-v4';
if(!document.getElementById(ID)){
 const el=document.createElement('style');el.id=ID;el.textContent=".tabletPptLauncher{width:100%;min-width:0}\n.fdTabs,.fdControls,.fdFullBar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:10px 0}\n.fdTabs button,.fdControls button,.fdControls a,.fdFullBar button{border:1px solid #c2d8ed;background:#fff;color:#23517c;padding:10px 14px;border-radius:11px;font-size:15px;font-weight:750;text-decoration:none;cursor:pointer}\n.fdTabs button[aria-pressed=true]{background:#255b91;color:white}\n.fdControls{justify-content:space-between;padding:10px;background:#eff7ff;border-radius:12px}\n.fdControls strong{color:#23517c}\n.fdStage{position:relative;max-width:1280px;width:100%;margin:auto;background:#101a29;overflow:hidden;border-radius:14px}\n.fdScreen{width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;position:relative}\n.fdScreen img{display:block;width:100%;height:100%;object-fit:contain;position:absolute;inset:0}\n.fdStatus{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;background:#101a29;color:#fff;font-size:18px;font-weight:750}\n.fdStatus[hidden]{display:none}\n.fdFullBar{display:none;justify-content:center;background:#192b44;color:#fff;padding:8px;margin:0;width:100%}\n.fdStage:fullscreen,.fdStage:-webkit-full-screen{max-width:none;width:100vw;height:100vh;border-radius:0;display:flex;flex-direction:column;align-items:center;justify-content:center}\n.fdStage:fullscreen .fdFullBar,.fdStage:-webkit-full-screen .fdFullBar{display:flex}\n.fdStage:fullscreen .fdScreen,.fdStage:-webkit-full-screen .fdScreen{flex:0 0 auto;width:min(100vw,calc((100vh - 55px) * 16 / 9));height:auto;aspect-ratio:16/9}\n.fdHelp{font-size:13px;color:#667f98;line-height:1.5}";
 document.head.append(el);
}
let zipLoader=null;
function getZip(){
 if(window.JSZip)return Promise.resolve(window.JSZip);
 if(zipLoader)return zipLoader;
 zipLoader=(async()=>{
  for(const url of ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
   'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js']){
   try{
    await new Promise((ok,fail)=>{
     const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=fail;
     document.head.append(s);
    });
    if(window.JSZip)return window.JSZip;
   }catch(e){}
  }
  throw Error('無法載入投影片解壓縮元件，請先下載 PPT。');
 })();
 return zipLoader;
}
function resolvePath(p,rel){
 const segments=p.split('/');segments.pop();
 for(const part of rel.split('/')){
  if(part==='..')segments.pop();
  else if(part && part!=='.')segments.push(part);
 }
 return segments.join('/');
}
const cache=new Map();
async function unpack(key){
 if(cache.has(key))return cache.get(key);
 const promise=(async()=>{
  const deck=DECKS[key],Zip=await getZip();
  const response=await fetch(ROOT+encodeURIComponent(deck.file));
  if(!response.ok)throw Error('PPT 檔案無法取得 (HTTP '+response.status+')');
  const zip=await Zip.loadAsync(await response.arrayBuffer()),list=[];
  for(let n=1;n<=deck.count;n++){
   const slide='ppt/slides/slide'+n+'.xml';
   const rel=zip.file('ppt/slides/_rels/slide'+n+'.xml.rels');
   if(!rel)throw Error('缺少第 '+n+' 張的圖片關聯');
   const xml=new DOMParser().parseFromString(await rel.async('string'),'application/xml');
   const image=[...xml.getElementsByTagName('*')].find(e=>e.localName==='Relationship' &&
      (e.getAttribute('Type')||'').endsWith('/image'));
   if(!image)throw Error('第 '+n+' 張沒有圖片');
   const media=resolvePath(slide,image.getAttribute('Target'));
   if(!zip.file(media))throw Error('圖片不存在: '+media);
   const ext=media.split('.').pop().toLowerCase();
   const mime=ext==='gif'?'image/gif':ext==='jpg'||ext==='jpeg'?'image/jpeg':'image/png';
   const blob=await zip.file(media).async('blob');
   const url=URL.createObjectURL(new Blob([blob],{type:mime}));
   let duration=3000;const slideEntry=zip.file(slide);
   if(slideEntry){
    const xmltext=await slideEntry.async('string');
    const m=xmltext.match(/advTm=["'](\d+)["']/);
    if(m)duration=Number(m[1]);
   }
   list.push({url,duration:Math.min(120000,Math.max(1000,duration))});
  }
  return list;
 })();
 cache.set(key,promise);
 try{return await promise;}catch(e){cache.delete(key);throw e;}
}
function setup(root){
 if(root.dataset.fdNative==='v4')return;
 root.dataset.fdNative='v4';root.replaceChildren();
 const title=document.createElement('h3');title.textContent='📽️ 平板守則｜網頁直接播放';
 const tabs=document.createElement('div');tabs.className='fdTabs';
 const controls=document.createElement('div');controls.className='fdControls';
 const indicator=document.createElement('strong');
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 function btn(text,parent){const b=document.createElement('button');b.type='button';b.textContent=text;parent.append(b);return b;}
 const back=btn('◀ 上一張',actions),forward=btn('下一張 ▶',actions),
       play=btn('▶ 自動播放',actions),fullscreen=btn('⛶ 全螢幕',actions);
 const download=document.createElement('a');download.textContent='⬇ 下載 PPT';
 download.target='_blank';download.rel='noopener noreferrer';actions.append(download);
 controls.append(indicator,actions);
 const stage=document.createElement('div');stage.className='fdStage';
 const screen=document.createElement('div');screen.className='fdScreen';
 const image=document.createElement('img');image.alt='平板守則投影片';
 const status=document.createElement('div');status.className='fdStatus';status.setAttribute('role','status');
 screen.append(image,status);
 const fullbar=document.createElement('div');fullbar.className='fdFullBar';
 const fullBack=btn('◀ 上一張',fullbar),fullForward=btn('下一張 ▶',fullbar),
       fullPlay=btn('▶ 播放',fullbar),fullExit=btn('✕ 離開全螢幕',fullbar);
 stage.append(screen,fullbar);
 const help=document.createElement('p');help.className='fdHelp';
 help.textContent='直接顯示 PPT 內的原始圖片，避免 Office 預覽變形；GIF 動圖可繼續播放。自動播放依原簡報秒數切換。';
 root.append(title,tabs,controls,stage,help);
 let key='pickup',list=[],index=0,playing=false,timer=0,seq=0;
 const tabButtons={};
 function stop(){playing=false;clearTimeout(timer);play.textContent='▶ 自動播放';fullPlay.textContent='▶ 播放';}
 function draw(i){
  if(!list.length)return;
  index=(i+list.length)%list.length;
  image.src=list[index].url;
  image.alt=DECKS[key].title+' 第 '+(index+1)+' 張';
  indicator.textContent=DECKS[key].title+' · '+(index+1)+' / '+list.length;
  if(playing)schedule();
 }
 function schedule(){
  clearTimeout(timer);
  if(!playing||!list.length)return;
  timer=setTimeout(()=>{
   if(index===list.length-1){stop();return;}
   draw(index+1);
  },list[index].duration);
 }
 function toggle(){
  if(!list.length)return;
  if(playing){stop();return;}
  if(index===list.length-1)draw(0);
  playing=true;play.textContent='⏸ 暫停';fullPlay.textContent='⏸ 暫停';schedule();
 }
 async function choose(k){
  stop();key=k;list=[];index=0;
  const token=++seq;image.removeAttribute('src');
  status.hidden=false;status.textContent='正在載入 '+DECKS[k].title+'…';
  indicator.textContent=DECKS[k].title;
  download.href=ROOT+encodeURIComponent(DECKS[k].file);
  Object.entries(tabButtons).forEach(([id,b])=>b.setAttribute('aria-pressed',String(id===k)));
  try{
   const slides=await unpack(k);
   if(token!==seq||!root.isConnected)return;
   list=slides;status.hidden=true;draw(0);
  }catch(error){
   if(token!==seq)return;
   status.hidden=false;status.textContent='讀取失敗：'+error.message+'。請使用下載 PPT。';
  }
 }
 Object.entries(DECKS).forEach(([k,v])=>{
  const b=btn(v.title+'（'+v.count+' 張）',tabs);tabButtons[k]=b;
  b.addEventListener('click',()=>choose(k));
 });
 for(const b of [back,fullBack])b.addEventListener('click',()=>draw(index-1));
 for(const b of [forward,fullForward])b.addEventListener('click',()=>draw(index+1));
 for(const b of [play,fullPlay])b.addEventListener('click',toggle);
 function exit(){
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
 }
 fullExit.addEventListener('click',exit);
 fullscreen.addEventListener('click',()=>{
  if(document.fullscreenElement===stage){exit();return;}
  if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>{});
  else if(stage.webkitRequestFullscreen)stage.webkitRequestFullscreen();
 });
 choose('pickup');
}
let pending=false;
new MutationObserver(()=>{
 if(pending)return;
 pending=true;queueMicrotask(()=>{
  pending=false;document.querySelectorAll('.tabletPptLauncher').forEach(setup);
 });
}).observe(document.body,{childList:true,subtree:true});
document.querySelectorAll('.tabletPptLauncher').forEach(setup);
})();