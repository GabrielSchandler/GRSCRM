-- Review in a staging environment before applying. No existing data is deleted.
begin;

create table if not exists public.company_lifecycle (
  company_id uuid primary key references public.companies(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '3 months'),
  previous_status text not null,
  deleted_by uuid references public.user_profiles(id) on delete set null,
  purge_started_at timestamptz,
  purge_error text,
  check (purge_after > deleted_at)
);
alter table public.company_lifecycle enable row level security;
drop policy if exists company_lifecycle_master_select on public.company_lifecycle;
create policy company_lifecycle_master_select on public.company_lifecycle
  for select to authenticated using (public.current_user_is_platform_owner());

create or replace function public.set_company_archive(target_company uuid, restore_company boolean, actor_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare old_status text; lifecycle public.company_lifecycle;
begin
  if not exists (select 1 from public.user_profiles where id = actor_profile and is_platform_owner and is_active) then
    raise exception 'Platform owner required';
  end if;
  perform 1 from public.companies where id = target_company for update;
  if not found then raise exception 'Company not found'; end if;
  if exists (select 1 from public.user_profiles where company_id = target_company and is_platform_owner) then
    raise exception 'Master company is protected';
  end if;
  select * into lifecycle from public.company_lifecycle where company_id = target_company for update;
  if restore_company then
    if lifecycle.company_id is null or lifecycle.purge_after <= now() or lifecycle.purge_started_at is not null then
      raise exception 'Restoration unavailable';
    end if;
    delete from public.company_lifecycle where company_id = target_company;
    update public.company_platform_settings set status = lifecycle.previous_status, updated_by = actor_profile, updated_at = now() where company_id = target_company;
  else
    if lifecycle.company_id is not null then raise exception 'Company already archived'; end if;
    select status into old_status from public.company_platform_settings where company_id = target_company for update;
    insert into public.company_lifecycle(company_id, previous_status, deleted_by)
      values (target_company, coalesce(old_status, 'active'), actor_profile);
    insert into public.company_platform_settings(company_id, status, updated_by)
      values (target_company, 'cancelled', actor_profile)
      on conflict(company_id) do update set status = 'cancelled', updated_by = actor_profile, updated_at = now();
  end if;
end;
$$;
revoke all on function public.set_company_archive(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_company_archive(uuid, boolean, uuid) to service_role;

-- Serialize status changes with archive/restore so a concurrent unblock cannot bypass retention.
create or replace function public.guard_archived_company_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.companies where id = new.company_id for update;
  if new.status <> 'cancelled' and exists (select 1 from public.company_lifecycle where company_id = new.company_id) then
    raise exception 'Archived company must be restored before changing status';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_archived_company_status() from public, anon, authenticated;
drop trigger if exists company_archive_status_guard on public.company_platform_settings;
create trigger company_archive_status_guard before insert or update of status on public.company_platform_settings
  for each row execute function public.guard_archived_company_status();

-- Locks out restoration before deleting any files. Retry keeps the original deadline.
create or replace function public.claim_company_purge(target_company uuid)
returns table(bucket_id text, name text) language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.company_lifecycle where company_id = target_company and purge_after <= now() for update;
  if not found then raise exception 'Retention period has not expired'; end if;
  if exists (select 1 from public.user_profiles where company_id = target_company and is_platform_owner) then raise exception 'Master company is protected'; end if;
  -- External backups are not stored in Supabase. Never pretend they were erased.
  if exists (select 1 from public.backup_jobs where company_id = target_company and storage_bucket = 'github-releases') then
    raise exception 'External backups require verified removal before purge';
  end if;
  -- Unknown/non-cascading relationships require manual schema review, not guessed deletes.
  if exists (select 1 from pg_constraint where contype = 'f' and confrelid = 'public.companies'::regclass and confdeltype <> 'c') then
    raise exception 'Non-cascading company relationships require schema review';
  end if;
  update public.company_lifecycle set purge_started_at = coalesce(purge_started_at, now()), purge_error = null where company_id = target_company;
  return query select o.bucket_id, o.name from storage.objects o where split_part(o.name, '/', 1) = target_company::text;
end;
$$;
revoke all on function public.claim_company_purge(uuid) from public, anon, authenticated;
grant execute on function public.claim_company_purge(uuid) to service_role;

create or replace function public.purge_company_database(target_company uuid)
returns void language plpgsql security definer set search_path = public as $$
declare identities uuid[];
begin
  perform 1 from public.company_lifecycle where company_id = target_company and purge_after <= now() and purge_started_at is not null for update;
  if not found then raise exception 'Company is not ready for purge'; end if;
  if exists (select 1 from public.user_profiles where company_id = target_company and is_platform_owner) then raise exception 'Master company is protected'; end if;
  if exists (select 1 from storage.objects where split_part(name, '/', 1) = target_company::text) then raise exception 'Storage cleanup is incomplete'; end if;
  select array_agg(auth_user_id) into identities from public.user_profiles where company_id = target_company;
  -- Company and linked database records are removed in the same transaction.
  delete from public.companies where id = target_company;
  delete from auth.users where id = any(coalesce(identities, array[]::uuid[]))
    and not exists (select 1 from public.user_profiles where auth_user_id = auth.users.id);
end;
$$;
revoke all on function public.purge_company_database(uuid) from public, anon, authenticated;
grant execute on function public.purge_company_database(uuid) to service_role;

-- Restrictive policies complement existing tenant policies; they never grant access.
create or replace function public.company_access_allowed(target_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_is_platform_owner() or not exists (
    select 1 from public.company_platform_settings where company_id = target_company and status in ('suspended', 'cancelled')
  );
$$;
revoke all on function public.company_access_allowed(uuid) from public, anon;
grant execute on function public.company_access_allowed(uuid) to authenticated;
do $$
declare target record;
begin
  for target in select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'company_id' and data_type = 'uuid'
      and table_name not in ('company_platform_settings', 'company_lifecycle', 'user_profiles')
      and exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = table_name)
  loop
    execute format('drop policy if exists company_active_gate on public.%I', target.table_name);
    execute format('create policy company_active_gate on public.%I as restrictive for all to authenticated using (public.company_access_allowed(company_id)) with check (public.company_access_allowed(company_id))', target.table_name);
  end loop;
end;
$$;

commit;
