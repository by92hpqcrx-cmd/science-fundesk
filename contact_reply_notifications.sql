-- FunDesk：取得登入教師各班最近 24 小時的導師回應。
begin;
create or replace function public.fundesk_contact_reply_notifications()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_teacher uuid := auth.uid();
 v_items jsonb;
begin
 if v_teacher is null then raise exception '教師必須登入'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.request_id),'[]'::jsonb)
 into v_items
 from (
  select class_code,entry_date,request_id,message,created_at
   from public.fundesk_contact_replies
   where teacher_id=v_teacher and created_at>=now()-interval '24 hours'
   order by created_at desc,request_id desc limit 100
 ) r;
 return v_items;
end;
$$;
revoke all on function public.fundesk_contact_reply_notifications() from public,anon,authenticated;
grant execute on function public.fundesk_contact_reply_notifications() to authenticated;
notify pgrst,'reload schema';
commit;
