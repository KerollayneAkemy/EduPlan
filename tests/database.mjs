// Real PostgreSQL semantics via PGlite; auth/storage schemas are local test fixtures.
// This does not claim to exercise the hosted Supabase service.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema auth,storage,public to authenticated,anon,service_role;
grant all on all tables in schema storage to authenticated;
alter default privileges in schema public grant all on tables to authenticated,service_role;
`);
await db.exec(await readFile('supabase/migrations/001_eduplan.sql','utf8'));
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const f='10000000-0000-0000-0000-000000000001',c='20000000-0000-0000-0000-000000000001',r='30000000-0000-0000-0000-000000000001';
await db.exec(`insert into auth.users values('${a}'),('${b}'); set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
await db.exec(`insert into files(id,user_id,filename,path,text) values('${f}','${a}','ementa.txt','${a}/ementa.txt','Frações e leitura.');`);
const v1=(await db.query(`select add_syllabus_version(null,'Matemática','Matemática','Fundamental I','3º ano','${f}') v`)).rows[0].v;
await db.exec(`insert into conversations(id,user_id,title,task,version_id) values('${c}','${a}','Adaptação','adaptar','${v1.id}');`);
const v2=(await db.query(`select add_syllabus_version('${v1.syllabus_id}','Atualizada','Matemática','Fundamental I','3º ano','${f}') v`)).rows[0].v;
assert.equal(v2.version,2);
assert.equal((await db.query(`select version_id from conversations where id='${c}'`)).rows[0].version_id,v1.id);
let checks=2;
async function forbidden(sql){await assert.rejects(db.exec(sql));checks++;}
await forbidden(`update conversations set version_id='${v2.id}' where id='${c}'`);
await forbidden(`update syllabus_versions set text='modificada' where id='${v1.id}'`);
await db.query(`select save_exchange($1,$2,$3,$4,$5)`,[c,r,'Adapte a atividade.',[f],{reply:'Proposta para revisão.',material:{title:'Frações',student:'Divida em partes iguais.',teacher:'Observe os apoios.'}}]);
await db.query(`select save_exchange($1,$2,$3,$4,$5)`,[c,r,'Adapte a atividade.',[f],{reply:'Não duplicar',material:null}]);
assert.equal((await db.query('select * from messages')).rows.length,2);checks++;
assert.equal((await db.query('select * from materials')).rows.length,1);checks++;
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`);
for(const table of ['files','syllabi','syllabus_versions','conversations','messages','materials']){assert.equal((await db.query('select * from '+table)).rows.length,0);checks++;}
await forbidden(`insert into conversations(user_id,title,task,version_id) values('${b}','Invasão','adaptar','${v1.id}')`);
await forbidden(`insert into files(user_id,filename,path,text) values('${a}','a','b','c')`);
await forbidden(`select * from ai_secrets`);
await forbidden(`select claim_generation('${a}','${c}',true,30)`);
await db.exec(`reset role; set role service_role;`);
assert.equal((await db.query(`select claim_generation('${a}','${c}',true,1) ok`)).rows[0].ok,true);checks++;
assert.equal((await db.query(`select claim_generation('${a}','${c}',true,1) ok`)).rows[0].ok,false);checks++;
await db.exec(`select release_generation('${a}','${c}')`);
assert.equal((await db.query(`select claim_generation('${a}','${c}',true,1) ok`)).rows[0].ok,false);checks++;
assert.equal((await db.query(`select claim_generation('${a}','${c}',false,1) ok`)).rows[0].ok,true);checks++;
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
assert.equal((await db.query(`select count(*)::int n from messages`)).rows[0].n,2);checks++;
await db.exec(`insert into storage.objects(bucket_id,name) values('eduplan','${a}/private.txt');`);
await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
assert.equal((await db.query(`select * from storage.objects`)).rows.length,0);checks++;
await forbidden(`insert into storage.objects(bucket_id,name) values('eduplan','${a}/intruder.txt')`);
await db.close();
console.log(`${checks} verificações PostgreSQL passaram: RLS, arquivos privados, versões, persistência entre sessões, atomicidade, idempotência e cotas.`);
