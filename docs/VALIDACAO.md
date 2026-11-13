# Validação do protótipo

Atualização: 9 de novembro de 2026. Sem simulação de IA ou autenticação no aplicativo.

## Verificações concluídas

- **20 testes Python passaram e 1 foi ignorado**: validação de sessão, filtro de proprietário, bloqueio de itens alheios, seleção/criptografia de chave, ausência de fallback, payload sensível não refletido, chaves modernas, extração, rejeição de PDF sem texto, seleção de trechos e DOCX/PDF/TXT.
- **23 verificações PostgreSQL locais passaram** com PGlite: RLS, arquivos privados, versões, idempotência, cotas e dados preservados entre contextos de sessão.
- **Teste no Supabase real passou** (`tests/live_db_rollback.sql`): perfil, arquivos no banco, versões, conversa, duas mensagens, material, idempotência e isolamento de dois usuários. Todos os dados temporários revertidos com ROLLBACK. Não foi um login OAuth real.
- Auth do Supabase respondeu **HTTP 200** à chave pública moderna. Consulta anônima não revelou perfis e foi bloqueada na tabela `ai_secrets`.
- O provedor Google foi configurado no projeto, com cliente web, retorno do Supabase e conta de teste. A rota OAuth do Supabase retornou redirecionamento para o Google com o cliente configurado.
- A chave Gemini e a geração estruturada foram validadas com `gemini-flash-lite-latest`, o modelo padrão atual do projeto. A resposta contém texto e material estruturado.
- 11 tabelas com RLS, 19 policies de tabelas da aplicação e 3 de Storage. Bucket privado `eduplan`, limite 3 MB.
- Segredo Fernet gerado e validado localmente, sem exibição de valor.
- Ditado testado com eventos controlados: início, transcrição, permissão recusada, parada sem evento final, cancelamento antes de iniciar, timeout e eventos atrasados. Texto editado não é sobrescrito por uma sessão antiga.
- PDF sintético com Arial local: duas páginas inspecionadas visualmente, acentos, tabela, linha de resposta e separação do professor preservados. Fonte Windows Arial, `fsType=8`, sem cópia da fonte.
- DOCX: formato real, A4, margens, Arial 12, espaçamento 1,5, tabela, acentos e quebra de página conferidos por leitura de OOXML/documento.
- Servidor local respondeu HTTP 200 e carregou `configured=true`, `pdf_ready=true` e oito tarefas. Esses indicadores não significam que as chaves privadas e Google estejam prontos.

Os dois avisos da suíte Python são de depreciação do cliente HTTP de testes e de um matcher vazio no teste de exceção. Não houve falha de teste.

## Limites da verificação

- Captura real de voz depende do teste pelo professor no navegador, com sua permissão de microfone.
- A revisão visual da interface não foi concluída: a ferramenta de navegador excedeu o tempo de resposta. A disponibilidade HTTP e a sintaxe JavaScript foram verificadas.
- O renderizador DOCX não encontrou LibreOffice. A revisão visual do Word no editor do usuário permanece pendente; não alegamos ter conferido sua paginação por imagem.
- PDF online na Vercel depende de Arial licenciada para servidor. O caminho local Windows não pode ser reutilizado na nuvem.
- As verificações de referências e isolamento não substituem a avaliação pedagógica das saídas reais da IA.

## Matriz de aceite

| Critério | Estado real |
| --- | --- |
| Login Google | Provedor e cliente OAuth configurados; teste interativo no EduPlan pendente |
| Cadastro de ementa | Extração local e gravação no banco testadas; upload pelo aplicativo autenticado pendente |
| Conversa com versão da ementa | Vínculo e preservação verificados no banco real |
| Oito funções com Gemini | Instruções implementadas; geração estruturada real validada |
| Adaptação nas três etapas | Exemplos fornecidos; qualidade pedagógica real ainda não validada |
| Word, PDF e TXT | Geração e estrutura testadas; PDF local inspecionado; Word visual pendente |
| Persistência após sair/entrar | Persistência de banco testada; ciclo OAuth real pendente |
| Reabrir conversas e materiais | Rotas implementadas e isolamento testado; uso autenticado completo pendente |
| Troca de ementa | Versões imutáveis testadas; interação visual pendente |
| Chave pessoal/projeto | Seleção, criptografia e ausência de fallback testadas; geração do projeto validada |
| Chave inválida/cota/arquivo incompatível | Tratamentos implementados; arquivos testados; erros reais Gemini pendentes |
| Ditado | Estados e recuperação testados sem áudio real; teste de voz no navegador pendente |
| Publicação Vercel | Arquivos preparados; sem conta conectada e sem deploy realizado |

## Como repetir

```powershell
.venv/Scripts/python.exe -m pytest -q
node tests/database.mjs
node tests/dictation.cjs
node --check static/app.js
.venv/Scripts/python.exe scripts/check_setup.py
```

O teste `tests/live_db_rollback.sql` deve ser executado somente por um administrador no projeto correto. Não executa migrações nem deixa fixtures persistidas.
