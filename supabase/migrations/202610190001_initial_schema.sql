create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  school_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.syllabi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 120),
  education_level text not null,
  school_year text not null,
  academic_year integer not null check (academic_year between 2000 and 2200),
  semester smallint not null check (semester in (1, 2)),
  file_name text not null,
  storage_path text not null unique,
  extracted_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  syllabus_id uuid references public.syllabi(id) on delete set null,
  kind text not null check (kind in ('plano de aula','atividade','avaliação','gabarito','adaptação','resumo')),
  subject text not null,
  title text not null check (length(title) between 1 and 200),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index syllabi_user_period_idx on public.syllabi(user_id, academic_year desc, semester);
create index materials_user_updated_idx on public.materials(user_id, updated_at desc);
create index materials_syllabus_idx on public.materials(syllabus_id);
create table public.generation_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index generation_requests_user_time_idx on public.generation_requests(user_id, created_at desc);

grant select, insert, update, delete on public.profiles, public.syllabi, public.materials to authenticated;
grant all on public.profiles, public.syllabi, public.materials, public.generation_requests to service_role;

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger syllabi_touch before update on public.syllabi for each row execute function public.touch_updated_at();
create trigger materials_touch before update on public.materials for each row execute function public.touch_updated_at();

create function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', '')); return new; end;
$$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.syllabi enable row level security;
alter table public.materials enable row level security;
create policy "professors manage own profile" on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "professors manage own syllabi" on public.syllabi for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "professors manage own materials" on public.materials for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and (syllabus_id is null or exists (
  select 1 from public.syllabi s where s.id = syllabus_id and s.user_id = (select auth.uid())
)));

alter table public.generation_requests enable row level security;
create or replace function public.consume_generation_quota(p_user_id uuid, p_daily_limit integer, p_minute_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  daily_count integer;
  minute_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delete from public.generation_requests where user_id = p_user_id
    and created_at < pg_catalog.now() - interval '24 hours';
  select count(*) into daily_count from public.generation_requests
    where user_id = p_user_id and created_at >= pg_catalog.now() - interval '24 hours';
  select count(*) into minute_count from public.generation_requests
    where user_id = p_user_id and created_at >= pg_catalog.now() - interval '1 minute';
  if daily_count >= p_daily_limit or minute_count >= p_minute_limit then return false; end if;
  insert into public.generation_requests(user_id) values (p_user_id);
  return true;
end;
$$;
revoke all on function public.consume_generation_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_generation_quota(uuid, integer, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabi', 'syllabi', false, 15728640, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "professors access own syllabus files" on storage.objects for all to authenticated
using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);
