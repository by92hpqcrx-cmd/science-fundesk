-- FunDesk 留言名稱：請在已啟用班級聯絡簿的 Supabase SQL Editor 執行。
begin;
alter table public.fundesk_contact_replies add column if not exists author_role text not null
 default 'homeroom' check (author_role in ('homeroom','subject'));
alter table public.fundesk_contact_replies add column if not exists visible_in_notebook boolean not null default false;
alter table public.fundesk_contact_shares add column if not exists homeroom_name text check (char_length(homeroom_name) <= 40);
create table if not exists public.fundesk_contact_teacher_names (
 teacher_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (char_length(display_name) between 1 and 40)
);
alter table public.fundesk_contact_teacher_names enable row level security;
revoke all on table public.fundesk_contact_teacher_names from public,anon,authenticated;

create or replace function public.fundesk_contact_set_names(p_class_code text,p_subject_name text,p_homeroom_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_teacher uuid := auth.uid();
 v_subject text := nullif(btrim(coalesce(p_subject_name,'')),'');
 v_homeroom text := nullif(btrim(coalesce(p_homeroom_name,'')),'');
begin
 if v_teacher is null then raise exception '請先登入教師帳號'; end if;
 if char_length(v_subject)>40 or char_length(v_homeroom)>40 then raise exception '名稱最多 40 字'; end if;
 update public.fundesk_contact_shares set homeroom_name=v_homeroom
  where teacher_id=v_teacher and class_code=p_class_code;
 if not found then raise exception '找不到本班聯絡簿'; end if;
 if v_subject is null then
  delete from public.fundesk_contact_teacher_names where teacher_id=v_teacher;
 else
  insert into public.fundesk_contact_teacher_names(teacher_id,display_name) values(v_teacher,v_subject)
   on conflict(teacher_id) do update set display_name=excluded.display_name;
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.fundesk_contact_set_names(text,text,text) from public,anon,authenticated;
grant execute on function public.fundesk_contact_set_names(text,text,text) to authenticated;

create or replace function public.fundesk_contact_messages(
 p_class_code text default null,p_thread_token text default null,
 p_message text default null,p_request_id uuid default null,p_entry_date date default null,p_share_token text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid;
 v_code text;
 v_role text;
 v_subject_name text;
 v_homeroom_name text;
 v_date date;
 v_message text := btrim(coalesce(p_message,''));
 v_messages jsonb;
begin
 if p_share_token is not null then
  if p_share_token !~ '^[0-9a-f]{64}$' then raise exception '班級聯絡簿網址無效'; end if;
  select teacher_id,class_code into v_owner,v_code from public.fundesk_contact_shares
   where share_token=p_share_token;
  v_role := 'homeroom';
 else
  if auth.uid() is null then raise exception '請先登入教師帳號'; end if;
  select teacher_id,class_code into v_owner,v_code from public.fundesk_contact_shares
   where teacher_id=auth.uid() and class_code=p_class_code;
  v_role := 'subject';
 end if;
 if v_owner is null then raise exception '留言區尚未建立或網址無效'; end if;
 select display_name into v_subject_name from public.fundesk_contact_teacher_names where teacher_id=v_owner;
 select homeroom_name into v_homeroom_name from public.fundesk_contact_shares
  where teacher_id=v_owner and class_code=v_code;
 select max(entry_date) into v_date from public.fundesk_contact_entries
  where teacher_id=v_owner and class_code=v_code;
 if p_message is not null then
  if p_request_id is null or char_length(v_message) not between 1 and 1000 then raise exception '請填寫 1 至 1000 字的留言'; end if;
  if v_role='subject' and exists(select 1 from public.fundesk_contact_entries where teacher_id=v_owner and class_code=v_code and entry_date=p_entry_date) then v_date := p_entry_date; end if;
  if v_date is null or not exists(select 1 from public.fundesk_contact_entries
     where teacher_id=v_owner and class_code=v_code and entry_date=v_date) then
    raise exception '請先發布一則班級聯絡簿';
  end if;
  insert into public.fundesk_contact_replies(teacher_id,class_code,entry_date,request_id,author_name,author_role,message,visible_in_notebook)
  values(v_owner,v_code,v_date,p_request_id,case when v_role='subject' then coalesce(v_subject_name,'科任老師') else coalesce(v_homeroom_name,'導師') end,v_role,v_message,true)
  on conflict (teacher_id,class_code,entry_date,request_id) do nothing;
 end if;
 select coalesce(jsonb_agg(case when v_role='homeroom' then to_jsonb(m)-'request_id' else to_jsonb(m) end order by m.created_at,m.request_id),'[]'::jsonb)
 into v_messages from (
  select request_id,entry_date,author_role,message,created_at,
   case when author_role='subject' then coalesce(v_subject_name,'科任老師') else coalesce(v_homeroom_name,'導師') end as display_name
  from public.fundesk_contact_replies
  where teacher_id=v_owner and class_code=v_code and (v_role='subject' or visible_in_notebook)
  order by created_at desc,request_id desc limit 10
 ) m;
 return jsonb_build_object('messages',v_messages,'can_post',v_date is not null,
  'display_names',case when v_role='subject' then jsonb_build_object('subject',v_subject_name,'homeroom',v_homeroom_name) end);
end;
$$;
revoke all on function public.fundesk_contact_messages(text,text,text,uuid,date,text) from public,anon,authenticated;
grant execute on function public.fundesk_contact_messages(text,text,text,uuid,date,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
