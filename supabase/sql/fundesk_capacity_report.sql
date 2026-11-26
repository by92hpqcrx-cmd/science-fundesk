-- FunDesk 管理員容量監控：唯讀、僅唯一管理員可呼叫
begin;
create or replace function public.fundesk_capacity_report()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare result jsonb;
begin
  if not public.fundesk_access_is_admin() then
    raise exception 'permission denied' using errcode='42501';
  end if;
  select jsonb_build_object(
    'checked_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'teacher_table_bytes', pg_total_relation_size('public.fundesk_teacher_data'::regclass),
    'storage_bytes', (select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0) from storage.objects),
    'storage_files', (select count(*) from storage.objects),
    'storage_buckets', (select coalesce(jsonb_agg(to_jsonb(b) order by b.bytes desc),'[]'::jsonb) from (select bucket_id,count(*) as files,coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0) as bytes from storage.objects group by bucket_id) b),
    'tables', (select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc),'[]'::jsonb) from (select schemaname,relname,pg_total_relation_size(relid) as bytes,n_live_tup as estimated_rows from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 20) t),
    'teacher_payloads', (select coalesce(jsonb_agg(to_jsonb(t) order by t.payload_bytes desc),'[]'::jsonb) from (
       select coalesce(u.email::text,'未知帳戶') as teacher, sum(o.payload_bytes) as payload_bytes, sum(o.writing_bytes) as writing_bytes, sum(o.paper_count) as paper_count, count(*) as records
       from (select coalesce(to_jsonb(d)->>'user_id',to_jsonb(d)->>'teacher_id',to_jsonb(d)->>'owner_id','') as owner_key,
         octet_length(coalesce(d.payload::text,'')) as payload_bytes,
         octet_length(coalesce(d.payload::jsonb->'writingTests','[]'::jsonb)::text) as writing_bytes,
         case when jsonb_typeof(d.payload::jsonb->'writingTests')='array' then jsonb_array_length(d.payload::jsonb->'writingTests') else 0 end as paper_count
         from public.fundesk_teacher_data d) o
       left join auth.users u on u.id::text=o.owner_key
       group by u.email,o.owner_key
    ) t)
  ) into result;
  return result;
end;
$$;
revoke all on function public.fundesk_capacity_report() from public, anon, authenticated;
grant execute on function public.fundesk_capacity_report() to authenticated;
commit;
notify pgrst, 'reload schema';
