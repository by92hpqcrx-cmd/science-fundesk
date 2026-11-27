(()=>{'use strict';
const pets=[
['dino','小恐龍','🦖'],['bear','小熊','🐻'],['panda','小貓','🐱'],['cat','小兔','🐰'],['rabbit','熊貓','🐼'],
['501','企鵝','🐧'],['502','兔兔','🐰'],['503','松鼠','🐿️'],['504','小鳥','🐦'],['505','貓貓','🐱'],['506','小狗','🐶'],['507','大象','🐘']
];
const constellations=[
['cassiopeia','仙后座','⭐'],['big-dipper','北斗七星','✨'],
['orion','獵戶座','⭐'],['bootes','牧夫座','✨'],
['lyra','天琴座','⭐'],['pegasus','飛馬座','✨'],
['cygnus','天鵝座','⭐'],['leo','獅子座','✨'],
['pisces','雙魚座','⭐'],['scorpius','天蠍座','✨'],
['gemini','雙子座','⭐'],['aquila','天鷹座','✨']
];
const planets=[
['sun','太陽','☀️'],['mercury','水星','⚪'],['venus','金星','🟡'],
['earth','地球','🌍'],['mars','火星','🔴'],['jupiter','木星','🪐'],
['saturn','土星','🪐'],['uranus','天王星','🔵'],
['neptune','海王星','🔵'],['moon','月球','🌕']
];
let category='pets';
const CARD_RATIOS=Object.freeze({pets:3/4,constellations:1,planets:1});
const $=id=>document.getElementById(id),board=$('board'),shell=$('shell'),dialog=$('winDialog');
const levels={24:'簡單',36:'中等',40:'困難',48:'困難'};
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
let records={},soloPlayer=null,runId='',recordPending=null,startedAt=0,recordSeq=0;
if(token&&window.opener){
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.opener||e.data?.token!==token||e.data?.kind!=='fundesk-memory-roster')return;
  const incoming=e.data;
  if(!Array.isArray(incoming.students))return;
  roster={name:String(incoming.className||'目前班級').slice(0,80),students:incoming.students.slice(0,100).map(v=>({id:String(v.id||''),name:String(v.name||'').slice(0,50),no:Number(v.no)||0,avatar:String(v.avatar||'')})).filter(v=>v.id&&v.name)};
  $('rosterState').textContent='✅ 已連接 '+roster.name+'（'+roster.students.length+' 位學生）';
  renderPlayerSelectors();$('soloStudent').replaceChildren(new Option('選擇班級學生',''),...roster.students.map(p=>new Option(p.no+'號 '+p.name,p.id)));records=incoming.records||{};drawRanking();
 });
 window.opener.postMessage({kind:'fundesk-memory-ready',token},location.origin);
}
function drawRanking(){const list=records[category+'-'+count()]||[];$('ranking').replaceChildren(...(list.length?list.map((p,i)=>{const li=document.createElement('li');li.textContent=p.name+'（'+p.group+'）｜'+p.turns+' 次／'+p.seconds+' 秒｜加權 '+p.cost;return li}):[Object.assign(document.createElement('li'),{textContent:'尚無正式紀錄'})]));}
function startSolo(){if(recordPending)return alert('請先完成上一局紀錄同步');const kind=$('soloKind').value;const st=roster?.students.find(p=>p.id===$('soloStudent').value);const guest=$('guestName').value.trim();if(kind==='student'&&!st)return alert('請選擇班級學生');if(kind==='guest'&&!guest)return alert('請輸入參賽姓名');if(kind!=='practice'&&(!roster||!window.opener))return alert('正式登錄請從已登入的 FunDesk 開啟');soloPlayer=kind==='student'?{studentId:st.id,name:st.name}:kind==='guest'?{guest,name:guest}:null;begin();$('soloNotice').textContent=soloPlayer?'參賽者：'+soloPlayer.name:'自由練習（不登錄）';}
function submitRecord(){if(!recordPending)return;$('recordStatus').textContent='正在儲存正式紀錄…';$('retryRecord').hidden=true;window.opener?.postMessage({kind:'fundesk-memory-record',token,...recordPending},location.origin);setTimeout(()=>{if(recordPending){$('recordStatus').textContent='尚未收到確認，請重試';$('retryRecord').hidden=false}},12000)}
window.addEventListener('message',e=>{if(e.source!==window.opener||e.origin!==location.origin||e.data?.token!==token||e.data.kind!=='fundesk-memory-record-result'||!recordPending||e.data.runId!==recordPending.runId)return;if(!e.data.ok){$('recordStatus').textContent='未登錄：'+e.data.error;$('retryRecord').hidden=false;return}records=e.data.records||{};recordPending=null;$('recordStatus').textContent='✅ 正式紀錄已登錄';$('retryRecord').hidden=true;drawRanking()});
$('soloKind').onchange=()=>{$('soloStudent').hidden=$('soloKind').value!=='student';$('guestName').hidden=$('soloKind').value!=='guest'};
$('soloStart').onclick=startSolo;$('retryRecord').onclick=submitRecord;
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
 if(recordPending)return;
 mode=value;soloPlayer=null;$('soloSetup').hidden=value!=='solo';gameStarted=false;players=[];active=0;
 $('playerSetup').hidden=value!=='multi';
 $('rosterState').textContent=roster?'✅ 已載入 '+roster.name:'請從 FunDesk 首頁開啟以選擇學生';
 showScores();begin();
}
document.querySelectorAll('input[name="mode"]').forEach(r=>r.onchange=()=>setMode(r.value));
$('startMatch').onclick=startMulti;
$('playerCount').onchange=()=>{gameStarted=false;players=[];active=0;renderPlayerSelectors();$('playerSetup').hidden=mode!=='multi';showScores();begin()};
renderPlayerSelectors();
function count(){return Number(document.querySelector('input[name=level]:checked').value)}
function categorySet(value){
 if(recordPending)return;soloPlayer=null;
 category=['pets','constellations','planets'].includes(value)?value:'pets';
 const hard=document.querySelector('#hardLevel');
 const n=category==='planets'?40:48;
 hard.value=String(n);
 $('hardCount').textContent=n+' 張';
 $('categoryHint').textContent=category==='pets'?'🐾 班級寵物圖片配對':category==='constellations'?'✨ 星座圖形記憶配對':'🪐 太陽、八大行星與月球的彩色圖卡';
 if(mode==='multi'&&gameStarted){gameStarted=false;players=[];active=0;$('playerSetup').hidden=false;showScores()}
 begin();
}
document.querySelectorAll('input[name="category"]').forEach(r=>r.addEventListener('change',()=>{if(r.checked)categorySet(r.value)}));

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function timeLabel(){return String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0')}
function stats(){$('pairs').textContent=matched+' / '+(deck.length/2);$('moves').textContent=turns;$('time').textContent=timeLabel()}
function timer(){if(!ticker)ticker=setInterval(()=>{elapsed++;stats()},1000)}
function stop(){if(ticker){clearInterval(ticker);ticker=null}if(pending){clearTimeout(pending);pending=null}}
function layout(){
 const n=deck.length;
 if(!n)return;
 const ratio=CARD_RATIOS[category]||1;
 const area=board.parentElement;
 const availW=Math.max(160,area.clientWidth-20);
 const full=!!document.fullscreenElement;
 const availH=Math.max(220,full?area.clientHeight-18:Math.max(440,area.clientHeight-40));
 const gap=innerWidth<=540?3:innerWidth<=860?4:7;
 let best=null;
 for(let cols=3;cols<=Math.min(14,n);cols++){
  const rows=Math.ceil(n/cols);
  const cellW=Math.min((availW-gap*(cols-1))/cols,(availH-gap*(rows-1))/rows*ratio);
  if(cellW<=0)continue;
  const cellH=cellW/ratio;
  const score=cellW*cellH;
  if(!best||score>best.score)best={cols,rows,cellW,cellH,score};
 }
 if(!best)return;
 board.style.setProperty('--columns',best.cols);
 board.style.setProperty('--rows',best.rows);
 board.style.setProperty('--card-gap',gap+'px');
 board.style.setProperty('--card-ratio',category==='pets'?'3 / 4':'1 / 1');
 board.dataset.category=category;
 board.style.width=(best.cellW*best.cols+gap*(best.cols-1))+'px';
 board.style.height=(best.cellH*best.rows+gap*(best.rows-1))+'px';
 board.setAttribute('aria-label',n+'張'+(ratio===1?'正方形':'直式')+'記憶翻牌');
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
 const image=document.createElement('img');image.className='pet-image'+(item.src?' memory-theme-image':'');image.src=item.src||('../class-pets/'+encodeURIComponent(item.pet[0])+'.svg');image.alt=item.pet[1];image.draggable=false;
 if(item.src)face.classList.add('category-front');
 image.onerror=()=>{image.remove();const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent=item.pet[1];face.appendChild(fallback);console.error('[記憶翻牌遊戲] 圖卡載入失敗:',item.pet[1]);};
 const name=document.createElement('span');name.className='pet-name';name.textContent=item.pet[1];
 face.append(image,name);inside.append(back,face);b.append(inside);
 b.onclick=()=>flip(b,item,index);
 return b;
}
function markMatchedCard(card,player){
 const face=card.querySelector('.card-front');
 if(!face||!player)return;
 const stamp=document.createElement('span');
 stamp.className='match-owner';stamp.title='由 '+player.name+' 配對成功';
 stamp.setAttribute('aria-label','配對成功：'+player.name);
 const portrait=document.createElement('span');portrait.className='match-owner-avatar';
 const fallback=document.createElement('span');
 fallback.className='match-owner-fallback';fallback.textContent=(player.name||'同學').slice(0,1);
 portrait.append(fallback);
 if(player.avatar&&player.avatar.startsWith(location.origin+'/science-fundesk/')){
  const img=document.createElement('img');img.alt='';img.src=player.avatar;
  img.onerror=()=>{img.remove()};portrait.prepend(img);
 }
 const name=document.createElement('span');name.className='match-owner-name';name.textContent=player.name;
 stamp.append(portrait,name);face.append(stamp);
 card.setAttribute('aria-label',card.getAttribute('aria-label')+'，由 '+player.name+' 配對成功');
}
function begin(){
 if(recordPending)return;version++;stop();startedAt=0;runId=token+'-'+Date.now()+'-'+(++recordSeq);if(dialog.open)dialog.close();$('confetti').replaceChildren();
 opened=[];turns=0;matched=0;elapsed=0;locked=false;
 if(mode==='multi'&&gameStarted){players.forEach(p=>{p.score=0;p.pairs=0;p.turns=0});active=0}showScores();
 // 一個圖案四張相同的牌，任兩張相同即可配對。星球主題最大 10 種（40 張）。
 const kinds=count()/4;
 if(category!=='pets'&&!window.MEMORY_GAME_ASSETS){$('categoryHint').textContent='⚠️ 星座／星球圖庫未載入，請強制重新整理';console.error('記憶翻牌遊戲：圖庫未載入');}
 const source=category==='planets'?planets:category==='constellations'?constellations:pets;
 const dir=category==='planets'?'planets':category==='constellations'?'constellations':'';
 const types=shuffle(source).slice(0,kinds).map(p=>({
  pet:p,key:p[0],src:dir?(window.MEMORY_GAME_ASSETS?.[dir+'/'+p[0]+'.webp']||''):''
 }));
 deck=shuffle(types.flatMap(x=>[x,x,x,x]));
 board.replaceChildren();deck.forEach((x,i)=>board.appendChild(makeCard(x,i)));
 layout();stats();drawRanking();
}
function flip(b,item,index){
 if(locked||(mode==='multi'&&!gameStarted)||b.classList.contains('flipped')||b.classList.contains('matched')||opened.length>=2)return;
 if(!startedAt)startedAt=performance.now();timer();b.classList.add('flipped');b.setAttribute('aria-pressed','true');
 b.setAttribute('aria-label','第'+(index+1)+'張，'+item.pet[1]);
 opened.push({b,item,index});beep(480,.11);
 if(opened.length!==2)return;
 turns++;if(mode==='multi'&&gameStarted)players[active].turns++;stats();const [a,c]=opened;
 if(a.item.key===c.item.key){
  a.b.classList.add('matched');c.b.classList.add('matched');
  a.b.disabled=true;c.b.disabled=true;opened=[];matched++;if(mode==='multi'&&gameStarted){const winner=players[active];markMatchedCard(a.b,winner);markMatchedCard(c.b,winner);winner.score+=10;winner.pairs++;showScores()}stats();beep(780,.19);
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
 elapsed=Math.max(1,Math.ceil((performance.now()-startedAt)/1000));stats();locked=true;fireworks();beep(990,.26);$('recordStatus').textContent='';$('retryRecord').hidden=true;if(mode==='solo'&&soloPlayer){recordPending={runId,category,cards:deck.length,turns,seconds:elapsed,studentId:soloPlayer.studentId||'',guest:soloPlayer.guest||''};submitRecord()}
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
$('restart').onclick=()=>{if(mode==='multi'&&!gameStarted){alert('請先選擇 2～6 位學生並開始遊戲。');return}begin()};$('again').onclick=()=>{if(!recordPending)begin()};$('closeWin').onclick=()=>dialog.close();
document.querySelectorAll('input[name=level]').forEach(x=>x.onchange=()=>{if(recordPending)return;soloPlayer=null;if(mode==='multi'){gameStarted=false;players=[];$('playerSetup').hidden=false}begin()});
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'🔊 音效開':'🔈 音效關';$('sound').setAttribute('aria-pressed',sound);if(sound)beep()};
$('fullscreen').onclick=async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen()}
 catch(e){alert('瀏覽器無法進入全螢幕，可改按 F11。')}
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⤢ 離開全螢幕':'⛶ 全螢幕';layout()});
window.addEventListener('resize',layout);
begin();
})();