-- Execute no SQL Editor do Supabase, uma vez, antes de iniciar o aplicativo.
begin;
create table public.profiles (
 user_id uuid primary key references auth.users on delete cascade,
 name text not null, subjects jsonb not null default '[]', classes jsonb not null default '[]'
);
create table public.files (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 filename text not null, path text not null, text text not null,
 created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.syllabi (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null, subject text not null, stage text not null, classroom text not null default '',
 created_at timestamptz not null default now(), unique(id,user_id)
);
create table public.syllabus_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 syllabus_id uuid not null, file_id uuid not null, version int not null,
 name text not null, subject text not null, stage text not null, classroom text not null,
 filename text not null, text text not null, created_at timestamptz not null default now(),
 unique(id,user_id), unique(syllabus_id,version),
 foreign key(syllabus_id,user_id) references public.syllabi(id,user_id),
 foreign key(file_id,user_id) references public.files(id,user_id)
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null, task text not null, version_id uuid,
 subject text not null default '', classroom text not null default '',
 created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(version_id,user_id) references public.syllabus_versions(id,user_id)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 conversation_id uuid not null, role text not null check(role in ('user','assistant')),
 content text not null, file_ids uuid[] not null default '{}', request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(conversation_id,request_id,role),
 foreign key(conversation_id,user_id) references public.conversations(id,user_id)
);
create table public.materials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 conversation_id uuid not null, request_id uuid not null, title text not null,
 student text not null, teacher text not null default '', created_at timestamptz not null default now(),
 unique(id,user_id), unique(conversation_id,request_id),
 foreign key(conversation_id,user_id) references public.conversations(id,user_id)
);
create table public.exports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 material_id uuid not null, path text not null, format text not null, audience text not null,
 created_at timestamptz not null default now(),
 foreign key(material_id,user_id) references public.materials(id,user_id)
);
create table public.ai_secrets (
 user_id uuid primary key references auth.users on delete cascade,
 mode text not null default 'project' check(mode in ('project','personal')), encrypted_key text,
 check(mode <> 'personal' or encrypted_key is not null)
);
create table public.usage_daily (
 user_id uuid not null references auth.users on delete cascade, day date not null, calls int not null default 0,
 primary key(user_id,day)
);
create table public.generation_locks (
 user_id uuid primary key references auth.users on delete cascade, conversation_id uuid not null,
 expires_at timestamptz not null
);

