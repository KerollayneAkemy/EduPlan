# EduPlan

Plataforma web de apoio pedagógico para professores da educação básica. Professores podem organizar ementas, gerar materiais com referência curricular selecionada, editar e exportar conteúdos salvos.

O repositório remoto fornecido continha apenas o título `# EduPlan`, sem conteúdo de aplicação. Esta implementação foi iniciada nesta pasta de trabalho local. A configuração real de Supabase, Gemini e deploy precisa ser feita nas contas do projeto; nenhuma credencial é incluída aqui.

## Componentes

- `frontend/`: React 18, Vite 6 e CSS responsivo em português. Inclui cadastro, login, recuperação de senha, dashboard, biblioteca de ementas, assistente, histórico, edição e exportação.
- `backend/`: API REST FastAPI. Valida tokens Supabase no servidor, filtra registros pelo usuário e mantém as chaves privadas no ambiente do servidor.
- `supabase/migrations/`: esquema PostgreSQL, relações, índices, timestamps, RLS, bucket privado e função transacional de limite de geração.

## Pré-requisitos

- Node.js 20 ou superior e pnpm ou npm.
- Python 3.12.
- Projeto Supabase com Auth, PostgreSQL e Storage.
- Chave da Gemini para gerar materiais. Sem ela, login, perfil, cadastro de ementas e histórico continuam independentes; geração responde com indisponibilidade configurada.

## Configurar o Supabase

1. Crie um projeto Supabase e copie a URL, a chave anon/publishable e a chave service role para o ambiente do **backend**. A service role ignora RLS e deve ser mantida somente no servidor.
2. No SQL Editor do projeto, execute os arquivos de `supabase/migrations/` em ordem cronológica. A migration inicial cria o esquema; a migration de hardening limita a execução da função de trigger de perfil e fixa o `search_path` da função de atualização.
3. Em Authentication → URL Configuration, configure a URL do front-end local (`http://localhost:5173`) e a URL de produção. Permita esses endereços para confirmação de e-mail e recuperação de senha.
4. A migration cria o bucket privado `syllabi`. Políticas RLS limitam perfis, ementas e materiais ao proprietário; a política do Storage limita o primeiro segmento do caminho ao UUID autenticado.

## Executar localmente

### Backend

Copie `.env.example` para `backend/.env` e coloque os valores do seu projeto Supabase e da Gemini no arquivo local. Não envie esse arquivo para o Git.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: `http://localhost:8000/api`. Documentação interativa: `http://localhost:8000/docs`. Health check: `GET /api/health`.

### Front-end

Copie `frontend/.env.example` para `frontend/.env.local`. Para desenvolvimento, `VITE_API_URL` deve apontar para `http://localhost:8000/api`.

```powershell
cd frontend
pnpm install
pnpm dev
```

Abra `http://localhost:5173`. Em produção, configure `VITE_API_URL` com a URL HTTPS pública do backend e defina `ALLOWED_ORIGINS` no backend com a URL exata do front-end.

## Variáveis de ambiente

`.env.example` contém nomes e exemplos não secretos para o backend. `frontend/.env.example` contém somente a URL pública da API. Variáveis `VITE_*` são incorporadas ao bundle público: nunca coloque service role, senha ou chave Gemini em variáveis `VITE_*`.

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: endereço do projeto e chave pública, usados pelo backend para validar e renovar sessões.
- `SUPABASE_SERVICE_ROLE_KEY`: chave privada do servidor para persistência autorizada; consultas também são filtradas pelo UUID verificado do professor.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: chave privada e modelo selecionado no servidor. O padrão atual é `gemini-3.8-flash`; o identificador pode ser trocado por outro modelo disponível para sua conta.
- `MAX_UPLOAD_MB`: limite de upload, padrão 15 MB.
- `DAILY_GENERATION_LIMIT`, `MINUTE_GENERATION_LIMIT`: limites por professor, padrões 20 por 24 horas e 3 por minuto.
- `ALLOWED_ORIGINS`: lista JSON de origens, por exemplo `["https://eduplan.vercel.app"]`.

A geração envia tema, instruções e trecho de até 40 mil caracteres da ementa selecionada ao serviço da Gemini. A API limita as respostas a 4.096 tokens, contabiliza tentativas por usuário no banco e deixa explícito que o professor deve revisar o material.

## Endpoints

- `GET /api/health`
- `POST /api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/update-password`, `GET /api/auth/me`
- `GET /api/dashboard`
- `GET/PATCH /api/profile`
- `GET/POST /api/syllabi`, `GET/DELETE /api/syllabi/{id}`
- `GET /api/materials` (busca, tipo, disciplina, intervalo de datas e limite), `POST /api/materials/generate`
- `GET/PATCH/DELETE /api/materials/{id}`
- `GET /api/materials/{id}/export/pdf` e `/api/materials/{id}/export/docx`

Uploads são multipart/form-data e aceitam PDF pesquisável ou DOCX com até 15 MB. Se a extração não conseguir ler texto, a API rejeita o arquivo e não grava a ementa. Exportações usam o título e o conteúdo atuais salvos no banco.

## Testes e verificações

Na pasta backend, execute `pytest`. Os 23 testes cobrem leitura/validação de documentos, health check, autenticação exigida, isolamento por usuário, busca, limites de upload, persistência e edição com banco simulado, erros de geração sem chave, geração com Gemini mockada, vínculo da ementa usada e exportação PDF/DOCX. A suíte não faz chamadas à Gemini nem requer credenciais. A integração real com Supabase ainda exige configurar um projeto de teste.

## Deploy

### Vercel

Crie um projeto Vercel com Root Directory `frontend`, framework Vite, comando de build `pnpm build` (ou `npm run build`) e saída `dist`. Defina `VITE_API_URL` com a URL HTTPS do serviço API. `frontend/vercel.json` encaminha rotas da aplicação para o `index.html`, conforme a [documentação Vite do Vercel](https://vercel.com/docs/frameworks/frontend/vite).

### Render

O `render.yaml` configura um Web Service Python com diretório raiz `backend`, instalação de `requirements.txt`, comando Uvicorn e health check. Vincule o repositório no Render e preencha as variáveis secretas solicitadas no painel. Configure `ALLOWED_ORIGINS` com a URL final do Vercel. O `backend/.python-version` fixa Python 3.12.8. O procedimento usa o [guia oficial do Render para FastAPI](https://render.com/docs/deploy-fastapi) e a [configuração de versão Python](https://render.com/docs/python-version).

Os comandos e formatos seguem o suporte documentado de Vite como site estático e FastAPI/Uvicorn como serviço Python. O deploy ainda não foi executado. A migration deve ser aplicada ao Supabase antes de o backend receber tráfego.
