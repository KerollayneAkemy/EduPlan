# EduPlan

Assistente docente em português brasileiro, preparado para a apresentação de **6 de novembro de 2026**. Backend FastAPI, interface responsiva sem etapa de build, Gemini no servidor, Supabase Auth/PostgreSQL/Storage e publicação prevista na Vercel.

**Não existe modo de IA simulada no aplicativo.** Sem configuração, a interface abre com um aviso de instalação e solicita login para funções privadas. As chamadas reais dependem das credenciais abaixo. Dados controlados existem somente nos testes.

## Executar localmente

Requisitos: Python 3.12 e acesso à internet. Node 20+ é opcional, usado apenas nos testes PostgreSQL locais.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Preencha .env, aplique a migração e configure o Google conforme abaixo.
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Abra [o EduPlan local](http://localhost:8000). Use sempre o mesmo host (`localhost`) durante login; não alterne com `127.0.0.1`, pois o verificador PKCE pertence à origem do navegador. HTTPS é obrigatório na publicação; localhost é permitido para desenvolvimento e ditado.

O código pode iniciar sem `.env` para inspecionar a interface. Isso **não** habilita conversas, armazenamento ou login fictícios.

## Supabase e Google

1. Crie um projeto Supabase. Execute `supabase/migrations/001_eduplan.sql` no SQL Editor uma única vez. O script é transacional e cria tabelas, funções, RLS e bucket **privado** `eduplan` (3 MB). Não reaplique no mesmo banco: mantenha migrações futuras incrementais.
2. Em Project Settings / API Keys, copie a URL e a chave pública `sb_publishable_...` para `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env`. Coloque a chave privada `sb_secret_...` em `SUPABASE_SERVICE_ROLE_KEY`, **somente no servidor**. Os nomes das variáveis foram mantidos por compatibilidade; as chaves modernas são aceitas e não são enviadas como JWT. Chaves legadas `anon` e `service_role` também continuam aceitas.
3. No Google Cloud, configure a tela de consentimento OAuth e um cliente de aplicativo Web. Em teste, adicione os e-mails dos apresentadores como usuários de teste. Escopos básicos: `openid`, `email`, `profile`.
4. Em **URIs de redirecionamento autorizados** do Google, use exatamente `https://SEU-PROJETO.supabase.co/auth/v1/callback`. A origem JavaScript autorizada, quando solicitada, é `http://localhost:8000` e, depois, o domínio HTTPS publicado.
5. Em Supabase Authentication / Sign In / Providers / Google, ative o provedor e informe Client ID e Client Secret do Google. Esses segredos pertencem à configuração Supabase, não ao frontend.
6. Em Supabase Authentication / URL Configuration, defina Site URL como `http://localhost:8000` durante o desenvolvimento. Adicione `http://localhost:8000/` às Redirect URLs. Depois defina Site URL como `https://SEU-DOMINIO.vercel.app` e adicione `https://SEU-DOMINIO.vercel.app/`. Cadastre URLs de preview exatas somente se forem necessárias.
7. Entre pelo botão **Continuar com o Google**. No primeiro acesso, apenas o nome é obrigatório; disciplinas e turmas podem ser completadas depois.

O frontend usa Supabase JS com OAuth PKCE e renovação de sessão. O token da sessão pode ser persistido pelo SDK no navegador; **ementas, histórico, materiais e chaves Gemini não dependem do armazenamento do navegador**. O backend valida cada token em `/auth/v1/user`; todas as consultas docentes usam esse token, filtros de proprietário e RLS. A conexão administrativa é limitada a chaves criptografadas e cotas. Não há rota para baixar a chave salva.

## Gemini e criptografia

Preencha `GEMINI_API_KEY` e `GEMINI_MODEL`. O modelo padrão do exemplo é `gemini-flash-lite-latest`; ajuste para um modelo disponível no seu projeto. A integração usa o SDK oficial `google-genai`, saída JSON validada e chamadas somente no backend.

Gere o segredo de criptografia:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Guarde o resultado em `KEY_ENCRYPTION_SECRET`, fora do banco e do repositório. Mantenha cópia segura: perder ou trocar esse segredo exige salvar novamente as chaves pessoais. `ai_secrets` não possui permissões para usuários autenticados. Fernet fornece criptografia autenticada; o banco recebe apenas o valor cifrado.

- Chave do projeto é o padrão; `PROJECT_DAILY_LIMIT=30` limita tentativas por usuário e dia UTC, atomicamente no PostgreSQL. Falhas também contam, para evitar abuso. Uma geração por usuário pode estar ativa; travas expiram em 150 segundos em caso de interrupção.
- Chave própria é validada por uma chamada curta real antes de salvar, podendo consumir cota dessa chave. Pode ser substituída, removida ou mantida enquanto a preferência volta à chave do projeto.
- Não há fallback silencioso. Erros de autenticação e cota orientam o professor a escolher explicitamente outra chave.
- Assinatura estudantil do aplicativo Gemini não implica créditos ou acesso pago à API. Verifique a disponibilidade no projeto da API.

## Fluxo e funções

As oito tarefas compartilham a integração, com instruções próprias: adaptação, planejamento, revisão, relatórios, materiais/roteiros de slides, provas, exercícios e dinâmicas. Os atalhos preenchem uma mensagem guiada editável; o envio inicia a conversa. O professor também pode escrever livremente e mudar de tarefa no chat.

A adaptação prioriza objetivo pedagógico, idade e apoios descritos. As instruções proíbem inventar diagnósticos, observações, referências ou códigos BNCC. Saídas são propostas para revisão, não avaliações definitivas. Gabarito/orientações são um campo separado e podem ser excluídos do download do aluno.

Ementas aceitam PDF com texto, DOCX e TXT UTF-8. Cada atualização cria um registro imutável com texto e metadados. Conversas referenciam esse registro, não a versão mais recente. Trocar a referência oferece outra conversa. Anexos de atividades não substituem a ementa.

Documentos acima de 18 mil caracteres têm trechos selecionados por correspondência lexical com a pergunta e mensagens recentes. A seleção informa ao modelo que é parcial. Anexos recebem até 6 mil caracteres cada; são considerados até seis arquivos recentes. O histórico enviado ao Gemini tem orçamento de 32 mil caracteres; todo o histórico continua persistido. Esta é uma busca simples, não uma garantia de recuperação semântica completa. Quando necessário, especifique a seção/conteúdo desejado.

Limites: 3 MB por arquivo, 150 páginas PDF, 250 mil caracteres extraídos, até três novos anexos por mensagem, 12 mil caracteres de mensagem. Não há OCR; PDF sem texto gera erro claro. Arquivos são tratados como fontes, nunca como instruções de sistema. Isso reduz riscos de injeção, mas não garante comportamento infalível do modelo.

O microfone usa reconhecimento do navegador e mantém a transcrição editável antes do envio. Disponibilidade varia por navegador e permissões; o serviço do navegador pode processar o áudio externamente. Texto continua disponível em todos os casos.

## Exportação e Arial

DOCX e PDF são gerados no backend, em memória: A4, Arial 12, preto, margens superior/esquerda 3 cm, inferior/direita 2 cm e espaçamento 1,5. O diálogo permite ajustar margens e espaçamento. Tabelas Markdown viram tabelas reais. Orientações do professor começam em nova página. TXT é UTF-8 e preserva texto e separações, sem diagramação.

**A fonte Arial não é distribuída neste repositório.** O DOCX declara Arial e requer que o leitor a tenha instalada. Para PDF:

1. Obtenha um arquivo TTF Arial com licença que permita o uso no ambiente de execução e a incorporação no documento.
2. Defina `ARIAL_FONT_PATH` para esse arquivo e `ARIAL_LICENSE_CONFIRMED=true` apenas depois da verificação da licença.
3. No Windows local, a Arial instalada pode ser utilizada para produção de documentos conforme sua licença e permissões de incorporação; o caminho usual é `C:/Windows/Fonts/arial.ttf`.
4. Não copie a fonte do Windows para a Vercel supondo que a licença do desktop autoriza redistribuição ou uso em servidor. Na Vercel, forneça um arquivo legitimamente licenciado no pacote privado de implantação ou outro mecanismo seguro de provisionamento. `fonts/*.ttf` está ignorado pelo Git.

Sem Arial configurada, PDF retorna uma mensagem explicativa; não há substituição silenciosa. Word e TXT seguem disponíveis. Trata-se de **modelo acadêmico ajustável**, não de certificação de conformidade integral com ABNT. Exigências institucionais e norma pertinente precisam de conferência humana.

Os materiais estruturados permanecem no PostgreSQL. Cada exportação também é salva no Storage privado; downloads passam pela autenticação. Não há URLs públicas permanentes. O aplicativo não grava dados de produção no disco da Vercel.

## Publicar na Vercel

1. Crie um repositório privado com os arquivos, sem `.env`, fontes sem licença, `.venv`, `node_modules` ou arquivos de teste gerados.
2. Importe na Vercel e selecione FastAPI, com raiz nesta pasta. A entrada é `app.py`, objeto `app`. Use Python 3.12. Não configure diretório de saída estática ou um build Node: o frontend é servido pelo FastAPI. `package.json` contém somente ferramentas de teste.
3. Cadastre as variáveis de `.env.example` nas Environment Variables da Vercel. Marque os valores privados como sensíveis e não use prefixos públicos. Configure limites de uso do provedor também no painel do Google.
4. `vercel.json` define 120 segundos para a função. A chamada Gemini usa timeout de 85 segundos. Habilite Fluid Compute e confira limites do plano. O limite de upload de 3 MB deixa margem sob os 4,5 MB de payload das funções.
5. Faça deploy, configure as URLs de retorno Google/Supabase indicadas acima e teste com duas contas. HTTPS também permite o microfone quando o navegador suporta.
6. Confira `/api/config`, login, upload, geração e downloads no ambiente publicado antes de apresentar. Se o pacote exceder os limites da função, remova ferramentas de testes da instalação de produção; nunca remova os módulos usados pelo aplicativo.

Alternativa por CLI: `npx vercel` e, após conferir a configuração, `npx vercel --prod`. Não há publicação automática deste repositório sem acesso à conta Vercel. Não há URL de produção comprovada nesta entrega.

## Testes

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
# Opcional: validar PDF com a Arial legitimamente instalada nesta máquina.
$env:TEST_ARIAL_PATH='C:/Windows/Fonts/arial.ttf'
python -m pytest -q
# PostgreSQL local embarcado, sem acessar sua conta Supabase:
npm ci
npm run test:db
npm run check
```

`tests/database.mjs` executa a migração em PostgreSQL PGlite com schemas de autenticação/Storage preparados exclusivamente para testes. Verifica RLS, isolamento, referências de versão, idempotência, persistência entre sessões de banco, cotas e regras de Storage. Não substitui o teste do OAuth nem do Storage hospedado. Os testes Python usam mocks de serviços externos, documentos reais e validações da API.

Veja `docs/VALIDACAO.md` para resultados e testes reais pendentes, `docs/APRESENTACAO.md` para o roteiro e `examples/` para ementas e pedidos sem dados pessoais.

O passo a passo personalizado para concluir a configuração desta instalação está em `docs/FINALIZAR.md`. O `.env` local já contém URL, chave pública e segredo de criptografia. Não copie esse arquivo para o repositório. `scripts/check_setup.py` confere a configuração sem imprimir credenciais. `iniciar.ps1` inicia o servidor local.

## Estrutura

```text
app.py                       Rotas, autenticação por requisição e arquivos
backend/services.py          Supabase REST, Gemini, criptografia e erros
backend/prompts.py           Oito tarefas e seleção de trechos
backend/documents.py         Extração e exportação
static/                      Interface, estilos e reconhecimento de voz
supabase/migrations/         Schema, RLS, transações e bucket privado
tests/                       Verificações Python e PostgreSQL
examples/                    Ementas didáticas para testar as três etapas
docs/                        Validação e roteiro de apresentação
```

## Referências oficiais consultadas

- [FastAPI na Vercel](https://vercel.com/docs/frameworks/backend/fastapi): entrada `app.py`, função Python e configuração de duração.
- [Limites de Functions](https://vercel.com/docs/functions/limitations): payload e recursos de execução.
- [Google no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google): OAuth e URLs de retorno.
- [Controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control): policies e bucket privado.
- [SDK oficial Gemini](https://ai.google.dev/gemini-api/docs/libraries) e [Python Gen AI](https://googleapis.github.io/python-genai/): cliente e geração estruturada.
- [Licenciamento e incorporação de fontes Microsoft](https://learn.microsoft.com/en-us/typography/fonts/font-faq): uso local, restrições de distribuição e permissões de incorporação.

As referências orientam a implementação; não equivalem a um deploy ou uma integração externa testada com credenciais reais.
