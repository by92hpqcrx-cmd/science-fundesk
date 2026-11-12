-- FunDesk 導師回應：免回應碼更新。請在現有 FunDesk Supabase 專案執行一次。
begin;

create or replace function public.fundesk_contact_reply_submit_open(
  p_token text,p_entry_date date,p_request_id uuid,p_author text,p_message text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_teacher uuid;
  v_class text;
  v_author text := btrim(coalesce(p_author,''));
  v_message text := btrim(coalesce(p_message,''));
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception '班級聯絡簿網址無效';
  end if;
  if p_entry_date is null or p_request_id is null or char_length(v_author) not between 1 and 40
     or char_length(v_message) not between 1 and 1000 then
    raise exception '請填寫導師稱呼及回應內容';
  end if;
  select teacher_id,class_code into v_teacher,v_class
    from public.fundesk_contact_shares where share_token=p_token;
  if v_teacher is null then raise exception '班級聯絡簿網址無效'; end if;
  if not exists (select 1 from public.fundesk_contact_entries where
      teacher_id=v_teacher and class_code=v_class and entry_date=p_entry_date) then
    raise exception '該日期沒有已發布的聯絡簿';
  end if;
  insert into public.fundesk_contact_replies(teacher_id,class_code,entry_date,request_id,author_name,message)
  values(v_teacher,v_class,p_entry_date,p_request_id,v_author,v_message)
  on conflict (teacher_id,class_code,entry_date,request_id) do nothing;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.fundesk_contact_reply_submit_open(text,date,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fundesk_contact_reply_submit_open(text,date,uuid,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
