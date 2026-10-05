-- Apply once in the Supabase SQL editor. No business records are changed.
begin;

create table if not exists public.user_presence (
  user_profile_id uuid primary key references public.user_profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index if not exists user_presence_company_seen_idx on public.user_presence(company_id, last_seen_at);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon;
grant select, insert, update on public.user_presence to authenticated;

create or replace function public.stamp_user_presence()
returns trigger language plpgsql set search_path = public as $$
begin
  new.last_seen_at := now();
  return new;
end;
$$;
drop trigger if exists user_presence_timestamp on public.user_presence;
create trigger user_presence_timestamp before insert or update on public.user_presence
for each row execute function public.stamp_user_presence();

drop policy if exists user_presence_read on public.user_presence;
create policy user_presence_read on public.user_presence for select to authenticated using (
  exists (select 1 from public.user_profiles p where p.auth_user_id = auth.uid() and p.is_active = true
    and (p.id = user_profile_id or (p.company_id = user_presence.company_id and p.role in ('admin', 'manager')) or p.is_platform_owner = true))
);
drop policy if exists user_presence_insert on public.user_presence;
create policy user_presence_insert on public.user_presence for insert to authenticated with check (
  exists (select 1 from public.user_profiles p where p.auth_user_id = auth.uid() and p.is_active = true
    and p.id = user_profile_id and p.company_id = user_presence.company_id)
);
drop policy if exists user_presence_update on public.user_presence;
create policy user_presence_update on public.user_presence for update to authenticated using (
  exists (select 1 from public.user_profiles p where p.auth_user_id = auth.uid() and p.is_active = true
    and p.id = user_profile_id and p.company_id = user_presence.company_id)
) with check (
  exists (select 1 from public.user_profiles p where p.auth_user_id = auth.uid() and p.is_active = true
    and p.id = user_profile_id and p.company_id = user_presence.company_id)
);
commit;
