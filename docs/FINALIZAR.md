# Como finalizar o EduPlan

Atualizado em 5 de novembro de 2026. Faça primeiro as etapas 1 a 4 para usar o protótipo no computador. Publique depois de testar.

## O que já está pronto

- Migração Supabase com 11 tabelas, RLS, funções e armazenamento privado.
- Modelo `.env.example` com as variáveis necessárias para URL, chave pública, Gemini e criptografia.
- Backend compatível com as chaves modernas do Supabase.
- PDF local com Arial instalada no Windows; permissões de incorporação verificadas (`fsType=8`). A fonte não foi copiada.
- DOCX, PDF e TXT reais; PDF de teste inspecionado em duas páginas.
- Testes de banco remoto com dados temporários revertidos, testes Python e testes do ditado.
- Atalhos `configurar-chaves.cmd` para digitar segredos sem exibi-los e `iniciar.cmd` para iniciar o site.

Execute a migração inicial uma única vez no projeto Supabase que será usado pelo EduPlan.

## 1. Obter a chave privada do Supabase

1. Abra o painel do seu projeto no Supabase e vá em **Settings → API Keys**.
2. Na área de Secret keys, copie a chave que começa com `sb_secret_`. Se não existir, crie uma Secret key para o backend EduPlan.
3. Não confunda com `sb_publishable_`: a chave pública já está configurada. Uma chave legada `service_role` também é aceita.
4. Guarde para colar na etapa 3. Nunca envie a chave no chat, em screenshots ou no repositório.

Essa chave permite ao backend acessar as configurações criptografadas e controlar as cotas. O conector usado nesta conversa fornece apenas chaves públicas, por isso este passo depende de você.

## 2. Obter a chave Gemini

