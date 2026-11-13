-- Integration check on the configured Supabase database.
-- Temporary fixtures exist only in this transaction. Always ends with ROLLBACK.
begin;
select set_config('eduplan.test_user_a',gen_random_uuid()::text,true);
select set_config('eduplan.test_user_b',gen_random_uuid()::text,true);
insert into auth.users(id) values
 (current_setting('eduplan.test_user_a')::uuid),
 (current_setting('eduplan.test_user_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('eduplan.test_user_a'),true);
insert into public.profiles(user_id,name) values(auth.uid(),'Teste temporário EduPlan');
with f as (
 insert into public.files(user_id,filename,path,text)
 values(auth.uid(),'teste.txt',auth.uid()::text||'/teste.txt','Matemática: partes iguais e frações.') returning id
)
select set_config('eduplan.test_file',(select id::text from f),true);
select set_config('eduplan.test_version',
 public.add_syllabus_version(null,'Ementa temporária','Matemática','Fundamental I','3º ano',current_setting('eduplan.test_file')::uuid)->>'id',true);
with c as (
 insert into public.conversations(user_id,title,task,version_id)
 values(auth.uid(),'Conversa temporária','adaptar',current_setting('eduplan.test_version')::uuid) returning id
)
select set_config('eduplan.test_conversation',(select id::text from c),true);
select set_config('eduplan.test_request',gen_random_uuid()::text,true);
select public.save_exchange(current_setting('eduplan.test_conversation')::uuid,
 current_setting('eduplan.test_request')::uuid,'Adapte a atividade.',
 array[current_setting('eduplan.test_file')::uuid],
 '{"reply":"Proposta de teste","material":{"title":"Frações","student":"Represente a metade.","teacher":"Verifique as partes iguais."}}'::jsonb);
-- Same request cannot duplicate the saved exchange.
select public.save_exchange(current_setting('eduplan.test_conversation')::uuid,
 current_setting('eduplan.test_request')::uuid,'Não duplicar.','{}'::uuid[],
 '{"reply":"Não duplicar","material":null}'::jsonb);
select public.add_syllabus_version(
 (select syllabus_id from public.syllabus_versions where id=current_setting('eduplan.test_version')::uuid),
 'Ementa atualizada','Matemática','Fundamental I','3º ano',current_setting('eduplan.test_file')::uuid);
do $$ begin
 if (select count(*) from public.messages where conversation_id=current_setting('eduplan.test_conversation')::uuid)<>2 then
  raise exception 'Idempotency failed'; end if;
 if (select count(*) from public.materials where conversation_id=current_setting('eduplan.test_conversation')::uuid)<>1 then
  raise exception 'Material persistence failed'; end if;
 if (select version_id from public.conversations where id=current_setting('eduplan.test_conversation')::uuid)<>current_setting('eduplan.test_version')::uuid then
  raise exception 'Version reference changed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('eduplan.test_user_b'),true);
do $$ begin
 if exists(select 1 from public.profiles where user_id=current_setting('eduplan.test_user_a')::uuid)
 or exists(select 1 from public.files where id=current_setting('eduplan.test_file')::uuid)
 or exists(select 1 from public.conversations where id=current_setting('eduplan.test_conversation')::uuid)
 or exists(select 1 from public.materials where conversation_id=current_setting('eduplan.test_conversation')::uuid)
 then raise exception 'RLS isolation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('eduplan.test_user_a'),true);
do $$ begin
 if not exists(select 1 from public.profiles where user_id=auth.uid()) then
  raise exception 'Profile did not persist between role contexts'; end if;
end $$;
rollback;
select 'OK: profile, files, versions, conversation, messages, material, idempotency and two-user isolation; all fixtures rolled back' as verification;
