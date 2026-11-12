-- FunDesk 導師回應。請在現有 FunDesk Supabase 專案執行一次。
begin;

alter table public.fundesk_contact_shares
  add column if not exists reply_token text not null
  default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
create unique index if not exists fundesk_contact_reply_token_idx
  on public.fundesk_contact_shares(reply_token);

create table if not exists public.fundesk_contact_replies (
  teacher_id uuid not null,
  class_code text not null,
  entry_date date not null,
  request_id uuid not null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (teacher_id,class_code,entry_date,request_id),
  foreign key (teacher_id,class_code,entry_date)
    references public.fundesk_contact_entries(teacher_id,class_code,entry_date) on delete cascade
);
alter table public.fundesk_contact_replies enable row level security;
revoke all on public.fundesk_contact_replies from public,anon,authenticated;

create or replace function public.fundesk_contact_reply_submit(
  p_token text,p_reply_token text,p_entry_date date,p_request_id uuid,p_author text,p_message text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_teacher uuid;
  v_class text;
  v_author text := btrim(coalesce(p_author,''));
  v_message text := btrim(coalesce(p_message,''));
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or p_reply_token is null or p_reply_token !~ '^[0-9a-f]{64}$' then
    raise exception '導師回應網址無效';
  end if;
  if p_entry_date is null or p_request_id is null or char_length(v_author) not between 1 and 40
     or char_length(v_message) not between 1 and 1000 then
    raise exception '請填寫導師稱呼及回應內容';
  end if;
  select teacher_id,class_code into v_teacher,v_class
    from public.fundesk_contact_shares where share_token=p_token and reply_token=p_reply_token;
  if v_teacher is null then raise exception '導師回應網址無效'; end if;
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

create or replace function public.fundesk_contact_teacher_replies(p_class_code text,p_entry_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_teacher uuid := auth.uid();
  v_token text;
  v_replies jsonb;
begin
  if v_teacher is null then raise exception '教師必須登入'; end if;
  select reply_token into v_token from public.fundesk_contact_shares
   where teacher_id=v_teacher and class_code=p_class_code;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.request_id),'[]'::jsonb)
    into v_replies
    from (select request_id,author_name,message,created_at from public.fundesk_contact_replies
          where teacher_id=v_teacher and class_code=p_class_code and entry_date=p_entry_date
          order by created_at desc,request_id limit 100) r;
  return jsonb_build_object('reply_token',v_token,'replies',v_replies);
end;
$$;

revoke all on function public.fundesk_contact_reply_submit(text,text,date,uuid,text,text) from public,anon,authenticated;
revoke all on function public.fundesk_contact_teacher_replies(text,date) from public,anon,authenticated;
grant execute on function public.fundesk_contact_reply_submit(text,text,date,uuid,text,text) to anon,authenticated;
grant execute on function public.fundesk_contact_teacher_replies(text,date) to authenticated;
notify pgrst,'reload schema';
commit;
