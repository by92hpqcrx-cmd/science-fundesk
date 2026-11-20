"use strict";
/* FunDesk 平板遙控器：積點抵扣／誤記取消，與主程式共用 points 格式 */
function ledgerRows(sid,payload=current()?.payload){return (payload?.points||[]).filter(p=>String(p.sid)===String(sid)&&!p.cancelled);}
function ledgerAvailable(sid,payload=current()?.payload){
 return ledgerRows(sid,payload).reduce((a,p)=>a+(p.kind==='redemption'||p.kind==='penalty-offset'?Number(p.delta)||0:p.kind==='correction-log'?0:Math.max(0,Number(p.delta)||0)),0);
}
function ledgerDue(sid,payload=current()?.payload){
 const a=ledgerRows(sid,payload);
 return Math.max(0,a.reduce((n,p)=>n+(['redemption','penalty-offset','correction-log'].includes(p.kind)?0:Math.max(0,-(Number(p.delta)||0))),0)-a.reduce((n,p)=>n+(p.kind==='penalty-offset'?(Number(p.offsetAmount)||0):0),0));
}
function ledgerBatches(payload){
 const roster=payload?.students||[],members=new Set(roster.map(s=>String(s.id))),groups=new Map();
 (payload?.points||[]).forEach((p,i)=>{
  if(!p.classAwardBatchId||p.cancelled||!(Number(p.delta)>0)||!members.has(String(p.sid)))return;
  const key=String(p.classAwardBatchId);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({entry:p,index:i});
 });
 return [...groups.entries()].filter(([id,items])=>items.length===roster.length&&new Set(items.map(x=>String(x.entry.sid))).size===roster.length&&
  items.every(x=>Number(x.entry.delta)===Number(items[0].entry.delta)&&x.entry.date===items[0].entry.date&&String(x.entry.reason||'')===String(items[0].entry.reason||'')))
  .sort((a,b)=>String(b[1][0].entry.date).localeCompare(String(a[1][0].entry.date)));
}
function refreshRemoteLedger(){
 const select=$('ledgerStudent'),value=select.value;
 select.replaceChildren(new Option('請選擇學生',''),new Option('🏫 全班（查看／取消全班加點）','__all_class__'),
  ...people().map(s=>new Option(s.no+' 號 '+s.name+'｜可用 '+ledgerAvailable(s.id)+'｜待抵扣 '+ledgerDue(s.id),String(s.id))));
 select.value=[...select.options].some(x=>x.value===value)?value:'';
 drawRemoteLedger();
}
function drawRemoteLedger(){
 const details=$('ledgerDetails'),sid=$('ledgerStudent').value,payload=current()?.payload||{};
 if(!sid){details.innerHTML='<p class="note">請選擇學生或全班。</p>';return;}
 if(sid==='__all_class__'){
  const batches=ledgerBatches(payload);
  details.innerHTML='<p class="note">僅顯示具有完整批次識別的全班加點；沒有識別碼的舊紀錄請選擇學生逐筆檢查。</p>'+
   (batches.length?'<div class="remoteLedgerTable"><table><thead><tr><th>日期</th><th>原因</th><th>每人點數</th><th>人數</th><th>取消</th></tr></thead><tbody>'+
    batches.map(([key,items])=>'<tr><td>'+esc(items[0].entry.date)+'</td><td>'+esc(items[0].entry.reason||'課堂表現')+'</td><td>+'+Number(items[0].entry.delta)+'</td><td>'+items.length+'</td><td><button class="ledgerVoid" type="button" data-ledger-batch="'+esc(key)+'">取消全班誤記</button></td></tr>').join('')+'</tbody></table></div>':'<p class="note">目前沒有可整批取消的全班加點紀錄。</p>');
  return;
 }
 const s=people().find(st=>String(st.id)===String(sid));
 if(!s){details.innerHTML='<p class="note">找不到學生，請重新整理。</p>';return;}
 const available=ledgerAvailable(sid,payload),due=ledgerDue(sid,payload),max=Math.max(0,Math.min(available,due));
 const records=(payload.points||[]).map((p,i)=>({...p,_index:i})).filter(p=>String(p.sid)===String(sid)&&p.kind!=='correction-log').reverse().slice(0,40);
 details.innerHTML='<p class="remoteLedgerSummary"><strong>'+esc(s.name)+'</strong>　可用積點 '+available+'｜待抵扣 '+due+'</p>'+
 '<div class="remoteLedgerActions"><label>抵扣點數<input type="number" id="ledgerOffsetAmount" min="1" max="'+max+'" value="'+(max||1)+'"></label><button type="button" class="primary" id="ledgerApplyOffset" '+(max<1?'disabled':'')+'>使用積點抵扣</button></div>'+
 '<div class="remoteLedgerTable"><table><thead><tr><th>日期</th><th>原因</th><th>點數</th><th>修正</th></tr></thead><tbody>'+
 (records.length?records.map(p=>'<tr'+(p.cancelled?' class="cancelledRow"':'')+'><td>'+esc(p.date||'')+'</td><td>'+esc(p.reason||'課堂表現')+(p.cancelled?'（已取消）':'')+'</td><td>'+(Number(p.delta)>0?'+':'')+(Number(p.delta)||0)+'</td><td>'+(p.cancelled?'—':'<button type="button" class="ledgerVoid" data-ledger-index="'+p._index+'">取消誤記</button>')+'</td></tr>').join(''):'<tr><td colspan="4">目前沒有紀錄</td></tr>')+'</tbody></table></div>';
}
function ledgerMatching(a,b){return !!a&&!!b&&!a.cancelled&&String(a.sid)===String(b.sid)&&String(a.date||'')===String(b.date||'')&&String(a.reason||'')===String(b.reason||'')&&Number(a.delta)===Number(b.delta)&&String(a.kind||'')===String(b.kind||'')&&String(a.id||'')===String(b.id||'');}
async function saveRemoteLedger(mutator,description){
 if(!session||saving)return;
 const code=classCode,date=$('date').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){status('請選擇有效日期','error');return;}
 saving=true;
 $('remoteLedgerPanel').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{
  for(let attempt=0;attempt<4;attempt++){
   const data=await api('/rest/v1/fundesk_teacher_data?select=class_code,payload,revision&class_code=eq.'+encodeURIComponent(code));
   const row=data?.[0];if(!row||!Array.isArray(row.payload?.students))throw Error('班級雲端資料無效');
   const payload=structuredClone(row.payload);if(!Array.isArray(payload.points))payload.points=[];
   const dates=mutator(payload);
   if(!dates?.length)throw Error('紀錄已變更或已取消，請更新畫面再操作');
   let revision;
   try{
    revision=await api('/rest/v1/rpc/fundesk_save_teacher_data',{method:'POST',body:JSON.stringify({
     p_class_code:code,p_payload:payload,p_expected_revision:Number(row.revision)||0
    })});
    if(typeof revision!=='number')throw Error('儲存版本無效');
   }catch(err){
    if(attempt<3&&/revision|版本|conflict|409|400/i.test(String(err.message)))continue;
    throw err;
   }
   const local=rows.find(x=>x.class_code===code);if(local){local.payload=payload;local.revision=revision;}
   draw();refreshRemoteLedger();
   const failed=[];
   for(const d of new Set(dates)){
    try{await syncPublishedContact(code,d,payload);}
    catch(err){console.warn('聯絡簿同步未成功',err);failed.push(d);}
   }
   status('✅ '+description+'已儲存至 FunDesk'+(failed.length?'\n⚠️ 聯絡簿同步失敗，請於主程式確認。':'\n已依原有公開設定同步聯絡簿。'),failed.length?'error':'ok');
   return;
  }
 }catch(err){status('❌ 操作未完成：'+err.message,'error');drawRemoteLedger();}
 finally{saving=false;$('remoteLedgerPanel').querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function remoteLedgerCancel(sid,index){
 const shown=current()?.payload?.points?.[index];
 if(!shown||shown.cancelled||String(shown.sid)!==String(sid))return;
 if(!confirm('確定取消「'+(shown.reason||'課堂表現')+'」（'+shown.delta+' 點）？資料會保留並標記取消。'))return;
 saveRemoteLedger(payload=>{
  const points=payload.points,entry=points[index];if(!ledgerMatching(entry,shown))return [];
  if(entry.kind==='feeding-ticket-used')throw Error('餵食券已使用，不能取消。');
  if(entry.kind==='redemption'&&entry.rewardId==='feeding-ticket')throw Error('餵食券兌換請在主程式確認使用紀錄後取消。');
  if(entry.kind==='penalty-offset'&&points.slice(index+1).some(p=>!p.cancelled&&p.kind==='penalty-offset'&&String(p.sid)===String(sid)))
   throw Error('請先取消較新的抵扣紀錄。');
  if(!['redemption','penalty-offset','correction-log'].includes(entry.kind)&&Number(entry.delta)<0){
   const remaining=points.filter(p=>String(p.sid)===String(sid)&&!p.cancelled&&p!==entry&&!['redemption','penalty-offset','correction-log'].includes(p.kind)).reduce((sum,p)=>sum+Math.max(0,-(Number(p.delta)||0)),0);
   const offsets=points.filter(p=>String(p.sid)===String(sid)&&!p.cancelled&&p.kind==='penalty-offset').reduce((sum,p)=>sum+(Number(p.offsetAmount)||0),0);
   if(offsets>remaining)throw Error('這筆扣點已用積點抵扣，請先取消相關抵扣。');
  }
  if(Number(entry.delta)>0&&entry.kind!=='penalty-offset'&&ledgerAvailable(sid,payload)<Number(entry.delta))throw Error('這筆加點已使用，無法取消。');
  entry.cancelled=true;entry.cancelledAt=new Date().toISOString();
  points.push({sid,date:$('date').value,delta:0,kind:'correction-log',reason:'取消誤記：'+(entry.reason||'課堂表現'),targetIndex:index,id:'remote-correction-'+Date.now().toString(36)+Math.random().toString(36).slice(2)});
  return [entry.date||$('date').value];
 },'單筆誤記取消');
}
function remoteLedgerBatch(key){
 const shown=ledgerBatches(current()?.payload).find(([id])=>id===key);if(!shown)return;
 const items=shown[1],first=items[0].entry;
 if(!confirm('確定取消全班 '+items.length+' 人在 '+first.date+' 加 '+first.delta+' 點？原始紀錄保留。'))return;
 saveRemoteLedger(payload=>{
  const found=ledgerBatches(payload).find(([id])=>id===key);
  if(!found||found[1].length!==items.length)return [];
  for(const {entry,index} of found[1]){
   const before=items.find(x=>String(x.entry.sid)===String(entry.sid));
   if(!before||!ledgerMatching(entry,before.entry)||ledgerAvailable(entry.sid,payload)<Number(entry.delta))throw Error('部分學生積點已使用，或批次資料已變更，無法整批取消。');
  }
  const dates=new Set(),now=new Date().toISOString();
  for(const {entry,index} of found[1]){
   entry.cancelled=true;entry.cancelledAt=now;dates.add(entry.date||$('date').value);
   payload.points.push({sid:entry.sid,date:$('date').value,delta:0,kind:'correction-log',reason:'取消全班誤記：'+(entry.reason||'課堂表現'),targetIndex:index,id:'remote-class-correction-'+Date.now().toString(36)+Math.random().toString(36).slice(2)});
  }
  return [...dates];
 },'全班加點誤記取消');
}
function remoteLedgerOffset(){
 const sid=$('ledgerStudent').value,amount=Number($('ledgerOffsetAmount')?.value);
 if(!sid||!Number.isInteger(amount)||amount<1){status('請輸入有效抵扣點數','error');return;}
 if(amount>Math.min(ledgerAvailable(sid),ledgerDue(sid))){status('超過目前可用或待抵扣點數','error');return;}
 if(!confirm('確定使用 '+amount+' 積點抵扣 '+amount+' 扣點？'))return;
 saveRemoteLedger(payload=>{
  if(!payload.students.some(s=>String(s.id)===String(sid)))return [];
  if(amount>Math.min(ledgerAvailable(sid,payload),ledgerDue(sid,payload)))throw Error('雲端積點已變更，無法抵扣。');
  payload.points.push({sid,date:$('date').value,delta:-amount,offsetAmount:amount,kind:'penalty-offset',reason:'積點抵扣扣點',id:'remote-offset-'+Date.now().toString(36)+Math.random().toString(36).slice(2)});
  return [$('date').value];
 },'積點抵扣');
}
$('ledgerStudent').addEventListener('change',drawRemoteLedger);
$('ledgerDetails').addEventListener('click',e=>{
 const btn=e.target.closest('button');if(!btn)return;
 if(btn.dataset.ledgerIndex!==undefined){remoteLedgerCancel($('ledgerStudent').value,Number(btn.dataset.ledgerIndex));return;}
 if(btn.dataset.ledgerBatch){remoteLedgerBatch(btn.dataset.ledgerBatch);return;}
 if(btn.id==='ledgerApplyOffset')remoteLedgerOffset();
});
const remoteLedgerReload=reload;
reload=async function(...args){const result=await remoteLedgerReload(...args);refreshRemoteLedger();return result;};
$('classes').addEventListener('change',()=>refreshRemoteLedger());
