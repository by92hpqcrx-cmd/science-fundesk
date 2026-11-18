-- FunDesk 學生端動態教室（需由 Supabase SQL Editor 執行一次）
-- 前置假設：public.fundesk_teacher_data 有 user_id, class_code, payload, revision 欄位。
-- 本檔不授予 anon 存取教師資料表的權限；只開放經班級分享 token 限制的 RPC。
create table if not exists public.fundesk_student_room_links(
 token_hash text primary key,
 owner_id uuid not null,
 class_code text not null,
 created_at timestamptz not null default now(),
 unique(owner_id,class_code)
);
alter table public.fundesk_student_room_links enable row level security;
revoke all on public.fundesk_student_room_links from anon, authenticated;

create or replace function public.fundesk_student_room_publish(p_token text, p_class_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception '請先登入教師帳號'; end if;
 if p_token !~ '^[0-9a-f]{64}$' or p_class_code !~ '^[A-Za-z0-9_-]{1,40}$'
 then raise exception '班級網址不正確'; end if;
 if not exists(select 1 from public.fundesk_teacher_data d where d.user_id=auth.uid() and d.class_code=p_class_code)
 then raise exception '沒有此班級的教師權限'; end if;
 insert into public.fundesk_student_room_links(token_hash,owner_id,class_code)
 values(md5(p_token),auth.uid(),p_class_code)
 on conflict(owner_id,class_code) do update set token_hash=excluded.token_hash;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fundesk_student_room_publish(text,text) from public;
grant execute on function public.fundesk_student_room_publish(text,text) to authenticated;

create or replace function public.fundesk_student_room_read(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.fundesk_student_room_links%rowtype; v_payload jsonb;v_shared jsonb;v_students jsonb;v_points jsonb;
begin
 if p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','班級連結無效');end if;
 select * into v_link from public.fundesk_student_room_links where token_hash=md5(p_token);
 if not found then return jsonb_build_object('error','學生端尚未啟用，請老師在 FunDesk 聯絡簿按「啟用學生動態教室」');end if;
 select d.payload into v_payload from public.fundesk_teacher_data d where d.user_id=v_link.owner_id and d.class_code=v_link.class_code;
 if v_payload is null then return jsonb_build_object('error','找不到對應班級');end if;
 select d.payload into v_shared from public.fundesk_teacher_data d where d.user_id=v_link.owner_id and d.class_code='shared';
 select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','no',x->>'no','name',x->>'name','avatar',x->>'avatar')),'[]'::jsonb)
 into v_students from jsonb_array_elements(coalesce(v_payload->'students','[]'::jsonb)) x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into v_points
 from jsonb_array_elements(coalesce(v_payload->'points','[]'::jsonb)) x
 where x->>'kind' in ('redemption','feeding-ticket-used') and
 ((x->>'kind'='feeding-ticket-used') or (x->>'rewardId'='feeding-ticket'));
 return jsonb_build_object('class_code',v_link.class_code,
 'class_name',coalesce(v_shared->'classMeta'->v_link.class_code->>'name',v_link.class_code),
 'students',v_students,'points',v_points,
 'attendance',coalesce(v_payload->'attendance','[]'::jsonb),
 'classPetType',coalesce(v_payload->'classPetType','null'::jsonb),
 'roomScene',coalesce(v_payload->'roomScene','"classroom"'::jsonb),
 'roomFeedingLog',coalesce(v_payload->'roomFeedingLog','[]'::jsonb),
 'roomFeeding',coalesce(v_payload->'roomFeeding','{}'::jsonb),
 'classPetFeedings',coalesce(v_payload->'classPetFeedings','{}'::jsonb),
 'classPetProgress',coalesce(v_payload->'classPetProgress','{}'::jsonb),
 'roomTeacherFeed',coalesce(v_payload->'roomTeacherFeed','{}'::jsonb));
end $$;
revoke all on function public.fundesk_student_room_read(text) from public;
grant execute on function public.fundesk_student_room_read(text) to anon, authenticated;

create or replace function public.fundesk_student_room_action(
 p_token text,p_action text,p_feeder text default null,p_target_type text default null,
 p_target_id text default null,p_food text default null,p_avatar text default null,
 p_passcode text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_link public.fundesk_student_room_links%rowtype;
 v_payload jsonb;v_shared jsonb;v_points jsonb;v_log jsonb;v_student jsonb;v_target jsonb;
 v_old jsonb;v_all jsonb;v_n int;v_bought int;v_used int;v_now bigint;
 v_until bigint;v_count int;v_pet text;v_name text;v_feedername text;
 v_ticket boolean;v_id text;v_progress jsonb;v_oldpoints int;v_record jsonb;
begin
 if p_token !~ '^[0-9a-f]{64}$' then raise exception '班級連結無效';end if;
 select * into v_link from public.fundesk_student_room_links where token_hash=md5(p_token);
 if not found then raise exception '學生端尚未啟用';end if;
 select d.payload into v_payload from public.fundesk_teacher_data d
 where d.user_id=v_link.owner_id and d.class_code=v_link.class_code for update;
 if v_payload is null then raise exception '班級資料不存在';end if;
 select d.payload into v_shared from public.fundesk_teacher_data d where d.user_id=v_link.owner_id and d.class_code='shared';
 v_points:=coalesce(v_payload->'points','[]'::jsonb);v_log:=coalesce(v_payload->'roomFeedingLog','[]'::jsonb);
 v_now:=(extract(epoch from clock_timestamp())*1000)::bigint;
 if p_action='avatar' then
   if p_passcode is distinct from coalesce(v_shared->>'teacherFeedingPassword','13579') then raise exception '動態教室密碼錯誤';end if;
   if p_avatar is not null and (length(p_avatar)>60 or p_avatar !~ '^[A-Za-z0-9_-]+$') then raise exception '頭像名稱不正確';end if;
   select x into v_student from jsonb_array_elements(coalesce(v_payload->'students','[]'::jsonb)) x where x->>'id'=p_feeder limit 1;
   if v_student is null then raise exception '學生不存在';end if;
   select coalesce(jsonb_agg(case when x->>'id'=p_feeder then
     case when p_avatar is null then x-'avatar' else jsonb_set(x,'{avatar}',to_jsonb(p_avatar)) end
     else x end),'[]'::jsonb) into v_all from jsonb_array_elements(v_payload->'students') x;
   v_payload:=jsonb_set(v_payload,'{students}',v_all,true);
 elsif p_action='feed' then
   if p_food not in ('apple','banana','strawberry','grapes','cookie','donut','juice','milk','bamboo','fish','bone','pinecone','carrot')
   then raise exception '食物選項無效';end if;
   if p_target_type not in ('student','pet','teacher') then raise exception '餵食對象無效';end if;
   v_ticket:=p_feeder<>'__teacher__';
   if v_ticket then
     select x into v_student from jsonb_array_elements(coalesce(v_payload->'students','[]'::jsonb)) x where x->>'id'=p_feeder limit 1;
     if v_student is null then raise exception '餵食學生不存在';end if;
     v_feedername:=v_student->>'name';
     select count(*) into v_bought from jsonb_array_elements(v_points) x where x->>'sid'=p_feeder and x->>'kind'='redemption' and x->>'rewardId'='feeding-ticket' and coalesce((x->>'cancelled')::boolean,false)=false;
     select count(*) into v_used from jsonb_array_elements(v_points) x where x->>'sid'=p_feeder and x->>'kind'='feeding-ticket-used' and coalesce((x->>'cancelled')::boolean,false)=false;
     select v_used+count(*) into v_used from jsonb_array_elements(v_log) x where x->>'feederSid'=p_feeder and x->>'ticketUsed'='true' and not(x?'ledgerId');
     if v_bought<=v_used then raise exception '餵食券不足';end if;
   else
     if p_passcode is distinct from coalesce(v_shared->>'teacherFeedingPassword','13579') then raise exception '動態教室密碼錯誤';end if;
     v_feedername:='老師';
   end if;
   if p_target_type='teacher' and not v_ticket then raise exception '教師不可餵自己';end if;
   if p_target_type='student' then
     select x into v_target from jsonb_array_elements(coalesce(v_payload->'students','[]'::jsonb)) x where x->>'id'=p_target_id limit 1;
     if v_target is null then raise exception '找不到餵食對象';end if;
     v_name:=v_target->>'name';
     v_old:=coalesce(v_payload->'roomFeeding'->p_target_id,'{}'::jsonb);
     v_n:=3;
   elsif p_target_type='pet' then
     v_pet:=v_payload->>'classPetType';
     if v_pet is null or v_pet<>p_target_id then raise exception '班寵已切換，請重新整理';end if;
     v_name:=v_pet;
     v_old:=coalesce(v_payload->'classPetFeedings'->v_pet,'{}'::jsonb);
     v_n:=10;
   else
     v_name:='老師';v_old:=coalesce(v_payload->'roomTeacherFeed','{}'::jsonb);v_n:=3;
   end if;
   v_until:=coalesce((v_old->>'until')::bigint,0);
   if v_until>v_now then raise exception '目前吃飽休息中';end if;
   v_count:=case when v_until>0 then 0 else coalesce((v_old->>'count')::int,0) end;
   if v_count>=v_n then raise exception '目前已吃飽';end if;
   v_count:=v_count+1;
   v_record:=jsonb_build_object('count',v_count,'until',case when v_count>=v_n then v_now+3600000 else 0 end);
   if p_target_type='student' then
     v_payload:=jsonb_set(v_payload,array['roomFeeding',p_target_id],v_record,true);
   elsif p_target_type='pet' then
     v_payload:=jsonb_set(v_payload,array['classPetFeedings',v_pet],v_record,true);
     v_progress:=coalesce(v_payload->'classPetProgress'->v_pet,'{}'::jsonb);
     v_oldpoints:=least(99,greatest(0,coalesce((v_progress->>'points')::int,0)))+1;
     v_payload:=jsonb_set(v_payload,array['classPetProgress',v_pet],
       jsonb_build_object('points',case when v_oldpoints>=100 then 0 else v_oldpoints end,
       'cycles',coalesce((v_progress->>'cycles')::int,0)+case when v_oldpoints>=100 then 1 else 0 end),true);
   else
     v_payload:=jsonb_set(v_payload,'{roomTeacherFeed}',v_record,true);
   end if;
   v_id:=gen_random_uuid()::text;
   if v_ticket then
     v_points:=v_points||jsonb_build_array(jsonb_build_object('id',v_id,'sid',p_feeder,'date',(now() at time zone 'Asia/Taipei')::date,
     'delta',0,'kind','feeding-ticket-used','reason','餵食券使用','target',v_name));
     v_payload:=jsonb_set(v_payload,'{points}',v_points,true);
   end if;
   v_log:=v_log||jsonb_build_array(jsonb_build_object('kind',p_target_type,'name',v_name,'sid',case when p_target_type='student' then p_target_id else null end,
     'pet',case when p_target_type='pet' then v_pet else null end,'food',p_food,'count',v_count,
     'at',v_now,'feederSid',p_feeder,'feederName',v_feedername,'ticketUsed',v_ticket,'ledgerId',v_id));
   if jsonb_array_length(v_log)>150 then select coalesce(jsonb_agg(x),'[]'::jsonb) into v_log from
     (select x from jsonb_array_elements(v_log) with ordinality t(x,n) order by n desc limit 150) a;
     -- 始終按時間順序保存，以供教師端 slice(-N) 使用
     select coalesce(jsonb_agg(x),'[]'::jsonb) into v_log from
       (select x from jsonb_array_elements(v_log) with ordinality t(x,n) order by n asc) z;
   end if;
   v_payload:=jsonb_set(v_payload,'{roomFeedingLog}',v_log,true);
 else
   raise exception '不支援此操作';
 end if;
 update public.fundesk_teacher_data set payload=v_payload,revision=coalesce(revision,0)+1
 where user_id=v_link.owner_id and class_code=v_link.class_code;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fundesk_student_room_action(text,text,text,text,text,text,text,text) from public;
grant execute on function public.fundesk_student_room_action(text,text,text,text,text,text,text,text) to anon, authenticated;
