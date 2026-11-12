-- 啟用 FunDesk 主程式及學生端逐筆刪除導師回應。
begin;

create or replace function public.fundesk_contact_teacher_reply_delete(
 p_class_code text,p_entry_date date,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_teacher uuid := auth.uid();
begin
 if v_teacher is null then raise exception '教師必須登入'; end if;
 if p_class_code is null or p_entry_date is null or p_request_id is null then
  raise exception '缺少回應識別資料';
 end if;
 delete from public.fundesk_contact_replies
  where teacher_id=v_teacher and class_code=p_class_code
   and entry_date=p_entry_date and request_id=p_request_id;
 return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.fundesk_contact_sent_reply_delete(
 p_token text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_teacher uuid;
 v_class text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_request_id is null then
  raise exception '聯絡簿網址或回應識別資料無效';
 end if;
 select teacher_id,class_code into v_teacher,v_class
  from public.fundesk_contact_shares where share_token=p_token;
 if v_teacher is null then raise exception '聯絡簿網址無效'; end if;
 -- Only the sending browser and authenticated teacher know the random UUID.
 delete from public.fundesk_contact_replies
  where teacher_id=v_teacher and class_code=v_class and request_id=p_request_id;
 return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.fundesk_contact_teacher_reply_delete(text,date,uuid) from public,anon,authenticated;
revoke all on function public.fundesk_contact_sent_reply_delete(text,uuid) from public,anon,authenticated;
grant execute on function public.fundesk_contact_teacher_reply_delete(text,date,uuid) to authenticated;
grant execute on function public.fundesk_contact_sent_reply_delete(text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