1. Abra [Google AI Studio — API keys](https://aistudio.google.com/api-keys).
2. Entre na sua conta Google. Se houver termos de uso, leia e aceite pessoalmente se concordar.
3. Crie ou selecione uma chave da Gemini API no seu projeto Google Cloud. Use restrição à API correspondente quando disponível; uma chave restrita a outro serviço não funcionará.
4. Confira se o projeto tem acesso e cota ao modelo configurado. O exemplo atual usa `gemini-flash-lite-latest`, validado com a chave local. O identificador pode ser alterado em `GEMINI_MODEL` no `.env`.
5. Não é necessário prometer pagamento nem habilitar cobrança automaticamente. Se o Google exigir cobrança para o modelo escolhido, decida no painel ou escolha outro modelo compatível disponível para sua conta. Plano estudantil do aplicativo Gemini não garante cota da API.

## 3. Salvar as duas chaves no computador

1. Abra a pasta onde o EduPlan foi baixado.
2. Dê dois cliques em `configurar-chaves.cmd`.
3. Cole a Secret key do Supabase no primeiro pedido e pressione Enter.
4. Cole a chave Gemini no segundo e pressione Enter.
5. As chaves não aparecem enquanto você cola: isso é intencional. Enter em branco mantém o valor existente.
6. Aguarde a mensagem de configuração salva. As chaves ficam no arquivo `.env`, ignorado pelo Git e pelo envio à Vercel.

Não apague nem regenere `KEY_ENCRYPTION_SECRET` depois que houver chaves pessoais salvas: ele é necessário para decifrá-las.

## 4. Configurar o botão Continuar com o Google

**No Google Cloud:**

1. Abra [Google Cloud Console](https://console.cloud.google.com/). Crie ou selecione um projeto para o EduPlan.
2. Abra **Google Auth Platform**. Se aparecer “Get started”, complete a configuração inicial.
3. Em **Branding**, informe nome `EduPlan`, e-mail de suporte e contato do desenvolvedor.
4. Em **Audience**, use público externo se os professores usam contas Google pessoais. Enquanto o aplicativo estiver em teste, inclua seu e-mail e os e-mails dos apresentadores em **Test users**.
5. Em **Data Access**, mantenha os escopos básicos de identidade: `openid`, e-mail e perfil. Não solicite acesso ao Drive ou Gmail.
6. Em **Clients**, crie um OAuth Client ID do tipo **Web application**.
7. Em **Authorized JavaScript origins**, adicione `http://localhost:8000`.
8. Em **Authorized redirect URIs**, adicione exatamente:

```text
https://SEU_PROJECT_REF.supabase.co/auth/v1/callback
```

9. Salve e copie **Client ID** e **Client Secret**. Esse Client Secret é diferente da chave Gemini e da Secret key do Supabase.

**No Supabase:**

10. No painel do Supabase, procure **Authentication → Sign In / Providers → Google**.
11. Ative Google, informe o Client ID e o Client Secret criados no Google Cloud. Não desative a verificação de nonce.
12. No painel do Supabase, abra **Authentication → URL Configuration**.
13. Para desenvolvimento, preencha **Site URL** com `http://localhost:8000`.
14. Adicione `http://localhost:8000/` à lista **Redirect URLs** e salve.

Não alterne entre `localhost` e `127.0.0.1` durante o login. A sessão e o verificador PKCE pertencem à origem usada ao iniciar a autenticação.

## 5. Iniciar e testar

1. Se já existir um servidor EduPlan rodando, encerre-o com Ctrl+C no terminal correspondente. Se estiver rodando pela conversa, peça para reiniciá-lo.
2. Dê dois cliques em `iniciar.cmd` e mantenha a janela aberta.
3. Abra [EduPlan local](http://localhost:8000/) no Chrome ou navegador compatível e clique em **Continuar com o Google**.
4. Preencha seu nome, disciplina e turma. Cadastre `examples/ementa-fundamental-i.txt` em Minhas ementas.
5. Selecione a ementa e teste a adaptação com o pedido do roteiro em `docs/APRESENTACAO.md`.
6. Baixe Word, PDF e TXT. Abra o Word no seu editor e confira a diagramação, pois o renderizador automático de DOCX não estava disponível nesta máquina.
7. Saia e entre novamente. Confira a conversa e os materiais. Depois teste nova versão da ementa e outra conta Google.
8. Teste Ditar → Parar → editar → Enviar. O ditado depende do serviço de voz e da permissão do navegador, sem envio automático.

Depois de configurar as chaves e o Google, reinicie o EduPlan antes de testar.

## 6. Publicar na Vercel

1. Entre na [Vercel](https://vercel.com/). A conta ainda não foi conectada nesta conversa.
2. A opção por terminal dispensa criar um repositório agora. Abra um terminal na pasta EduPlan e execute `npx vercel`.
3. Autorize o login da CLI pessoalmente. Escolha sua conta, crie o projeto `eduplan` e use esta pasta como raiz. Se pedir framework, use FastAPI. Não configure um build de frontend Node nem um diretório `dist`.
4. Quando existir o projeto no painel, abra **Settings → Environment Variables** e adicione os valores do `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `KEY_ENCRYPTION_SECRET` e `PROJECT_DAILY_LIMIT`. Marque segredos como sensíveis. Não publique nem envie o arquivo `.env`.
5. Na Vercel, **não use o caminho Windows de Arial**. Até obter Arial licenciada para uso no servidor, deixe `ARIAL_FONT_PATH` vazio e `ARIAL_LICENSE_CONFIRMED=false`. Nesse ambiente PDF exibirá a limitação; Word e TXT continuarão disponíveis. Isso precisa ser resolvido para cumprir os três formatos online.
6. Execute `npx vercel --prod`. Use Python 3.12. A entrada é `app.py`; a configuração de duração já está em `vercel.json`.
7. Copie o endereço HTTPS publicado. No Supabase, altere Site URL para esse endereço e adicione o endereço com `/` final em Redirect URLs. Mantenha também localhost se quiser continuar desenvolvendo.
8. No cliente OAuth do Google, adicione o domínio HTTPS publicado em Authorized JavaScript origins. A URI de retorno do Google **continua sendo a mesma URL do Supabase** mostrada na etapa 4.
9. Teste o site publicado com Google, ementa, Gemini, histórico e downloads. Não considere a publicação validada apenas porque a página inicial abriu.

Alternativamente, conecte Vercel ao aplicativo para o assistente ajudar na publicação; ainda haverá ações pessoais de login e configuração de credenciais.

## Fontes oficiais

- [Chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [Google OAuth no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Chaves Gemini](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash)
- [FastAPI na Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Uso e incorporação de fontes Windows](https://learn.microsoft.com/en-us/typography/fonts/font-faq)
