(()=>{'use strict';
const pets=[
['dino','小恐龍','🦖'],['bear','小熊','🐻'],['panda','小貓','🐱'],['cat','小兔','🐰'],['rabbit','熊貓','🐼'],
['501','企鵝','🐧'],['502','兔兔','🐰'],['503','松鼠','🐿️'],['504','小鳥','🐦'],['505','貓貓','🐱'],['506','小狗','🐶'],['507','大象','🐘']
];
const $=id=>document.getElementById(id),board=$('board'),shell=$('shell'),dialog=$('winDialog');
const levels={24:'簡單',36:'中等',48:'困難'};
let deck=[],opened=[],turns=0,matched=0,elapsed=0,ticker=null,pending=null,version=0,locked=false,sound=false,ctx=null;
let mode='solo',roster=null,players=[],active=0,gameStarted=false;
const petId=new URLSearchParams(location.search).get('pet'),current=pets.find(p=>p[0]===petId);
if(current){
 const area=$('chosenPet');area.hidden=false;
 const img=document.createElement('img');img.alt='';img.src='../class-pets/'+encodeURIComponent(current[0])+'.svg';
 img.onerror=()=>{img.remove()};
 const txt=document.createElement('span');txt.textContent=current[2]+' 本班班寵 '+current[1];area.append(img,txt);
}
// FunDesk student roster: only accepts the matching same-origin opener with a one-time token.
const token=new URLSearchParams(location.search).get('fundeskToken')||'';
if(token&&window.opener){
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.opener||e.data?.token!==token||e.data?.kind!=='fundesk-memory-roster')return;
  const incoming=e.data;
  if(!Array.isArray(incoming.students))return;
  roster={name:String(incoming.className||'目前班級').slice(0,80),students:incoming.students.slice(0,100).map(v=>({id:String(v.id||''),name:String(v.name||'').slice(0,50),no:Number(v.no)||0,avatar:String(v.avatar||'')})).filter(v=>v.id&&v.name)};
  $('rosterState').textContent='✅ 已連接 '+roster.name+'（'+roster.students.length+' 位學生）';
  renderPlayerSelectors();
 });
 window.opener.postMessage({kind:'fundesk-memory-ready',token},location.origin);
}
function showScores(){
 const board=$('scoreboard'),notice=$('turnNotice');board.replaceChildren();
 if(mode!=='multi'||!gameStarted){board.hidden=true;notice.hidden=true;return}
 board.hidden=false;notice.hidden=false;
 players.forEach((p,i)=>{
  const box=document.createElement('div');box.className='scoreCard'+(active===i?' active':'');
  const avatar=document.createElement('span');avatar.className='scoreAvatar';
  if(p.avatar&&p.avatar.startsWith(location.origin+'/science-fundesk/')){const img=document.createElement('img');img.src=p.avatar;img.alt='';img.onerror=()=>{img.remove();avatar.textContent='👤'};avatar.append(img)}else avatar.textContent='👤';
  const name=document.createElement('b');name.textContent=p.no+'號 '+p.name;
  const score=document.createElement('strong');score.textContent=p.score+' 分';
  const pairs=document.createElement('small');pairs.textContent=p.pairs+' 組配對';
  box.append(avatar,name,score,pairs);board.append(box);
 });
 notice.textContent='🎯 輪到 '+players[active].name+'（'+players[active].no+'號）'+(locked?' · 請稍候':' · 請翻兩張牌');
}
function playerCount(){return Math.min(6,Math.max(2,Number($('playerCount').value)||4))}
function renderPlayerSelectors(){
 const number=playerCount(),container=$('playerSelectors');
 const previous=[...container.querySelectorAll('.playerSelect')].map(s=>s.value);
 container.replaceChildren();
 $('rosterClass').textContent=(roster?'📚 '+roster.name+'｜':'')+'選擇 '+number+' 位不同的學生';
 for(let i=0;i<number;i++){
  const label=document.createElement('label');label.textContent='玩家 '+(i+1);
  const select=document.createElement('select');select.className='playerSelect';select.dataset.player=String(i);
  select.setAttribute('aria-label','玩家 '+(i+1));
  const empty=document.createElement('option');empty.value='';empty.textContent='選擇學生';select.append(empty);
  if(roster)for(const st of roster.students){
   const option=document.createElement('option');option.value=st.id;
   option.textContent=st.no+'號 '+st.name;select.append(option);
  }
  if(previous[i]&&roster?.students.some(st=>st.id===previous[i]))select.value=previous[i];
  label.append(select);container.append(label);
 }
}
function startMulti(){
 if(!roster)return alert('請從已登入的 FunDesk 首頁開啟遊戲，才能選擇班級學生。');
 const number=playerCount();
 const ids=[...document.querySelectorAll('.playerSelect')].map(x=>x.value);
 if(ids.length!==number||ids.some(v=>!v))return alert('請選滿 '+number+' 位學生。');
 if(new Set(ids).size!==number)return alert('玩家不可重複，請選擇不同學生。');
 players=ids.map((id,index)=>({...roster.students.find(st=>st.id===id),index,score:0,pairs:0,turns:0}));
 gameStarted=true;active=0;$('playerSetup').hidden=true;begin();
}
function setMode(value){
 mode=value;gameStarted=false;players=[];active=0;
 $('playerSetup').hidden=value!=='multi';
 $('rosterState').textContent=roster?'✅ 已載入 '+roster.name:'請從 FunDesk 首頁開啟以選擇學生';
 showScores();begin();
}
document.querySelectorAll('input[name="mode"]').forEach(r=>r.onchange=()=>setMode(r.value));
$('startMatch').onclick=startMulti;
$('playerCount').onchange=()=>{gameStarted=false;players=[];active=0;renderPlayerSelectors();$('playerSetup').hidden=mode!=='multi';showScores();begin()};
renderPlayerSelectors();
function count(){return Number(document.querySelector('input[name=level]:checked').value)}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function timeLabel(){return String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0')}
function stats(){$('pairs').textContent=matched+' / '+(deck.length/2);$('moves').textContent=turns;$('time').textContent=timeLabel()}
function timer(){if(!ticker)ticker=setInterval(()=>{elapsed++;stats()},1000)}
function stop(){if(ticker){clearInterval(ticker);ticker=null}if(pending){clearTimeout(pending);pending=null}}
function layout(){
 const n=deck.length,narrow=innerWidth<780||innerHeight>innerWidth;
 const cols=n===24?(narrow?4:8):n===36?(narrow?6:9):(narrow?6:12);
 board.style.setProperty('--columns',cols);board.style.setProperty('--rows',Math.ceil(n/cols));
 board.setAttribute('aria-label',n+'張翻牌記憶遊戲');
}
function beep(freq=640,duration=.16){
 if(!sound)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  if(!ctx)ctx=new C();
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
  osc.frequency.value=freq;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
  osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration);
 }catch(e){}
}
function makeCard(item,index){
 const b=document.createElement('button');b.type='button';b.className='memory-card';
 b.setAttribute('aria-label','第'+(index+1)+'張，未翻開');b.setAttribute('aria-pressed','false');
 const inside=document.createElement('span');inside.className='card-inner';
 const back=document.createElement('span');back.className='card-side card-back';
 const logo=document.createElement('img');logo.alt='';logo.src='../fundesk-app-icon.svg';logo.draggable=false;
 const small=document.createElement('small');small.textContent='FD · FunDesk';back.append(logo,small);
 const face=document.createElement('span');face.className='card-side card-front';
 const image=document.createElement('img');image.className='pet-image';image.src='../class-pets/'+encodeURIComponent(item.pet[0])+'.svg';image.alt=item.pet[1];image.draggable=false;
 image.onerror=()=>{image.remove();const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent=item.pet[2];face.appendChild(fallback)};
 const name=document.createElement('span');name.className='pet-name';name.textContent=item.pet[1];
 face.append(image,name);inside.append(back,face);b.append(inside);
 b.onclick=()=>flip(b,item,index);
 return b;
}
function begin(){
 version++;stop();if(dialog.open)dialog.close();$('confetti').replaceChildren();
 opened=[];turns=0;matched=0;elapsed=0;locked=false;
 if(mode==='multi'&&gameStarted){players.forEach(p=>{p.score=0;p.pairs=0;p.turns=0});active=0}showScores();
 // 每種班寵固定四張同圖牌；每次配對只需要任意兩張相同。
 const kinds=count()/4;
 const types=shuffle(pets).slice(0,kinds).map(p=>({pet:p,key:p[0]}));
 deck=shuffle(types.flatMap(x=>[x,x,x,x]));
 board.replaceChildren();deck.forEach((x,i)=>board.appendChild(makeCard(x,i)));
 layout();stats();
}
function flip(b,item,index){
 if(locked||(mode==='multi'&&!gameStarted)||b.classList.contains('flipped')||b.classList.contains('matched')||opened.length>=2)return;
 timer();b.classList.add('flipped');b.setAttribute('aria-pressed','true');
 b.setAttribute('aria-label','第'+(index+1)+'張，'+item.pet[1]);
 opened.push({b,item,index});beep(480,.11);
 if(opened.length!==2)return;
 turns++;if(mode==='multi'&&gameStarted)players[active].turns++;stats();const [a,c]=opened;
 if(a.item.key===c.item.key){
  a.b.classList.add('matched');c.b.classList.add('matched');
  a.b.disabled=true;c.b.disabled=true;opened=[];matched++;if(mode==='multi'&&gameStarted){players[active].score+=10;players[active].pairs++;showScores()}stats();beep(780,.19);
  if(matched===deck.length/2)complete();
 }else{
  locked=true;a.b.classList.add('nope');c.b.classList.add('nope');
  const currentVersion=version;
  pending=setTimeout(()=>{
   pending=null;if(currentVersion!==version)return;
   for(const x of [a,c]){x.b.classList.remove('flipped','nope');x.b.setAttribute('aria-pressed','false');x.b.setAttribute('aria-label','第'+(x.index+1)+'張，未翻開')}
   opened=[];locked=false;if(mode==='multi'&&gameStarted){active=(active+1)%players.length;showScores()}
  },900);
 }
}
function fireworks(){
 const area=$('confetti'),colors=['#ffd96e','#a6f1c3','#ef9fcd','#a2cfff','#cfbbff'];
 area.replaceChildren();
 for(let i=0;i<90;i++){
  const p=document.createElement('i');p.className='spark';
  p.style.setProperty('--x',Math.random()*100+'vw');
  p.style.setProperty('--dx',(Math.random()*240-120)+'px');
  p.style.setProperty('--duration',(2.4+Math.random()*1.8)+'s');
  p.style.setProperty('--size',(5+Math.random()*9)+'px');
  p.style.setProperty('--color',colors[Math.floor(Math.random()*colors.length)]);
  area.append(p);
 }
 setTimeout(()=>area.replaceChildren(),4600);
}
function complete(){
 if(ticker){clearInterval(ticker);ticker=null}
 locked=true;fireworks();beep(990,.26);
 let summary=levels[count()]+'模式｜'+deck.length+'張全部配對成功！翻牌'+turns+'次，完成時間'+timeLabel()+'。';
 if(mode==='multi'&&gameStarted){
  const ranked=[...players].sort((a,b)=>b.score-a.score||a.index-b.index);
  const champions=ranked.filter(p=>p.score===ranked[0].score);
  summary+='\n🏆 '+(champions.length>1?'並列冠軍：':'冠軍：')+champions.map(p=>p.name).join('、');
  summary+='\n'+ranked.map((p,i)=>(i+1)+'. '+p.no+'號 '+p.name+'：'+p.score+'分（'+p.pairs+'組）').join('\n');
 }
 $('winResult').textContent=summary;
 setTimeout(()=>{if(!dialog.open)dialog.showModal()},500);
}
$('restart').onclick=()=>{if(mode==='multi'&&!gameStarted){alert('請先選擇 2～6 位學生並開始遊戲。');return}begin()};$('again').onclick=begin;$('closeWin').onclick=()=>dialog.close();
document.querySelectorAll('input[name=level]').forEach(x=>x.onchange=()=>{if(mode==='multi'){gameStarted=false;players=[];$('playerSetup').hidden=false}begin()});
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'🔊 音效開':'🔈 音效關';$('sound').setAttribute('aria-pressed',sound);if(sound)beep()};
$('fullscreen').onclick=async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen()}
 catch(e){alert('瀏覽器無法進入全螢幕，可改按 F11。')}
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⤢ 離開全螢幕':'⛶ 全螢幕';layout()});
window.addEventListener('resize',layout);
begin();
})();