/* FunDesk 星空配對王 — 國小五年級清晰 SVG 修正版
   只保留「星座疊疊樂」與「星座快選王」。
   圖案由 constellation-sprite.svg 的 20 組向量圖形提供。
*/
(()=>{'use strict';
const LIST=[
 ['牧夫座','靠近北斗七星，可以想像一位牧人'],
 ['雙子座','兩位並肩的雙胞胎'],
 ['人馬座','想像拿著弓箭的人馬'],
 ['大犬座','這個星座有非常明亮的天狼星'],
 ['大熊座','北斗七星是大熊座的一部分'],
 ['小熊座','北極星在小熊座的尾端'],
 ['天琴座','可以在天琴座找到織女星'],
 ['天鵝座','夏季的天津四就在天鵝座'],
 ['天蠍座','星點排列像一條彎曲的蠍子尾巴'],
 ['仙后座','常見的形狀像 W 或 M'],
 ['冬季大三角','冬天三顆明亮的星形成三角形'],
 ['北斗七星','七顆亮星連起來像水瓢'],
 ['室女座','室女座中有明亮的角宿一'],
 ['春季大三角','春夜天空可以找這三顆代表亮星'],
 ['秋季四邊形','四顆亮星連起來接近四邊形'],
 ['獅子座','彎曲的星點像獅子的頭與身體'],
 ['獵戶座','腰帶上有三顆排在一起的亮星'],
 ['雙魚座','可以想像兩條魚連在一起'],
 ['飛馬座','中央有一個明顯的四邊形'],
 ['夏季大三角','織女星、牛郎星、天津四組成三角形']
].map(([name,hint],id)=>({id,name,hint}));

const $=id=>document.getElementById(id);
const app=$('app'),playfield=$('playfield'),dialog=$('winDialog');
const token=new URLSearchParams(location.search).get('fundeskToken')||'';
let roster=null,mode='stack',players=[],current=0,cards=[],solved=new Set(),attempts=0,elapsed=0,timer=null,version=0;
let activeImage=null,waiting=false,remaining=[],finishTimer=null;
const modeName={stack:'🧩 星座疊疊樂',pick:'🎯 星座快選王'};
const numPlayers=()=>Number(document.querySelector('input[name="players"]:checked')?.value||1);
const fmtTime=()=>String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
function shuffle(list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function text(id,value){$(id).textContent=String(value)}
function art(item){
 const node=document.createElement('span');node.className='art';
 node.style.setProperty('--x',String((item.id%5)*25)+'%');
 node.style.setProperty('--y',String(Math.floor(item.id/5)*100/3)+'%');
 node.setAttribute('role','img');node.setAttribute('aria-label','星座連線圖');
 return node;
}
function word(item){
 const button=document.createElement('button');button.type='button';button.className='card word';
 button.textContent=item.name;button.dataset.id=String(item.id);return button;
}
function image(item){
 const button=document.createElement('button');button.type='button';button.className='card image';
 button.dataset.id=String(item.id);button.setAttribute('aria-label','星座圖卡');
 button.append(art(item));return button;
}
function gridFor(n,forPictures=false){
 const grid=document.createElement('div');grid.className='card-grid';
 const narrow=innerWidth<700;
 let cols;if(narrow){cols=n<=4?2:n<=8?3:n<=12?4:5}
 else cols=n<=8?n:n<=12?6:n<=16?8:10;
 // Let cards occupy their own rows and never clip overflowing illustrations.
 grid.style.setProperty('--cols',String(cols));grid.style.setProperty('--rows',String(Math.ceil(n/cols)));
 return grid;
}
function updateScoreboard(){
 const root=$('scoreboard');root.replaceChildren();root.style.setProperty('--player-count',String(players.length));
 players.forEach((p,i)=>{
  const box=document.createElement('div');box.className='player'+(current===i?' active':'');
  const avatar=document.createElement('span');avatar.className='avatar';
  if(p.avatar){const img=document.createElement('img');img.alt='';img.src=p.avatar;img.onerror=()=>{img.remove();avatar.textContent='👤'};avatar.append(img)}
  else avatar.textContent=['🌞','🌙','⭐','🌈'][i];
  const name=document.createElement('span');name.className='player-name';name.textContent=p.name;
  const score=document.createElement('span');score.className='points';score.textContent=p.score+' 分';
  box.append(avatar,name,score);root.append(box);
 });
}
function refresh(){text('done',solved.size+'/'+cards.length);text('attempts',attempts);text('clock',fmtTime());updateScoreboard()}
function say(message){text('message',message)}
function feedback(message){text('feedback',message)}
function player(){return players[current]}
function nextPlayer(){current=(current+1)%players.length;updateScoreboard()}
function startClock(){stopClock();timer=setInterval(()=>{elapsed++;text('clock',fmtTime())},1000)}
function stopClock(){if(timer){clearInterval(timer);timer=null}if(finishTimer){clearTimeout(finishTimer);finishTimer=null}}
function showRosterOptions(){
 const area=$('playerSetup');area.replaceChildren();
 for(let i=0;i<numPlayers();i++){
  const label=document.createElement('label');
  const caption=document.createElement('span');caption.textContent='玩家 '+(i+1);
  const control=roster?document.createElement('select'):document.createElement('input');
  control.className='player-choice';control.dataset.position=String(i);
  if(roster){
   const empty=document.createElement('option');empty.value='';empty.textContent='請選擇學生';control.append(empty);
   for(const person of roster.students){const option=document.createElement('option');option.value=person.id;option.textContent=person.no+'號 '+person.name;control.append(option)}
  }else{control.value='玩家 '+(i+1);control.placeholder='玩家 '+(i+1);control.maxLength=30}
  label.append(caption,control);area.append(label);
 }
}
function readPlayers(){
 const controls=[...document.querySelectorAll('.player-choice')],ids=controls.map(x=>x.value.trim());
 if(ids.length!==numPlayers()||ids.some(v=>!v)){alert('請先選擇或輸入所有玩家。');return null}
 if(new Set(ids).size!==ids.length){alert('玩家不能重複。');return null}
 return ids.map((id,i)=>{
  const st=roster?.students.find(x=>x.id===id);
  return {name:st?st.no+'號 '+st.name:id,score:0,avatar:st?.avatar||'',index:i};
 });
}
function reward(item){
 player().score+=1;solved.add(item.id);
 feedback('🌟 正確！「'+item.name+'」配對成功，獲得 1 分！');refresh();
 if(solved.size===cards.length){finish();return true}
 return false;
}
function loseTurn(){
 nextPlayer();feedback('💪 這張還不對，圖卡回到原位，換下一位挑戰！');
 say('🎯 輪到 '+player().name+'，請繼續找出正確的星座。');refresh();
}
function setupStack(){
 const layout=document.createElement('div');layout.className='stack-layout';
 const letters=document.createElement('section');letters.className='zone';
 const pictures=document.createElement('section');pictures.className='zone';
 const label1=document.createElement('h3');label1.textContent='① 字卡區：將正確圖卡放到星座名稱上';
 const label2=document.createElement('h3');label2.textContent='② 圖卡區：先選圖卡，再點字卡（也可拖曳）';
 const words=gridFor(cards.length),photos=gridFor(cards.length,true),pictureButtons=new Map(),wordButtons=new Map();
 letters.append(label1,words);pictures.append(label2,photos);
 for(const item of shuffle(cards)){
  const b=word(item);wordButtons.set(item.id,b);words.append(b);
  b.addEventListener('dragover',e=>{if(!waiting)e.preventDefault()});
  b.addEventListener('drop',e=>{
   e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));
   if(Number.isInteger(id))place(id,item.id);
  });
  b.addEventListener('click',()=>{
   if(activeImage===null){feedback('請先點選下方一張圖卡，再點選上方對應的星座名稱。');return}
   place(activeImage,item.id);
  });
 }
 for(const item of shuffle(cards)){
  const b=image(item);pictureButtons.set(item.id,b);photos.append(b);b.draggable=true;
  b.addEventListener('dragstart',e=>{
   if(waiting||solved.has(item.id)){e.preventDefault();return}
   activeImage=item.id;e.dataTransfer.setData('text/plain',String(item.id));
  });
  b.addEventListener('click',()=>{
   if(waiting||solved.has(item.id))return;
   activeImage=item.id;photos.querySelectorAll('.card').forEach(x=>x.classList.toggle('selected',x===b));
   feedback('已選圖卡！請點選上方對應的星座名稱。');
  });
 }
 function place(pictureId,wordId){
  if(waiting||solved.has(wordId)||solved.has(pictureId))return;
  if(!pictureButtons.has(pictureId))return;
  attempts++;activeImage=null;
  photos.querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));
  const pic=pictureButtons.get(pictureId),dest=wordButtons.get(wordId);
  if(pictureId!==wordId){
   pic.classList.add('wrong');setTimeout(()=>pic.classList.remove('wrong'),350);loseTurn();return;
  }
  pic.classList.add('solved');pic.disabled=true;dest.classList.add('solved');dest.disabled=true;
  if(reward(cards.find(x=>x.id===pictureId)))return;
  say('🎯 '+player().name+'：配對正確！可以繼續找下一張。');
 }
 layout.append(letters,pictures);playfield.append(layout);
 say('🎯 '+player().name+'：把下方圖卡拖到上方字卡，或先點圖卡再點字卡。');
}
function setupPick(){
 const layout=document.createElement('div');layout.className='pick-layout';
 const prompt=document.createElement('div');prompt.className='prompt';
 const grid=gridFor(cards.length,true);remaining=shuffle(cards);
 for(const item of shuffle(cards)){
  const b=image(item);grid.append(b);
  b.onclick=()=>{
   if(waiting||b.disabled||!remaining.length)return;
   attempts++;
   const target=remaining[0];
   if(item.id!==target.id){
    b.classList.add('wrong');setTimeout(()=>b.classList.remove('wrong'),350);
    loseTurn();displayQuestion();return;
   }
   b.disabled=true;b.classList.add('solved');remaining.shift();
   if(reward(item))return;
   displayQuestion();
  };
 }
 function displayQuestion(){
  const target=remaining[0];if(!target)return;
  prompt.replaceChildren();const textNode=document.createElement('strong');textNode.textContent=target.name;prompt.append(textNode);
  if($('showHint').checked){const small=document.createElement('small');small.textContent='💡 '+target.hint;prompt.append(small)}
  say('🎯 '+player().name+'：找出「'+target.name+'」的星座圖卡！');
 }
 layout.append(prompt,grid);playfield.append(layout);displayQuestion();
}
function launch(){
 const number=Number($('quantity').value);
 if(!Number.isInteger(number)||number<2||number>20){alert('請輸入 2～20 組配對題目。');return}
 const chosen=readPlayers();if(!chosen)return;
 version++;stopClock();cards=shuffle(LIST).slice(0,number);
 players=chosen;current=0;solved=new Set();attempts=0;elapsed=0;waiting=false;activeImage=null;
 mode=document.querySelector('input[name="mode"]:checked')?.value==='pick'?'pick':'stack';
 $('setup').hidden=true;$('game').hidden=false;playfield.replaceChildren();feedback('');
 text('modeTitle',modeName[mode]);
 if(mode==='stack')setupStack();else setupPick();
 refresh();startClock();
}
function celebrate(){
 const area=$('confetti');area.replaceChildren();
 const colors=['#ffcb6e','#8be0c2','#99c9ff','#ec9fca','#c1a5f8'];
 for(let i=0;i<75;i++){
  const p=document.createElement('span');p.className='spark';
  p.style.setProperty('--x',(Math.random()*100)+'vw');
  p.style.setProperty('--dx',((Math.random()-.5)*220)+'px');
  p.style.setProperty('--c',colors[Math.floor(Math.random()*colors.length)]);
  p.style.setProperty('--t',(2+Math.random()*2)+'s');area.append(p);
 }
 setTimeout(()=>area.replaceChildren(),4500);
}
function finish(){
 stopClock();waiting=true;celebrate();
 const ranks=[...players].sort((a,b)=>b.score-a.score||a.index-b.index);
 const champions=ranks.filter(p=>p.score===ranks[0].score);
 text('results','🏆 '+(champions.length>1?'並列第一名：':'第一名：')+champions.map(p=>p.name).join('、')+
   '\n完成 '+cards.length+' 組配對，總共作答 '+attempts+' 次，時間 '+fmtTime()+
   '\n'+ranks.map((p,i)=>(i+1)+'. '+p.name+'：'+p.score+' 分').join('\n'));
 const currentVersion=version;
 finishTimer=setTimeout(()=>{finishTimer=null;if(version===currentVersion&&!dialog.open)dialog.showModal()},450);
}
function backToSetup(){version++;stopClock();if(dialog.open)dialog.close();$('game').hidden=true;$('setup').hidden=false;playfield.replaceChildren()}
$('start').onclick=launch;$('back').onclick=backToSetup;$('settings').onclick=backToSetup;
$('again').onclick=()=>{if(dialog.open)dialog.close();launch()};
document.querySelectorAll('input[name="players"]').forEach(x=>x.addEventListener('change',showRosterOptions));
$('quantity').addEventListener('change',()=>{$('quantity').value=Math.max(2,Math.min(20,Math.round(Number($('quantity').value)||6)))});
$('fullscreen').onclick=async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen()}
 catch(e){alert('這個瀏覽器無法開啟全螢幕，可以嘗試 F11。')}
};
document.addEventListener('fullscreenchange',()=>{text('fullscreen',document.fullscreenElement?'⤢ 離開全螢幕':'⛶ 全螢幕')});
// 安全接收 FunDesk 主程式傳來的目前班級學生名單：不在網址或檔案儲存姓名。
if(token&&window.opener){
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.opener||e.data?.kind!=='fundesk-constellation-roster'||e.data?.token!==token)return;
  if(!Array.isArray(e.data.students))return;
  roster={name:String(e.data.className||'目前班級').slice(0,60),students:e.data.students.slice(0,100).map(st=>({
    id:String(st.id||''),name:String(st.name||'').slice(0,40),no:Number(st.no)||0,
    avatar:typeof st.avatar==='string'&&st.avatar.startsWith(location.origin+'/science-fundesk/')?st.avatar:''
  })).filter(st=>st.id&&st.name)};
  text('rosterStatus','✅ 已載入 '+roster.name+'（'+roster.students.length+' 位學生），請選擇玩家。');
  showRosterOptions();
 });
 window.opener.postMessage({kind:'fundesk-constellation-ready',token},location.origin);
}
showRosterOptions();
})();