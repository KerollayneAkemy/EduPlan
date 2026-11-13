# Configuração remota do Supabase

Verificação realizada em 5 de novembro de 2026.

- Projeto existente reutilizado: `eduplan`.
- Referência: `wboaghrpiaqhecryyriq`.
- Região: `us-east-2`.
- Painel: https://supabase.com/dashboard/project/wboaghrpiaqhecryyriq
- Inspeção anterior à alteração: schema public sem tabelas; nenhuma migração; nenhum bucket.
- Migração aplicada com sucesso: `20261105231405_eduplan_initial_schema`, conteúdo de `supabase/migrations/001_eduplan.sql`.
- Não reaplicar o script inicial neste projeto. Mudanças futuras precisam de migração incremental.

## Segurança conferida

O usuário autenticado não possui SELECT em `ai_secrets`; o servidor service_role possui. Usuários anônimos e autenticados não podem executar `claim_generation` diretamente.

O Security Advisor retornou apenas três avisos informativos de RLS sem policies em `ai_secrets`, `usage_daily` e `generation_locks`. Isso é intencional: são tabelas exclusivas do backend, sem acesso para anon/authenticated. Não adicionar policies públicas para silenciar esses avisos.

Referência do aviso: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Atualização da configuração local

URL e chave pública moderna já salvas no `.env`. O segredo Fernet foi gerado localmente. A conexão real com Auth respondeu HTTP 200 e confirmou Google ainda desativado. Consultas anônimas não retornam perfis e não têm acesso à tabela de chaves.

O teste `tests/live_db_rollback.sql` passou no banco remoto: perfil, arquivo de referência, duas versões de ementa, conversa, mensagens, material, idempotência e isolamento entre dois usuários. As fixtures foram revertidas por ROLLBACK. Não representa teste de OAuth ou de upload pela API de Storage.

## Ainda pendente

- Preencher somente a chave administrativa do Supabase no `.env`.
- Configurar provedor Google, consentimento OAuth e URLs de retorno.
- Configurar a chave Gemini; o segredo de criptografia local já foi gerado.
- Testar login, arquivos e conversas através do aplicativo com contas reais.

A criação do banco não significa que o login Google ou a geração com Gemini já estejam configurados.
