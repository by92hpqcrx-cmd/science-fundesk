const origin="https://by92hpqcrx-cmd.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
Deno.serve(async(req)=>{
 if(req.headers.get("origin")!==origin)return reply({message:"Origin not allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({message:"Method not allowed"},405);
 try{
 const auth=req.headers.get("authorization")||"", key=req.headers.get("apikey")||"";
 if(!/^Bearer [^\s]+$/.test(auth)||!key)return reply({message:"請先登入 FunDesk"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("PADLET_API_KEY"),owner=Deno.env.get("PADLET_OWNER_UID"),boards=(Deno.env.get("PADLET_ALLOWED_BOARDS")||"").split(",").map(s=>s.trim()).filter(Boolean);
 if(!url||!secret||!owner||!boards.length)return reply({message:"Padlet 服務尚未設定完成"},503);
 const headers={Authorization:auth,apikey:key};
 const u=await fetch(url+"/auth/v1/user",{headers,signal:AbortSignal.timeout(10000)});
 if(!u.ok)return reply({message:"登入驗證失敗"},401);
 const user=await u.json();
 if(user.id!==owner)return reply({message:"此帳戶未獲 Padlet 授權"},403);
 const p=await fetch(url+"/rest/v1/rpc/fundesk_access_features",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(10000)});
 if(!p.ok)return reply({message:"權限驗證失敗"},403);
 const rights=await p.json();
 if(!["admin","teacher"].includes(rights?.role)||(rights.role!=="admin"&&rights.features?.assessment===false))return reply({message:"沒有數位評量權限"},403);
 const raw=await req.text();if(raw.length>2048)return reply({message:"Request too large"},413);
 let body;try{body=JSON.parse(raw)}catch{return reply({message:"Invalid JSON"},400)}
 const id=String(body?.boardId||"");
 if(!/^[A-Za-z0-9]{16,22}$/.test(id)||!boards.includes(id))return reply({message:"看板未列入授權清單"},403);
 const r=await fetch("https://api.padlet.dev/v1/boards/"+id+"?include=posts,sections",{headers:{"X-Api-Key":secret,"Accept":"application/vnd.api+json"},redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)return reply({message:"Padlet 讀取失敗（HTTP "+r.status+"）"},r.status===429?429:502);
 const d=await r.json();
 if(d?.data?.id!==id||d.data.type!=="board"||!Array.isArray(d.included))return reply({message:"Padlet 資料格式異常"},502);
 const inc=d.included.filter((x:any)=>x.type==="section"||x.type==="post");
 if(inc.length>10000)return reply({message:"資料過多，請使用手動匯入"},413);
 // Return only the fields needed for scoring, never attachments, student responses, or API keys.
 const included=inc.map((x:any)=>x.type==="section"?{type:x.type,id:x.id,attributes:{title:x.attributes?.title}}:{type:x.type,id:x.id,attributes:{status:x.attributes?.status,content:{subject:x.attributes?.content?.subject},author:{fullName:x.attributes?.author?.fullName}},relationships:{section:{data:{id:x.relationships?.section?.data?.id}}}});
 const total=d.data.relationships?.posts?.data;
 if(Array.isArray(total)&&total.length!==included.filter((x:any)=>x.type==="post").length)return reply({message:"貼文資料不完整，請使用手動匯入並核對"},502);
 return reply({data:{id,type:"board",attributes:{title:d.data.attributes?.title}},included});
 }catch{return reply({message:"Padlet 服務連線失敗，請稍後再試"},502)}
});
