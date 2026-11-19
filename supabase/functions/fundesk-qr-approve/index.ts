// Supabase Edge Function: fundesk-qr-approve
// 部署指令：supabase functions deploy fundesk-qr-approve --no-verify-jwt
// 此函式仍會自行向 Supabase Auth 驗證登入者 JWT。
import { createClient } from 'npm:@supabase/supabase-js@2';
Deno.serve(async (req) => {
 const origin = req.headers.get('origin') || '';
 const allowed = new Set(['https://by92hpqcrx-cmd.github.io']);
 const cors = {'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://by92hpqcrx-cmd.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply = (status:number,msg:string)=>new Response(JSON.stringify({message:msg}),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST'||!allowed.has(origin))return reply(403,'不允許的來源');
 try {
  const auth=req.headers.get('authorization')||'';
  const jwt=auth.replace(/^Bearer\s+/i,'');
  if(!jwt)return reply(401,'請先在 iPhone 登入教師帳號');
  const url=Deno.env.get('SUPABASE_URL')!;
  const pub=Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser(jwt);
  if(authError||!user?.email||!user.email_confirmed_at)return reply(401,'教師身分驗證未通過');
  // 僅允許管理者明確核准的 FunDesk 教師帳號使用手機掃碼授權。
  // 以 Supabase Auth user.id 核對，不能依電子郵件字串自行宣稱為教師。
  const {data:teacher,error:teacherError}=await client
   .from('fundesk_qr_allowed_teachers')
   .select('user_id,active')
   .eq('user_id',user.id)
   .eq('active',true)
   .maybeSingle();
  if(teacherError)return reply(503,'教師授權名單尚未設定或暫時無法查詢');
  if(!teacher)return reply(403,'此帳號尚未取得 FunDesk 教師掃碼授權');
  const body=await req.json();
  const id=String(body.id||''),phone=String(body.phoneSecret||'');
  if(!/^[a-f0-9-]{36}$/i.test(id)||phone.length<32||phone.length>256)return reply(400,'掃碼授權資料有誤');
  const {data:rows,error:readError}=await client.from('fundesk_qr_login_requests').select('id,phone_secret_hash,status,expires_at').eq('id',id).limit(1);
  if(readError||!rows?.length)return reply(404,'登入請求不存在');
  const r=rows[0];
  if(r.status!=='pending'||Date.parse(r.expires_at)<=Date.now())return reply(410,'QR Code 已過期或已使用');
  // SHA-256 使用 Deno WebCrypto，比對後才產生一次性 Auth magic link。
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(phone));
  const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==r.phone_secret_hash)return reply(403,'授權碼錯誤');
  const {data:link,error:linkError}=await client.auth.admin.generateLink({type:'magiclink',email:user.email});
  if(linkError||!link?.properties?.hashed_token)return reply(500,'無法建立一次性登入憑證');
  const {data:updated,error:updateError}=await client.from('fundesk_qr_login_requests')
   .update({status:'approved',token_hash:link.properties.hashed_token,approved_user:user.id})
   .eq('id',id).eq('status','pending').gt('expires_at',new Date().toISOString()).select('id');
  if(updateError||!updated?.length)return reply(410,'授權已過期');
  return new Response(JSON.stringify({ok:true}),{headers:{...cors,'Content-Type':'application/json'}});
 }catch{return reply(500,'驗證服務發生錯誤')}
});
