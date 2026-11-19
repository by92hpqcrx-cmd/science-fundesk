(()=>{'use strict';
const items=[
['牧夫座','牧夫座位於北斗七星附近'],['雙子座','想想兩位並肩的雙胞胎'],['人馬座','像拿著弓箭的人馬'],['大犬座','大犬座裡有明亮的天狼星'],
['大熊座','北斗七星屬於大熊座的一部分'],['小熊座','北極星位於小熊座尾端'],['天琴座','天琴座有明亮的織女星'],['天鵝座','天鵝座有天津四'],
['天蠍座','有彎曲的蠍子尾巴'],['仙后座','常見 W 或 M 的連線形狀'],['冬季大三角','三顆亮星形成冬季大三角'],['北斗七星','像水瓢，由七顆主要亮星組成'],
['室女座','室女座有角宿一'],['春季大三角','找找春天三顆代表亮星'],['秋季四邊形','四顆亮星組成近似四邊形'],['獅子座','想像一頭獅子'],
['獵戶座','腰帶上有三顆排列整齊的亮星'],['雙魚座','兩條魚以線連在一起'],['飛馬座','飛馬座有明顯的四邊形'],['夏季大三角','織女星、牛郎星、天津四']
].map(([name,hint],id)=>({id,name,hint}));
const $=id=>document.getElementById(id),app=$('app'),field=$('playfield'),win=$('win');
const params=new URLSearchParams(location.search),token=params.get('fundeskToken');
let roster=null,mode='stack',targetCount=6,people=[],turn=0,questions=[],solved=new Set(),rounds=0,seconds=0,clock=null,
    selectedPicture=null,activeWord=0,gameId=0,block=false,openMemory=[];
function shuffle(array){const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const getMode=()=>document.querySelector('input[name="mode"]:checked')?.value||'stack';
const playerCount=()=>Number(document.querySelector('input[name="players"]:checked')?.value||1);
const time=()=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
const tooltip=item=>$('showHint').checked?item.hint:'';
function getSprite(item){
 const x=(item.id%5)*25, y=Math.floor(item.id/5)*(100/3);
 const span=document.createElement('span');span.className='sprite';span.style.backgroundPosition=x.toFixed(3)+'% '+y.toFixed(3)+'%';
 span.setAttribute('role','img');span.setAttribute('aria-label',item.name+'星座圖');
 return span;
}
function currentPlayer(){return people[turn]}
function status(message){$('instruction').textContent=message}
function describe(message){$('feedback').textContent=message}
function scoreCards(){
 const host=$('scores');host.replaceChildren();
 people.forEach((p,i)=>{
  const box=document.createElement('div');box.className='score'+(i===turn?' active':'');
  const av=document.createElement('span');av.className='avatar';
  if(p.avatar){const img=document.createElement('img');img.src=p.avatar;img.alt='';img.onerror=()=>{img.remove();av.textContent='👤'};av.append(img)}else av.textContent=['🌞','🌙','🌈','⭐'][i];
  const name=document.createElement('span');name.className='name';name.textContent=p.name;
  const score=document.createElement('strong');score.textContent=p.score;
  const small=document.createElement('small');small.textContent=p.matches+' 組配對';
  box.append(av,name,score,small);host.append(box);
 });
}
function info(){
 $('done').textContent=solved.size+'/'+questions.length;
 $('rounds').textContent=rounds;
 $('timer').textContent=time();
 scoreCards();
}
function tic(){if(!clock)clock=setInterval(()=>{seconds++;$('timer').textContent=time()},1000)}
function clearClock(){if(clock){clearInterval(clock);clock=null}}
function nextTurn(){
 if(people.length>1)turn=(turn+1)%people.length;
 scoreCards();
 status('🎯 '+currentPlayer().name+'，輪到你了！'+(mode==='pick'?'請選擇正確圖卡。':mode==='memory'?'翻開兩張牌找配對。':'請把圖卡放到正確字卡上。'));
}
function feedbackGood(item){
 currentPlayer().score++;
 currentPlayer().matches++;
 solved.add(item.id);
 info();describe('🌟 答對了！這是「'+item.name+'」！獲得 1 分！');
 if(solved.size===questions.length){finish();return true}
 return false;
}
function feedbackBad(){
 describe('💪 再想想看！圖卡已歸位，換下一位挑戰。');
 nextTurn();
}
function photo(item,type='image'){
 const button=document.createElement('button');button.type='button';button.className='card '+type;
 button.dataset.id=item.id;button.setAttribute('aria-label',item.name+'星座圖');button.title=tooltip(item);
 button.append(getSprite(item));
 return button;
}
function word(item){
 const button=document.createElement('button');button.type='button';button.className='card word';button.dataset.id=item.id;
 button.textContent=item.name;button.title=tooltip(item);
 return button;
}
function columns(count){return count<=4?count:count<=8?4:count<=12?6:count<=16?8:10}
function gridOf(count){
 const grid=document.createElement('div');grid.className='cardGrid';grid.style.setProperty('--cols',columns(count));return grid;
}
function stackMode(){
 const main=document.createElement('div');main.className='stackBoard';
 const upper=document.createElement('section'),lower=document.createElement('section');
 const words=gridOf(questions.length),photos=gridOf(questions.length);
 upper.append(Object.assign(document.createElement('h3'),{className:'zoneTitle',textContent:'① 字卡區：把對應圖卡疊上來'}),words);
 lower.append(Object.assign(document.createElement('h3'),{className:'zoneTitle',textContent:'② 圖卡區：拖曳圖卡，或先點圖卡再點字卡'}),photos);
 const pictureNodes=new Map(),wordNodes=new Map();
 for(const item of shuffle(questions)){
  const b=word(item);b.addEventListener('dragover',e=>e.preventDefault());
  b.addEventListener('drop',e=>{e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));place(id,item.id)});
  b.onclick=()=>{if(selectedPicture!==null)place(selectedPicture,item.id);else describe('請先點選下方的圖卡，再選擇這張字卡。')};
  words.append(b);wordNodes.set(item.id,b);
 }
 for(const item of shuffle(questions)){
  const b=photo(item);b.draggable=true;
  b.ondragstart=e=>{selectedPicture=item.id;e.dataTransfer.setData('text/plain',String(item.id));};
  b.onclick=()=>{selectedPicture=item.id;photos.querySelectorAll('.card').forEach(c=>c.classList.toggle('highlight',c===b));describe('已選圖卡，請點上方對應的星座名稱。')};
  photos.append(b);pictureNodes.set(item.id,b);
 }
 function place(pictureId,wordId){
  if(block||solved.has(wordId)||solved.has(pictureId)||!Number.isInteger(pictureId))return;
  rounds++;const pic=pictureNodes.get(pictureId),dest=wordNodes.get(wordId);
  selectedPicture=null;photos.querySelectorAll('.card').forEach(c=>c.classList.remove('highlight'));
  if(pictureId!==wordId){pic?.classList.add('error');setTimeout(()=>pic?.classList.remove('error'),330);feedbackBad();info();return}
  pic.disabled=true;pic.classList.add('solved');dest.disabled=true;dest.classList.add('solved');
  dest.textContent='';dest.append(getSprite(items[pictureId]),document.createTextNode(' '+items[pictureId].name));
  feedbackGood(items[pictureId]);info();
 }
 main.append(upper,lower);field.append(main);
 status('🎯 '+currentPlayer().name+'：把下方圖卡拖到上方字卡，或點圖卡再點字卡！');
}
let pendingPick=null;
function pickMode(){
 const main=document.createElement('div');main.className='quizBoard',question=document.createElement('div');question.className='question';
 const grid=gridOf(questions.length),pics=new Map();
 const order=shuffle(questions);pendingPick=shuffle(questions);
 for(const item of order){
  const b=photo(item);b.onclick=()=>pick(item,b);grid.append(b);pics.set(item.id,b);
 }
 function showQuestion(){
  const next=pendingPick[0];if(!next)return;
  question.textContent=next.name;
  if($('showHint').checked){const small=document.createElement('small');small.textContent='　⭐ '+next.hint;question.append(small)}
  status('🎯 '+currentPlayer().name+'：請找出「'+next.name+'」的圖卡！');
 }
 function pick(item,button){
  if(block||solved.has(item.id)||!pendingPick.length)return;
  rounds++;const target=pendingPick[0];
  if(item.id!==target.id){
   button.classList.add('error');setTimeout(()=>button.classList.remove('error'),320);
   feedbackBad();info();status('🎯 '+currentPlayer().name+'：請再找出「'+target.name+'」！');return;
  }
  button.disabled=true;button.classList.add('solved');pendingPick.shift();
  const ended=feedbackGood(item);info();if(!ended)showQuestion();
 }
 main.append(question,grid);field.append(main);showQuestion();
}
function memoryMode(){
 const main=document.createElement('div');main.className='memoryBoard';let cards=shuffle(questions.flatMap(item=>[{item,kind:'image'},{item,kind:'word'}]));
 const count=cards.length;
 const cols=count<=8?4:count<=16?4:count<=24?6:count<=32?8:10;
 main.style.setProperty('--cols',cols);main.style.setProperty('--rows',Math.ceil(count/cols));
 const version=gameId;openMemory=[];block=false;
 cards.forEach(({item,kind},i)=>{
  const b=document.createElement('button');b.type='button';b.className='memoryCard';
  b.setAttribute('aria-label','第'+(i+1)+'張未翻開的卡片');
  const content=document.createElement('span');content.className='cardInner';
  if(kind==='image')content.append(getSprite(item));else content.textContent=item.name;
  b.dataset.kind=kind;b.append(content);
  b.onclick=()=>{
   if(block||b.classList.contains('shown')||b.classList.contains('done'))return;
   b.classList.add('shown');b.setAttribute('aria-label',item.name+(kind==='image'?'圖卡':'字卡'));
   openMemory.push({b,item,kind});
   if(openMemory.length!==2)return;
   rounds++;const [a,c]=openMemory;
   if(a.item.id===c.item.id&&a.kind!==c.kind){
    for(const x of [a,c]){x.b.classList.add('done');x.b.disabled=true}
    openMemory=[];feedbackGood(item);info();return;
   }
   block=true;info();describe('再記住這兩張牌的位置！');
   setTimeout(()=>{
    if(gameId!==version)return;
    for(const x of [a,c]){x.b.classList.remove('shown');x.b.setAttribute('aria-label','未翻開的卡片')}
    openMemory=[];block=false;feedbackBad();
   },1100);
  };
  main.append(b);
 });
 field.append(main);status('🃏 '+currentPlayer().name+'：一次翻兩張，一張圖卡加一張字卡，找到相同星座！');
}
function setupPlayers(){
 const host=$('playerSetup'),count=playerCount();host.replaceChildren();
 for(let i=0;i<count;i++){
  const label=document.createElement('label'),caption=document.createElement('span');caption.textContent='玩家 '+(i+1);
  const picker=roster?document.createElement('select'):document.createElement('input');picker.className='playerInput';
  picker.dataset.index=i;
  if(roster){
   const empty=document.createElement('option');empty.value='';empty.textContent='選擇學生';picker.append(empty);
   for(const st of roster.students){const opt=document.createElement('option');opt.value=st.id;opt.textContent=st.no+'號 '+st.name;picker.append(opt)}
  }else{picker.value='玩家 '+(i+1);picker.placeholder='玩家 '+(i+1);picker.maxLength=20}
  label.append(caption,picker);host.append(label);
 }
}
function collectPlayers(){
 const controls=[...document.querySelectorAll('.playerInput')],count=playerCount();
 const values=controls.map(c=>c.value.trim());
 if(values.length!==count||values.some(v=>!v)){alert('請選好所有玩家。');return null}
 if(new Set(values).size!==values.length){alert('玩家不可重複。');return null}
 return values.map((v,i)=>{
  const st=roster?.students.find(s=>s.id===v);return {name:st?st.no+'號 '+st.name:v,avatar:st?.avatar||'',score:0,matches:0,index:i};
 });
}
function launch(){
 let n=Number($('quantity').value);
 if(!Number.isInteger(n)||n<2||n>items.length){alert('請輸入 2～20 組卡片。');return}
 const chosen=collectPlayers();if(!chosen)return;
 people=chosen;mode=getMode();targetCount=n;turn=0;questions=shuffle(items).slice(0,n);
 solved=new Set();rounds=0;seconds=0;clearClock();tic();gameId++;block=false;activeWord=0;
 $('setup').hidden=true;$('game').hidden=false;field.replaceChildren();describe('');
 $('modeTitle').textContent={stack:'🧩 星座疊疊樂',pick:'🎯 星座快選王',memory:'🃏 星座翻翻樂'}[mode];
 if(mode==='stack')stackMode();else if(mode==='pick')pickMode();else memoryMode();
 info();
}
function fireworks(){
 const host=$('fireworks');host.replaceChildren();
 const colors=['#f7cc65','#b7f1d0','#d2b4fa','#a4dbff','#ffa3c5'];
 for(let i=0;i<90;i++){
  const el=document.createElement('span');el.className='confetti';
  el.style.setProperty('--x',Math.random()*100+'vw');el.style.setProperty('--dx',(Math.random()*240-120)+'px');
  el.style.setProperty('--t',(2+Math.random()*2)+'s');el.style.setProperty('--c',colors[Math.floor(Math.random()*colors.length)]);
  host.append(el);
 }
 setTimeout(()=>host.replaceChildren(),4500);
}
function finish(){
 clearClock();block=true;fireworks();
 const ranks=[...people].sort((a,b)=>b.score-a.score||a.index-b.index),winScore=ranks[0].score;
 const best=ranks.filter(p=>p.score===winScore).map(p=>p.name).join('、');
 $('results').textContent='🏆 '+(ranks.filter(p=>p.score===winScore).length>1?'並列冠軍：':'冠軍：')+best+
 '\\n完成 '+questions.length+' 組配對，使用 '+rounds+' 回合，時間 '+time()+
 '\\n'+ranks.map((p,i)=>(i+1)+'. '+p.name+'：'+p.score+' 分').join('\\n');
 setTimeout(()=>win.showModal(),400);
}
function resetSetup(){clearClock();$('game').hidden=true;$('setup').hidden=false;gameId++;block=false;if(win.open)win.close()}
$('start').onclick=launch;$('back').onclick=resetSetup;$('settings').onclick=resetSetup;
$('again').onclick=()=>{if(win.open)win.close();launch()};
document.querySelectorAll('input[name="players"]').forEach(x=>x.onchange=setupPlayers);
$('quantity').onchange=()=>{$('quantity').value=Math.max(2,Math.min(20,Math.round(Number($('quantity').value)||6)))};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen()}catch(e){alert('無法進入全螢幕，可以使用 F11。')}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⤢ 離開全螢幕':'⛶ 全螢幕'});
// Students are transferred only from an authenticated, same-origin FunDesk opener.
if(token&&window.opener){
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.opener||e.data?.token!==token||e.data?.kind!=='fundesk-constellation-roster')return;
  const d=e.data;if(!Array.isArray(d.students))return;
  roster={label:String(d.className||'目前班級').slice(0,80),students:d.students.slice(0,100).map(st=>({
   id:String(st.id||''),no:Number(st.no)||0,name:String(st.name||'').slice(0,50),
   avatar:typeof st.avatar==='string'&&st.avatar.startsWith(location.origin+'/science-fundesk/')?st.avatar:''
  })).filter(st=>st.id&&st.name)};
  $('rosterStatus').textContent='✅ 已載入 '+roster.label+' 的學生，請選擇 1～4 位玩家。';
  setupPlayers();
 });
 window.opener.postMessage({kind:'fundesk-constellation-ready',token},location.origin);
}
setupPlayers();
})();