# EduPlan

> Assistente de Inteligência Artificial para professores da Educação Básica.

**Projeto acadêmico · Apresentação em 6 de novembro de 2026**

Equipe: [@KerollayneAkemy](https://github.com/KerollayneAkemy), [@Emily2311](https://github.com/Emily2311) e [@AnaLuiza2431](https://github.com/AnaLuiza2431).

[Acessar o EduPlan publicado](https://eduplan-kerollayneakemys-projects.vercel.app/) · [Roteiro de apresentação](docs/APRESENTACAO.md) · [Como finalizar a configuração](docs/FINALIZAR.md)

---

## Um apoio para a rotina docente

O EduPlan é um chat em português do Brasil criado para professores do Ensino Fundamental I, Ensino Fundamental II e Ensino Médio. Ele transforma pedidos do dia a dia em propostas pedagógicas organizadas, sempre para revisão e decisão final do professor.

A prioridade é adaptar atividades às necessidades de aprendizagem sem infantilizar estudantes ou reduzir objetivos pedagógicos automaticamente. O assistente não inventa dados de alunos, diagnósticos, habilidades da BNCC ou referências bibliográficas.

## O que o EduPlan faz

| Recurso | Como ajuda |
| --- | --- |
| Adaptar atividades | Ajusta linguagem, etapas, apoios, exemplos e formas de resposta. |
| Organizar planejamento | Estrutura planos de aula, sequências didáticas, semanas e cronogramas. |
| Corrigir e revisar | Revisa textos, enunciados, atividades, avaliações e respostas. |
| Elaborar relatórios | Organiza observações reais em registros e relatórios pedagógicos. |
| Criar materiais | Produz textos de apoio, guias, resumos, roteiros e sequências de slides. |
| Elaborar provas | Cria questões, gabarito separado e critérios de correção. |
| Gerar exercícios | Prepara atividades de prática, fixação, revisão e aplicação. |
| Sugerir dinâmicas | Propõe estratégias de sala, trabalhos em grupo e ideias de participação. |

Também estão disponíveis:

- Login com Google e perfil individual de professor.
- Histórico persistente de conversas e materiais.
- Planos anuais de referência versionados.
- Importação de PDF com texto, DOCX e TXT.
- Anexos de atividades no chat, separados do plano anual.
- Ditado por microfone quando o navegador é compatível.
- Downloads reais em Word, PDF e TXT.
- Chave Gemini do projeto ou chave pessoal cifrada no servidor.

## Como usar

1. Entre com a conta Google.
2. Informe seu nome, disciplinas e turmas. Somente o nome é obrigatório.
3. Em **Meus planos anuais**, cadastre um plano anual se desejar referência curricular.
4. Inicie uma conversa e selecione disciplina, turma e plano anual.
5. Escolha um atalho ou escreva livremente.
6. Revise a proposta, solicite ajustes e baixe o material quando estiver pronto.

> Sem um plano anual, o EduPlan continua ajudando. Apenas não declara alinhamento curricular sem uma referência fornecida.

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Backend | Python 3.12 e FastAPI |
| Interface | HTML, CSS e JavaScript responsivos |
| Inteligência Artificial | Gemini, chamado exclusivamente pelo backend |
| Dados e autenticação | Supabase: PostgreSQL, Auth, Storage privado e RLS |
| Hospedagem | Vercel |
| Documentos | python-docx e ReportLab |

## Rodar localmente

### Pré-requisitos

- Python 3.12 ou superior
- Conta no Supabase
- Projeto com acesso à API Gemini
- Node 20 ou superior, apenas para os testes de banco

### Instalação

    git clone https://github.com/KerollayneAkemy/EduPlan.git
    cd EduPlan

    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    Copy-Item .env.example .env

Preencha o arquivo .env, aplique a migração do Supabase e então execute:

    python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

Abra [http://localhost:8000](http://localhost:8000). Para o login, mantenha sempre a mesma origem local: localhost e 127.0.0.1 são endereços diferentes para o fluxo de autenticação.

## Variáveis de ambiente

Preencha .env e nunca o envie ao GitHub.

| Variável | Finalidade |
| --- | --- |
| SUPABASE_URL | URL do projeto Supabase |
| SUPABASE_ANON_KEY | Chave pública do Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Chave privada usada somente no servidor |
| GEMINI_API_KEY | Chave da API Gemini do projeto |
| GEMINI_MODEL | Modelo Gemini utilizado |
| KEY_ENCRYPTION_SECRET | Segredo Fernet para cifrar chaves pessoais |
| PROJECT_DAILY_LIMIT | Limite diário por usuário da chave do projeto |
| ARIAL_FONT_PATH | Caminho de uma Arial licenciada, se necessária |
| ARIAL_LICENSE_CONFIRMED | Use true somente após confirmar a licença |

Para gerar o segredo de criptografia:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

## Supabase e login Google

1. Crie um projeto no Supabase.
2. Execute uma única vez o arquivo supabase/migrations/001_eduplan.sql no SQL Editor.
3. A migração cria tabelas, políticas RLS, funções e o bucket privado eduplan.
4. Copie URL, chave pública e chave privada para .env.
5. No Google Cloud, crie uma credencial OAuth para aplicativo Web.
6. No provedor Google do Supabase, informe o Client ID e o Client Secret.

Durante o desenvolvimento, use:

    URI de redirecionamento do Google
    https://SEU-PROJETO.supabase.co/auth/v1/callback

    Site URL no Supabase
    http://localhost:8000

    Redirect URL no Supabase
    http://localhost:8000/

Na publicação, acrescente o domínio HTTPS da Vercel nas Redirect URLs do Supabase e nas origens autorizadas do Google Cloud.

As políticas de segurança garantem que cada professor veja somente seus próprios planos anuais, conversas, arquivos e materiais. Os downloads são protegidos por autenticação e não usam links públicos permanentes.

## Documentos e exportação

O EduPlan gera e guarda os arquivos no backend, no armazenamento privado da conta.

- **Word (.docx):** conteúdo organizado para edição.
- **PDF:** A4, texto preto, margens ajustáveis e separação entre atividade e orientações do professor.
- **TXT:** UTF-8, com títulos e separações, sem diagramação.

Quando não existe uma Arial licenciada configurada no servidor, o PDF usa Helvetica para funcionar também na Vercel. A interface informa a fonte antes do download; a substituição não é silenciosa. Se a instituição exigir Arial, configure ARIAL_FONT_PATH e ARIAL_LICENSE_CONFIRMED com uma fonte licenciada para esse uso.

## Publicar na Vercel

1. Importe este repositório como projeto FastAPI.
2. Cadastre as variáveis de .env.example em Environment Variables e marque os segredos como sensíveis.
3. Configure Python 3.12. A entrada é app.py, objeto app.
4. Faça o deploy e copie o domínio HTTPS final.
5. Acrescente o domínio às Redirect URLs do Supabase e às origens autorizadas do Google.
6. Teste login, plano anual, conversa, exportações e microfone no endereço publicado.

Não envie .env, credenciais, fontes sem licença, .venv ou node_modules ao repositório.

## Segurança e privacidade

- Chaves Gemini nunca são expostas ao navegador.
- Chaves pessoais são cifradas no servidor e não retornam pela API.
- Não existe troca silenciosa de chave pessoal pela chave do projeto.
- Arquivos são tratados como fonte de conteúdo, não como instruções.
- Evite inserir nomes, diagnósticos ou dados sensíveis de estudantes.
- A avaliação e a decisão final sobre notas continuam com o professor.

## Testes

    python -m pip install -r requirements-dev.txt
    python -m pytest -q

    npm ci
    npm run check
    npm run test:db

Os testes verificam arquivos, exportação, isolamento entre usuários, RLS, persistência, versões, cotas e segurança do armazenamento. O OAuth do Google e a geração real do Gemini dependem das credenciais configuradas no ambiente.

## Estrutura

    app.py                       Rotas da API, autenticação e arquivos
    backend/services.py          Supabase, Gemini, criptografia e erros
    backend/prompts.py           Regras do assistente e oito funções
    backend/documents.py         Extração de texto e exportação
    static/                      Interface, estilos e reconhecimento de voz
    supabase/migrations/         Banco, RLS, transações e bucket privado
    tests/                       Testes Python e PostgreSQL
    examples/                    Materiais para testar as três etapas
    docs/                        Validação, roteiro e documentação

## Documentação complementar

- [Como finalizar a configuração](docs/FINALIZAR.md)
- [Roteiro para apresentação](docs/APRESENTACAO.md)
- [Matriz de validação](docs/VALIDACAO.md)

## Referências técnicas

- [FastAPI na Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Autenticação Google com Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Segurança do Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control)
- [SDK Gemini para Python](https://googleapis.github.io/python-genai/)
- [Fontes e incorporação da Microsoft](https://learn.microsoft.com/typography/fonts/font-faq)

---

Feito para tornar a rotina docente mais leve, clara e bem organizada. ✦
