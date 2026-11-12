-- FunDesk 雙向留言。請在已啟用聯絡簿與導師回應的 Supabase 專案執行。
begin;
alter table public.fundesk_contact_replies add column if not exists author_role text not null
 default 'homeroom' check (author_role in ('homeroom','subject'));

create or replace function public.fundesk_contact_messages(
 p_class_code text default null,p_thread_token text default null,
 p_message text default null,p_request_id uuid default null,p_entry_date date default null,p_share_token text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid;
 v_code text;
 v_token text;
 v_role text;
 v_date date;
 v_message text := btrim(coalesce(p_message,''));
 v_messages jsonb;
begin
 if p_thread_token is not null then
  if p_thread_token !~ '^[0-9a-f]{64}$' then raise exception '導師留言網址無效'; end if;
  select teacher_id,class_code into v_owner,v_code from public.fundesk_contact_shares
   where reply_token=p_thread_token and share_token=p_share_token;
  v_role := 'homeroom';
 else
  if auth.uid() is null then raise exception '請先登入教師帳號'; end if;
  select teacher_id,class_code,reply_token into v_owner,v_code,v_token from public.fundesk_contact_shares
   where teacher_id=auth.uid() and class_code=p_class_code;
  v_role := 'subject';
 end if;
 if v_owner is null then raise exception '留言區尚未建立或網址無效'; end if;
 select max(entry_date) into v_date from public.fundesk_contact_entries
  where teacher_id=v_owner and class_code=v_code;
 if p_message is not null then
  if p_request_id is null or char_length(v_message) not between 1 and 1000 then raise exception '請填寫 1 至 1000 字的留言'; end if;
  if v_role='subject' and exists(select 1 from public.fundesk_contact_entries where teacher_id=v_owner and class_code=v_code and entry_date=p_entry_date) then v_date := p_entry_date; end if;
  if v_date is null or not exists(select 1 from public.fundesk_contact_entries
     where teacher_id=v_owner and class_code=v_code and entry_date=v_date) then
    raise exception '請先發布一則班級聯絡簿';
  end if;
  insert into public.fundesk_contact_replies(teacher_id,class_code,entry_date,request_id,author_name,author_role,message)
  values(v_owner,v_code,v_date,p_request_id,case when v_role='subject' then '科任老師' else '導師' end,v_role,v_message)
  on conflict (teacher_id,class_code,entry_date,request_id) do nothing;
 end if;
 select coalesce(jsonb_agg(case when v_role='homeroom' then to_jsonb(m)-'request_id' else to_jsonb(m) end order by m.created_at,m.request_id),'[]'::jsonb)
 into v_messages from (
  select request_id,entry_date,author_role,message,created_at from public.fundesk_contact_replies
  where teacher_id=v_owner and class_code=v_code order by created_at desc,request_id desc limit 10
 ) m;
 return jsonb_build_object('messages',v_messages,'thread_token',v_token,'can_post',v_date is not null);
end;
$$;
revoke all on function public.fundesk_contact_messages(text,text,text,uuid,date,text) from public,anon,authenticated;
grant execute on function public.fundesk_contact_messages(text,text,text,uuid,date,text) to anon,authenticated;
-- Close the old unauthenticated writing path on the regular student link.
do $$
begin
 if to_regprocedure('public.fundesk_contact_reply_submit_open(text,date,uuid,text,text)') is not null then
  execute 'revoke all on function public.fundesk_contact_reply_submit_open(text,date,uuid,text,text) from public,anon,authenticated';
 end if;
end;
$$;
create or replace function public.fundesk_contact_reply_notifications()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_teacher uuid := auth.uid(); v_items jsonb;
begin
 if v_teacher is null then raise exception '教師必須登入'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.request_id),'[]'::jsonb) into v_items
 from (select class_code,entry_date,request_id,message,created_at from public.fundesk_contact_replies
 where teacher_id=v_teacher and author_role='homeroom' and created_at>=now()-interval '24 hours'
 order by created_at desc,request_id desc limit 100) r;
 return v_items;
end;
$$;
revoke all on function public.fundesk_contact_reply_notifications() from public,anon,authenticated;
grant execute on function public.fundesk_contact_reply_notifications() to authenticated;
notify pgrst,'reload schema';
commit;
