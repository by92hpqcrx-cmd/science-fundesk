(()=>{'use strict';
const pets=[
['dino','小恐龍','🦖'],['bear','小熊','🐻'],['panda','小貓','🐱'],['cat','小兔','🐰'],['rabbit','熊貓','🐼'],
['501','企鵝','🐧'],['502','兔兔','🐰'],['503','松鼠','🐿️'],['504','小鳥','🐦'],['505','貓貓','🐱'],['506','小狗','🐶'],['507','大象','🐘']
];
const $=id=>document.getElementById(id),board=$('board'),shell=$('shell'),dialog=$('winDialog');
const levels={24:'簡單',36:'中等',48:'困難'};
let deck=[],opened=[],turns=0,matched=0,elapsed=0,ticker=null,pending=null,version=0,locked=false,sound=false,ctx=null;
const petId=new URLSearchParams(location.search).get('pet'),current=pets.find(p=>p[0]===petId);
if(current){
 const area=$('chosenPet');area.hidden=false;
 const img=document.createElement('img');img.alt='';img.src='../class-pets/'+encodeURIComponent(current[0])+'.svg';
 img.onerror=()=>{img.remove()};
 const txt=document.createElement('span');txt.textContent=current[2]+' 本班班寵 '+current[1];area.append(img,txt);
}
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
 const face=document.createElement('span');face.className='card-side card-front';face.dataset.theme=item.theme;
 const tag=document.createElement('span');tag.className='pet-variant';tag.textContent=item.theme==='sun'?'☀️ 陽光':'🌙 星光';
 const image=document.createElement('img');image.className='pet-image';image.src='../class-pets/'+encodeURIComponent(item.pet[0])+'.svg';image.alt=item.pet[1];image.draggable=false;
 image.onerror=()=>{image.remove();const fallback=document.createElement('span');fallback.className='fallback';fallback.textContent=item.pet[2];face.appendChild(fallback)};
 const name=document.createElement('span');name.className='pet-name';name.textContent=item.pet[1];
 face.append(tag,image,name);inside.append(back,face);b.append(inside);
 b.onclick=()=>flip(b,item,index);
 return b;
}
function begin(){
 version++;stop();if(dialog.open)dialog.close();$('confetti').replaceChildren();
 opened=[];turns=0;matched=0;elapsed=0;locked=false;
 const pairs=count()/2;
 const types=pets.map(p=>({pet:p,theme:'sun',key:p[0]+'-sun'}))
   .concat(pets.map(p=>({pet:p,theme:'moon',key:p[0]+'-moon'}))).slice(0,pairs);
 deck=shuffle(types.flatMap(x=>[x,x]));
 board.replaceChildren();deck.forEach((x,i)=>board.appendChild(makeCard(x,i)));
 layout();stats();
}
function flip(b,item,index){
 if(locked||b.classList.contains('flipped')||b.classList.contains('matched')||opened.length>=2)return;
 timer();b.classList.add('flipped');b.setAttribute('aria-pressed','true');
 b.setAttribute('aria-label','第'+(index+1)+'張，'+item.pet[1]+(item.theme==='sun'?'陽光版':'星光版'));
 opened.push({b,item,index});beep(480,.11);
 if(opened.length!==2)return;
 turns++;stats();const [a,c]=opened;
 if(a.item.key===c.item.key){
  a.b.classList.add('matched');c.b.classList.add('matched');
  a.b.disabled=true;c.b.disabled=true;opened=[];matched++;stats();beep(780,.19);
  if(matched===deck.length/2)complete();
 }else{
  locked=true;a.b.classList.add('nope');c.b.classList.add('nope');
  const currentVersion=version;
  pending=setTimeout(()=>{
   pending=null;if(currentVersion!==version)return;
   for(const x of [a,c]){x.b.classList.remove('flipped','nope');x.b.setAttribute('aria-pressed','false');x.b.setAttribute('aria-label','第'+(x.index+1)+'張，未翻開')}
   opened=[];locked=false;
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
 $('winResult').textContent=levels[count()]+'模式｜'+deck.length+'張全部配對成功！翻牌'+turns+'次，完成時間'+timeLabel()+'。';
 setTimeout(()=>{if(!dialog.open)dialog.showModal()},500);
}
$('restart').onclick=begin;$('again').onclick=begin;$('closeWin').onclick=()=>dialog.close();
document.querySelectorAll('input[name=level]').forEach(x=>x.onchange=begin);
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'🔊 音效開':'🔈 音效關';$('sound').setAttribute('aria-pressed',sound);if(sound)beep()};
$('fullscreen').onclick=async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen()}
 catch(e){alert('瀏覽器無法進入全螢幕，可改按 F11。')}
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'⤢ 離開全螢幕':'⛶ 全螢幕';layout()});
window.addEventListener('resize',layout);
begin();
})();