do $$ declare t text; begin
 foreach t in array array['profiles','files','syllabi','syllabus_versions','conversations','messages','materials','exports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
  execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
  execute format('grant select, insert on public.%I to authenticated',t);
 end loop;
 foreach t in array array['profiles','syllabi','materials'] loop
  execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 end loop;
 foreach t in array array['ai_secrets','usage_daily','generation_locks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
grant update(name,subjects,classes) on public.profiles to authenticated;
grant update(name) on public.syllabi to authenticated;
grant update(title) on public.materials to authenticated;
-- Supabase defaults can include broader grants: remove update/delete explicitly.
revoke update, delete on public.syllabus_versions, public.conversations, public.messages, public.files, public.exports from authenticated;
revoke update on public.syllabi, public.materials from authenticated;
grant update(name) on public.syllabi to authenticated;
grant update(title) on public.materials to authenticated;

create function public.add_syllabus_version(p_id uuid, p_name text, p_subject text, p_stage text, p_classroom text, p_file uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare sid uuid; f public.files; v public.syllabus_versions; n int;
begin
 select * into strict f from public.files where id=p_file and user_id=auth.uid();
 if p_id is null then
  insert into public.syllabi(user_id,name,subject,stage,classroom) values(auth.uid(),p_name,p_subject,p_stage,p_classroom) returning id into sid;
 else
  select id into strict sid from public.syllabi where id=p_id and user_id=auth.uid() for update;
 end if;
 select coalesce(max(version),0)+1 into n from public.syllabus_versions where syllabus_id=sid;
 insert into public.syllabus_versions(user_id,syllabus_id,file_id,version,name,subject,stage,classroom,filename,text)
 values(auth.uid(),sid,p_file,n,p_name,p_subject,p_stage,p_classroom,f.filename,f.text) returning * into v;
 return to_jsonb(v);
end $$;

create function public.save_exchange(p_conversation uuid,p_request uuid,p_text text,p_files uuid[],p_answer jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_conversation::text,1));
 perform 1 from public.conversations where id=p_conversation and user_id=auth.uid();
 if not found then raise exception 'Not found'; end if;
 if exists(select 1 from public.messages where conversation_id=p_conversation and request_id=p_request and role='assistant') then return; end if;
 if exists(select 1 from unnest(p_files) x where not exists(select 1 from public.files where id=x and user_id=auth.uid())) then raise exception 'Invalid files'; end if;
 insert into public.messages(user_id,conversation_id,role,content,file_ids,request_id)
 values(auth.uid(),p_conversation,'user',p_text,p_files,p_request);
 insert into public.messages(user_id,conversation_id,role,content,request_id)
 values(auth.uid(),p_conversation,'assistant',p_answer->>'reply' || case when jsonb_typeof(p_answer->'material')='object' then E'\n\n' || (p_answer->'material'->>'title') || E'\n' || (p_answer->'material'->>'student') || E'\n\nOrientações do professor\n' || (p_answer->'material'->>'teacher') else '' end,p_request);
 if jsonb_typeof(p_answer->'material')='object' then
  insert into public.materials(user_id,conversation_id,request_id,title,student,teacher)
  values(auth.uid(),p_conversation,p_request,p_answer->'material'->>'title',p_answer->'material'->>'student',p_answer->'material'->>'teacher');
 end if;
end $$;

create function public.claim_generation(p_user uuid,p_conversation uuid,p_project boolean,p_limit int)
returns boolean language plpgsql security definer set search_path=public as $$
declare used int; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from public.conversations where id=p_conversation and user_id=p_user) then return false; end if;
 if exists(select 1 from public.generation_locks where user_id=p_user and expires_at>now()) then return false; end if;
 if p_project then
  insert into public.usage_daily(user_id,day,calls) values(p_user,(now() at time zone 'UTC')::date,0) on conflict do nothing;
  select calls into used from public.usage_daily where user_id=p_user and day=(now() at time zone 'UTC')::date for update;
  if used>=p_limit then return false; end if;
  update public.usage_daily set calls=calls+1 where user_id=p_user and day=(now() at time zone 'UTC')::date;
 end if;
 insert into public.generation_locks(user_id,conversation_id,expires_at) values(p_user,p_conversation,now()+interval '150 seconds')
 on conflict(user_id) do update set conversation_id=excluded.conversation_id,expires_at=excluded.expires_at;
 return true;
end $$;
create function public.release_generation(p_user uuid,p_conversation uuid) returns void
language sql security definer set search_path=public as $$
 delete from public.generation_locks where user_id=p_user and conversation_id=p_conversation;
$$;
revoke all on function public.claim_generation(uuid,uuid,boolean,int), public.release_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_generation(uuid,uuid,boolean,int), public.release_generation(uuid,uuid) to service_role;
revoke all on function public.add_syllabus_version(uuid,text,text,text,text,uuid), public.save_exchange(uuid,uuid,text,uuid[],jsonb) from public,anon;
grant execute on function public.add_syllabus_version(uuid,text,text,text,text,uuid), public.save_exchange(uuid,uuid,text,uuid[],jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('eduplan','eduplan',false,3145728);
create policy eduplan_read on storage.objects for select to authenticated
 using(bucket_id='eduplan' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy eduplan_insert on storage.objects for insert to authenticated
 with check(bucket_id='eduplan' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy eduplan_cleanup on storage.objects for delete to authenticated
 using(bucket_id='eduplan' and (storage.foldername(name))[1]=(select auth.uid())::text);
create index on public.conversations(user_id,created_at desc);
create index on public.messages(conversation_id,created_at);
create index on public.materials(user_id,created_at desc);
create index on public.syllabus_versions(user_id,syllabus_id,version desc);
commit;
