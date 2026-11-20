// FunDesk QR sign-in: desktop challenge contains a desktop-only secret;
// QR contains only the phone-approval secret. No student data is sent.
(()=>{
const cfg={url:'https://ayvwsexnxvjjcrbtyoof.supabase.co',key:'sb_publishable_Z2rS84mJC4BK-h4oLsNNjw_CdQz240L'};
const $=id=>document.getElementById(id);
const rand=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let generation=0;
async function post(path,data,token){
 const res=await fetch(cfg.url+path,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),cache:'no-store'});
 const json=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(json.message||json.msg||json.error_description||'HTTP '+res.status);
 return json;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function begin(){
 const host=$('qrLoginPanel');if(!host)return;
 const current=++generation,id=crypto.randomUUID(),phone=rand(),desktop=rand(),until=Date.now()+90000;
 host.hidden=false;
 host.innerHTML='<p role="status">正在產生一次性 QR Code…</p>';
 try {
  await post('/rest/v1/rpc/fundesk_qr_create',{p_id:id,p_phone_secret:phone,p_desktop_secret:desktop});
  if(current!==generation)return;
  const mobile=new URL('./qr-login.html',location.href);
  mobile.searchParams.set('id',id);mobile.searchParams.set('key',phone);
  host.innerHTML='<h3>📱 使用 iPhone 掃碼登入</h3><div id="qrCodeImage" style="display:flex;justify-content:center;padding:8px;background:white"></div><p>請用 iPhone 相機掃描，於手機上確認教師身分並按「允許登入」。</p><p id="qrWait" role="status">等待 iPhone 核准…（有效 90 秒）</p><button type="button" id="qrCancel" class="secondary">取消掃碼</button><p style="font-size:12px">教室電腦不會收到你的教師密碼。QR Code 僅供本次授權使用。</p>';
  const cancelButton=$('qrCancel');if(cancelButton)cancelButton.onclick=()=>{generation++;host.hidden=true;host.replaceChildren()};
  if(typeof QRCode!=='undefined')new QRCode($('qrCodeImage'),{text:mobile.href,width:210,height:210,correctLevel:QRCode.CorrectLevel.M});
  else $('qrCodeImage').textContent='無法載入 QR Code 元件，請確認網路後重新開啟頁面。';
  while(current===generation&&Date.now()<until){
   await delay(2000);
   if(current!==generation)return;
   try{
    const rows=await post('/rest/v1/rpc/fundesk_qr_poll',{p_id:id,p_desktop_secret:desktop});
    const result=Array.isArray(rows)?rows[0]:rows;
    if(result?.state==='approved'&&result.auth_token_hash){
     $('qrWait').textContent='授權成功，正在完成教師登入…';
     const session=await post('/auth/v1/verify',{type:'magiclink',token_hash:result.auth_token_hash});
     generation++;await window.fundeskQrFinish(session);return;
    }
    if(result?.state==='expired'||result?.state==='invalid')break;
   }catch(e){if(current===generation&&$('qrWait'))$('qrWait').textContent='連線檢查中：'+e.message}
  }
  if(current===generation&&$('qrWait'))$('qrWait').textContent='QR Code 已過期，請重新產生。';
 }catch(e){if(current===generation)host.innerHTML='<p role="alert">掃碼登入尚未啟用或連線失敗：'+esc(e.message)+'</p><button type="button" id="qrRetry">重試</button>';const retryButton=$('qrRetry');if(retryButton)retryButton.onclick=begin}
}
document.addEventListener('click',e=>{if(e.target.closest('#qrLoginStart'))begin()});
})();
