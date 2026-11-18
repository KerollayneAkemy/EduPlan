'use strict';
const $ = (id) => document.getElementById(id);
const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config, auth, session, data = null, current = null, attached = [], busy = false, switchingConversation = false, task = 'adaptar', retry = null;
const descriptions = {
 adaptar:'Ajuste atividades às necessidades da turma', planejar:'Planos de aula e sequências didáticas', revisar:'Revise textos, questões e respostas', relatar:'Organize observações pedagógicas',
 material:'Textos, resumos e roteiros de slides', prova:'Questões e critérios de avaliação', exercicios:'Atividades de prática e revisão', dinamicas:'Estratégias e atividades em grupo'
};
const starters = {
 adaptar:'Quero adaptar uma atividade. Ajude-me a preservar o objetivo pedagógico e a escolher os apoios adequados.',
 planejar:'Quero organizar meu planejamento. Ajude-me a definir as informações necessárias.',
 revisar:'Quero corrigir ou revisar um material. Oriente-me sobre o que enviar e quais critérios precisamos.',
 relatar:'Quero elaborar um relatório com base nas minhas observações. Pergunte a finalidade e o que preciso fornecer.',
 material:'Quero criar um material didático ou roteiro de apresentação. Ajude-me a escolher o formato e o conteúdo.',
 prova:'Quero elaborar uma avaliação. Ajude-me a definir conteúdo, quantidade e tipos de questões.',
 exercicios:'Quero gerar exercícios para minha turma. Ajude-me a definir o objetivo e o conteúdo.',
 dinamicas:'Quero ideias de dinâmicas e estratégias de ensino. Ajude-me a escolher uma proposta para minha turma.'
};
function notice(message, error=false) { $('alert').textContent=message; $('alert').classList.toggle('error',error); $('alert').hidden=!message; }
function friendlyError(error) {
 const message=error instanceof Error ? error.message : '';
 if(/cannot read properties|undefined|null/i.test(message)) return 'Ainda estamos carregando suas informações. Aguarde alguns segundos e tente novamente.';
 return message || 'Não foi possível concluir. Tente novamente.';
}
function report(error) { const message=friendlyError(error);notice(message,true); if($('dialog').open){ let el=$('dialog-error'); if(!el){el=document.createElement('p');el.id='dialog-error';el.className='dialog-error';el.setAttribute('role','alert');$('dialog-content').append(el);}el.textContent=message; } }
function run(fn){ return async(...args)=>{try{await fn(...args);}catch(e){report(e);}}; }
function on(id,event,fn){ $(id).addEventListener(event,run(fn)); }
function modal(html){$('dialog-content').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function button(text, fn, cls='chip'){const el=document.createElement('button');el.type='button';el.className=cls;el.textContent=text;el.addEventListener('click',run(fn));return el;}
async function api(path, options={}) {
 if(!auth)throw new Error('Configure o Supabase para usar sua conta. Veja as instruções de instalação.');
 const {data: s}=await auth.auth.getSession();session=s.session;
 if(!session){login();throw new Error('Entre com sua conta Google para continuar.');}
 const headers={Authorization:`Bearer ${session.access_token}`,...options.headers};
 if(options.body && !(options.body instanceof FormData)){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
 let response;try{response=await fetch('/api'+path,{...options,headers});}catch{throw new Error('Falha de conexão. Verifique sua internet e tente novamente.');}
 if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(typeof e.detail==='string'?e.detail:'Revise os campos informados e tente novamente.');}
 return options.blob?response.blob():response.json();
}
function emptyState(){return {profile:null,key:{mode:'project',saved:false},syllabi:[],versions:[],conversations:[],materials:[]};}
function normalizeState(value){
 if(!value || typeof value!=='object')throw new Error('Não foi possível carregar suas informações. Atualize a página e tente novamente.');
 const fallback=emptyState();
 return {...fallback,...value,key:{...fallback.key,...(value.key||{})},syllabi:Array.isArray(value.syllabi)?value.syllabi:[],versions:Array.isArray(value.versions)?value.versions:[],conversations:Array.isArray(value.conversations)?value.conversations:[],materials:Array.isArray(value.materials)?value.materials:[]};
}
function stateReady(){if(data)return true;notice('Carregando suas informações. Aguarde alguns segundos e tente novamente.');return false;}
async function refresh(){data=normalizeState(await api('/state'));renderSidebar();renderContext();}
function renderSidebar(){
 const state=data||emptyState();
 $('recent').replaceChildren();
 if(!state.conversations.length){$('recent').innerHTML='<p class="muted">Ainda não há conversas.<br>Vamos preparar sua primeira aula?</p>';}
 state.conversations.forEach(c=>{const item=button(c.title,()=>openConversation(c.id),'');item.disabled=switchingConversation;$('recent').append(item);});
 const name=state.profile?.name || 'Professor';$('avatar').textContent=name.charAt(0).toUpperCase();
 $('account-name').replaceChildren(document.createTextNode(name));const small=document.createElement('small');small.textContent='Seu trabalho, sempre por perto';$('account-name').append(small);
}
function fillSelect(id, values, placeholder, chosen){$(id).replaceChildren(new Option(placeholder,''));values.forEach(([value,label])=>$(id).add(new Option(label,value)));$(id).value=chosen||'';}
function renderContext(){
 const state=data||emptyState();
 const subject=current?.conversation.subject || $('subject').value, classroom=current?.conversation.classroom || $('classroom').value;
 const subjects=[...new Set([...(state.profile?.subjects||[]),...state.syllabi.map(s=>s.subject),subject].filter(Boolean))];
 const classes=[...new Set([...(state.profile?.classes||[]),...state.syllabi.map(s=>s.classroom),classroom].filter(Boolean))];
 fillSelect('subject',subjects.map(s=>[s,s]),'Selecionar disciplina',subject);
 fillSelect('classroom',classes.map(s=>[s,s]),'Selecionar turma',classroom);
 const versions=state.versions.map(v=>{const s=state.syllabi.find(s=>s.id===v.syllabus_id);return [v.id,`${s?.name||'Ementa'} · v${v.version}`];});
 fillSelect('reference',versions,'Sem ementa selecionada',current?.conversation.version_id||$('reference').value);
 $('subject').disabled=!!current;$('classroom').disabled=!!current;
}
function view(name){
 document.body.classList.remove('menu-open');$('menu').setAttribute('aria-expanded','false');
 $('home').hidden=name!=='home';$('chat').hidden=name!=='chat';$('library').hidden=!['syllabi','materials','settings'].includes(name);
 $('composer-area').hidden=!['home','chat'].includes(name);$('context-bar').hidden=!['home','chat'].includes(name);
 $('page-name').textContent=({home:'Nova conversa',chat:current?.conversation.title||'Conversa',syllabi:'Minhas ementas',materials:'Meus materiais',settings:'Configurações'})[name];
 ['home','syllabi','materials','settings'].forEach(x=>$('nav-'+x).classList.toggle('active',x===name||(x==='home'&&name==='chat')));
}
function login(){
 modal('<h2>Entrar no EduPlan</h2><p>Acesse suas conversas, ementas e materiais com sua conta Google.</p><button id="google-login" class="google"><span>G</span> Continuar com o Google</button><p class="form-help">Uma conta para todas as suas disciplinas e turmas. Não precisamos de dados pessoais dos alunos.</p>');
 on('google-login','click',async()=>{
  if(!config.configured || !auth)throw new Error('Login ainda não configurado. O responsável deve conectar o Supabase e ativar o provedor Google conforme o README.');
  const {error}=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}});if(error)throw new Error('Não foi possível iniciar o login Google. Verifique a configuração.');
 });
}
function needLogin(){if(!session){login();return true;}return false;}
function resizeComposer(){const field=$('message');field.style.height='auto';field.style.height=Math.min(Math.max(field.scrollHeight,54),180)+'px';}
function prefillMessage(text){$('message').value=text;resizeComposer();$('message').focus();}
function newChat(){if(busy||switchingConversation){notice('Aguarde a conversa atual terminar de abrir.');return;}current=null;attached=[];retry=null;renderAttachments();if(data)renderContext();prefillMessage('');view('home');}
async function startConversation(){
 const c=await api('/conversations',{method:'POST',body:{task,version_id:$('reference').value||null,subject:$('subject').value,classroom:$('classroom').value}});
 current={conversation:c,messages:[],materials:[]};await refresh();renderChat();
}
function setConversationLoading(active){
 switchingConversation=active;
 $('recent').setAttribute('aria-busy',String(active));
 $('recent').querySelectorAll('button').forEach(item=>item.disabled=active);
 $('new-chat').disabled=active;
}
function conversationLoading(){
 view('chat');
 $('messages').replaceChildren();
 const loading=document.createElement('p');loading.className='session-note conversation-loading';loading.setAttribute('role','status');loading.textContent='Abrindo conversa…';$('messages').append(loading);
}
async function openConversation(id){
 if(busy){notice('Aguarde a resposta atual para trocar de conversa.');return;}
 if(switchingConversation){notice('A conversa selecionada ainda está sendo aberta.');return;}
 if(current?.conversation.id===id){renderChat();return;}
 const previous=current;
 setConversationLoading(true);conversationLoading();notice('Abrindo conversa…');
 try{
  const opened=await api('/conversations/'+id);
  current=opened;attached=[];retry=null;renderAttachments();
  await refresh();renderChat();notice('');
 }catch(error){
  current=previous;
  if(previous)renderChat();else view('home');
  throw error;
 }finally{setConversationLoading(false);}
}
function appendInline(target,text){
 const parts=String(text??'').split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/g);
 parts.forEach(part=>{if(!part)return;const emphasis=part.match(/^(?:\*\*([^*\n]+)\*\*|__([^_\n]+__?)|`([^`\n]+)`)$/.exec(part));if(emphasis){const strong=document.createElement('strong');strong.textContent=emphasis[1]||emphasis[2]||emphasis[3];target.append(strong);}else target.append(document.createTextNode(part));});
}
function displayText(text){
 return String(text??'')
  .replace(/\r/g,'')
  .replace(/^\s*```[^\n]*$/gm,'')
  .replace(/^\s*-{3,}\s*$/gm,'')
  .replace(/\[([^\]\n]+)\]\([^\)\n]+\)/g,'$1')
  .replace(/^\s*#{1,6}\s*/gm,'')
  .replace(/\*\*([^*\n]+)\*\*/g,'$1')
  .replace(/__([^_\n]+)__/g,'$1')
  .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'$1')
  .replace(/`/g,'')
  .replace(/^\s*\*\s+/gm,'• ');
}
function formatMessage(text){
 const content=document.createElement('div');content.className='message-content';let paragraph=[],list=null,listType='';
 const flushParagraph=()=>{if(!paragraph.length)return;const p=document.createElement('p');appendInline(p,paragraph.join(' '));content.append(p);paragraph=[];};
 const flushList=()=>{list=null;listType='';};
 String(text??'').replace(/\r/g,'').split('\n').forEach(raw=>{
  const line=raw.trim();const heading=line.match(/^(#{1,3})\s+(.+)/);const plainTitle=!heading&&line.match(/^(.{2,80}):$/);const bullet=line.match(/^[-*•]\s+(.+)/);const numbered=line.match(/^\d+[.)]\s+(.+)/);const table=line.match(/^\|(.+)\|$/);
  if(!line){flushParagraph();flushList();return;}
  if(/^```/.test(line)||/^-{3,}$/.test(line)){flushParagraph();flushList();return;}
  if(table){if(!/^[|\s:-]+$/.test(line))paragraph.push(table[1].split('|').map(cell=>displayText(cell.trim())).filter(Boolean).join(' · '));return;}
  if(heading||plainTitle){flushParagraph();flushList();const h=document.createElement('h3');appendInline(h,displayText((heading||plainTitle)[2]||plainTitle[1]));content.append(h);return;}
  if(bullet||numbered){flushParagraph();const type=numbered?'ol':'ul';if(!list||listType!==type){list=document.createElement(type);listType=type;content.append(list);}const item=document.createElement('li');appendInline(item,displayText((bullet||numbered)[1]));list.append(item);return;}
  flushList();paragraph.push(displayText(line));
 });
 flushParagraph();return content;
}
async function copyMessage(text, control){
 try{const plain=displayText(text);if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(plain);else{const field=document.createElement('textarea');field.value=plain;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();document.execCommand('copy');field.remove();}const label=control.textContent;control.textContent='Copiado';notice('Resposta copiada.');setTimeout(()=>{if(control.isConnected)control.textContent=label;},1600);}catch{throw new Error('Não foi possível copiar agora. Selecione o texto e tente novamente.');}
}
function editAndResend(text){prefillMessage(text);notice('Edite sua pergunta e envie novamente. A pergunta original continua salva no histórico.');}
function renderChat(){
 view('chat');$('messages').replaceChildren();$('chat-title').textContent=current?.conversation?.title||'Conversa';
 if(!current?.messages?.length){const p=document.createElement('p');p.className='session-note';p.textContent='Este espaço está pronto. Envie uma atividade, dúvida ou ideia para começar.';const ideas=document.createElement('div');ideas.className='chat-starters';[['Adaptar uma atividade','Quero adaptar uma atividade.'],['Criar exercícios','Quero gerar exercícios para a turma.'],['Organizar uma aula','Quero organizar um plano de aula.']].forEach(([label,text])=>ideas.append(button(label,()=>prefillMessage(text),'chip')));$('messages').append(p,ideas);}
 current.messages.forEach(m=>{
  const el=document.createElement('article');el.className='message '+m.role;
  const title=document.createElement('span');title.className='speaker';title.textContent=m.role==='user'?'VOCÊ':'EDUPLAN';el.append(title,formatMessage(m.content));
  if(m.file_ids?.length){const note=document.createElement('p');note.className='message-attachment';note.textContent=`${m.file_ids.length} anexo(s) de atividade nesta mensagem`;el.append(note);}
  if(m.role==='user'){const footer=document.createElement('div');footer.className='message-footer';footer.append(button('Editar e reenviar',()=>editAndResend(m.content),'chip'));el.append(footer);}
  if(m.role==='assistant'){
   const footer=document.createElement('div');footer.className='message-footer';footer.append(button('Copiar resposta',()=>copyMessage(m.content,footer.firstElementChild),'chip'));el.append(footer);
   const mat=current.materials.find(x=>x.request_id===m.request_id);
   if(mat){const actions=document.createElement('div');actions.className='actions';['Simplificar linguagem','Ajustar dificuldade','Dividir em etapas','Incluir gabarito','Revisar conteúdo'].forEach(text=>actions.append(button(text,()=>prefillMessage(text+' no material anterior.'),'chip')));actions.append(button('↓ Baixar material',()=>exportDialog(mat)));el.append(actions);}
  }
  $('messages').append(el);
 });
}
async function send(text){
 if(needLogin()||busy||!stateReady())return;if(!text.trim())return;
 busy=true;$('send').disabled=true;notice('');let optimistic=null;
 try{
  if(!current)await startConversation();
  const files=attached.map(f=>f.id);const signature=JSON.stringify([current.conversation.id,text,files]);
  if(!retry||retry.signature!==signature)retry={signature,id:crypto.randomUUID()};
  optimistic={role:'user',content:text,file_ids:files};current.messages.push(optimistic);renderChat();
  $('generating').hidden=false;$('generating').scrollIntoView({block:'nearest'});
  current=await api('/conversations/'+current.conversation.id+'/messages',{method:'POST',body:{text,file_ids:files,request_id:retry.id}});
  prefillMessage('');attached=[];retry=null;renderAttachments();renderChat();await refresh();
  $('messages').lastElementChild?.scrollIntoView({block:'start',behavior:'smooth'});
 }catch(error){
  if(optimistic&&current?.messages){current.messages=current.messages.filter(message=>message!==optimistic);renderChat();}
  throw error;
 }finally{busy=false;$('send').disabled=false;$('generating').hidden=true;}
}
function renderAttachments(){ $('attachments').replaceChildren();attached.forEach((f,i)=>$('attachments').append(button(f.filename+' ×',()=>{attached.splice(i,1);renderAttachments();}))); }
async function uploadFile(file){if(!file)throw new Error('Escolha um arquivo.');if(file.size>3*1024*1024)throw new Error('Envie um arquivo de até 3 MB.');const form=new FormData();form.append('file',file);return api('/files',{method:'POST',body:form});}
function profileForm(first=false){
 const p=data?.profile||{};
 modal(`<h2>${first?'Vamos conhecer sua rotina?':'Seu perfil de professor'}</h2><p>Seu nome, disciplinas e turmas ajudam o EduPlan a fazer perguntas mais úteis. Você pode mudar tudo depois.</p><form id="profile-form"><label class="field">Como podemos chamar você?<input id="profile-name" required maxlength="100" value="${escapeHTML(p.name||'')}" autocomplete="given-name"></label><label class="field">Disciplinas (separe por vírgula)<input id="profile-subjects" value="${escapeHTML((p.subjects||[]).join(', '))}" placeholder="Língua Portuguesa, Matemática"></label><label class="field">Etapas e turmas (separe por vírgula)<input id="profile-classes" value="${escapeHTML((p.classes||[]).join(', '))}" placeholder="Fundamental I · 3º ano A, Médio · 1ª série B"></label><p class="form-help">Somente o nome é obrigatório. Inclua etapa e ano/série ao descrever suas turmas.</p><button class="primary">Salvar e continuar</button></form>`);
 on('profile-form','submit',async e=>{e.preventDefault();const split=id=>$(id).value.split(',').map(s=>s.trim()).filter(Boolean);await api('/profile',{method:'PUT',body:{name:$('profile-name').value.trim(),subjects:split('profile-subjects'),classes:split('profile-classes')}});$('dialog').close();await refresh();notice('Perfil salvo. Vamos preparar sua próxima aula?');});
}
function syllabusForm(existing=null){
 modal(`<h2>${existing?'Atualizar ementa':'Adicionar uma ementa'}</h2><p>${existing?'Uma nova versão será criada. As conversas anteriores manterão a referência original.':'Sua referência curricular orienta as propostas do EduPlan.'}</p><form id="syllabus-form"><label class="field">Nome da ementa<input id="sy-name" required maxlength="120" value="${escapeHTML(existing?.name||'')}" placeholder="Matemática · 3º ano · 2026"></label><div class="form-row"><label class="field">Disciplina<input id="sy-subject" required maxlength="100" value="${escapeHTML(existing?.subject||'')}"></label><label class="field">Etapa<select id="sy-stage"><option>Ensino Fundamental I</option><option>Ensino Fundamental II</option><option>Ensino Médio</option></select></label></div><label class="field">Ano/série e turma (opcional)<input id="sy-class" maxlength="100" value="${escapeHTML(existing?.classroom||'')}" placeholder="3º ano A"></label><label class="field">Arquivo da ementa<input id="sy-file" type="file" accept=".pdf,.docx,.txt" required></label><p class="form-help">PDF com texto, Word (.docx) ou TXT UTF-8 · até 3 MB. PDFs digitalizados não são lidos nesta versão.</p><button class="primary" id="save-syllabus">${existing?'Salvar nova versão':'Cadastrar ementa'}</button></form>`);
 if(existing)$('sy-stage').value=existing.stage;
 on('syllabus-form','submit',async e=>{e.preventDefault();$('save-syllabus').disabled=true;try{const f=await uploadFile($('sy-file').files[0]);const v=await api('/syllabi',{method:'POST',body:{name:$('sy-name').value,subject:$('sy-subject').value,stage:$('sy-stage').value,classroom:$('sy-class').value,file_id:f.id,syllabus_id:existing?.id||null}});$('dialog').close();await refresh();renderSyllabi();notice(`Ementa salva: versão ${v.version}.`);}finally{if($('save-syllabus'))$('save-syllabus').disabled=false;}});
}
function libraryHeader(title, subtitle, action){$('library').innerHTML=`<div class="library-top"><h1>${title}</h1><div id="library-action"></div></div><p class="muted">${subtitle}</p><div id="library-list"></div>`;if(action)$('library-action').append(action);}
function renameDialog(title,value,save){modal(`<h2>${title}</h2><form id="rename-form"><label class="field">Nome<input id="rename-name" required maxlength="120" value="${escapeHTML(value)}"></label><button class="primary">Salvar</button></form>`);on('rename-form','submit',async e=>{e.preventDefault();await save($('rename-name').value);$('dialog').close();await refresh();});}
function renderSyllabi(){
 if(needLogin()||!stateReady())return;view('syllabi');libraryHeader('Minhas ementas','Referências organizadas, com as versões anteriores sempre preservadas.',button('＋ Adicionar ementa',()=>syllabusForm(),'primary'));
 if(!data.syllabi.length)$('library-list').innerHTML='<div class="empty"><h2>Nenhuma ementa cadastrada</h2><p>Adicione uma ementa para orientar as propostas de conteúdo.<br>Você também pode conversar sem uma ementa.</p></div>';
 data.syllabi.forEach(s=>{
  const el=document.createElement('article');el.className='list-card';el.innerHTML=`<h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.subject)} · ${escapeHTML(s.stage)} · ${escapeHTML(s.classroom)}</p>`;
  const actions=document.createElement('div');actions.className='actions';actions.append(button('Atualizar arquivo',()=>syllabusForm(s)),button('Renomear',()=>renameDialog('Renomear ementa',s.name,async name=>{await api('/syllabi/'+s.id,{method:'PATCH',body:{name}});await refresh();renderSyllabi();})));
  el.append(actions);
  data.versions.filter(v=>v.syllabus_id===s.id).forEach(v=>{const row=document.createElement('div');row.className='actions';const label=document.createElement('span');label.className='badge';label.textContent=`Versão ${v.version} · ${new Date(v.created_at).toLocaleDateString('pt-BR')}`;row.append(label,button('Visualizar',async()=>{const full=await api('/versions/'+v.id);modal(`<h2>${escapeHTML(full.name)} · v${v.version}</h2><div class="document-preview">${escapeHTML(full.text)}</div><div id="version-actions" class="dialog-actions"></div>`);$('version-actions').append(button('Baixar original',async()=>download(await api('/files/'+full.file_id,{blob:true}),full.filename)),button('Usar em nova conversa',()=>{$('dialog').close();newChat();$('reference').value=v.id;view('home');}));}),button('Selecionar',()=>{newChat();$('reference').value=v.id;notice(`Referência selecionada: ${s.name}, versão ${v.version}.`);}));el.append(row);});
  $('library-list').append(el);
 });
}
function renderMaterials(){
 if(needLogin()||!stateReady())return;view('materials');libraryHeader('Meus materiais','Propostas salvas para revisar, organizar e levar para a sala de aula.');
 if(!data.materials.length)$('library-list').innerHTML='<div class="empty"><h2>Nenhum material salvo</h2><p>Os materiais produzidos nas conversas são salvos automaticamente.</p></div>';
 data.materials.forEach(m=>{const el=document.createElement('article');el.className='list-card';el.innerHTML=`<h3>${escapeHTML(m.title)}</h3><p class="muted">${new Date(m.created_at).toLocaleDateString('pt-BR')} · Proposta para revisão docente</p>`;const actions=document.createElement('div');actions.className='actions';actions.append(button('Visualizar e baixar',async()=>exportDialog(await api('/materials/'+m.id))),button('Abrir conversa',()=>openConversation(m.conversation_id)),button('Renomear',()=>renameDialog('Organizar material',m.title,async name=>{await api('/materials/'+m.id,{method:'PATCH',body:{name}});await refresh();renderMaterials();})));el.append(actions);$('library-list').append(el);});
}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportDialog(m){
 const pdfNotice=config.pdf_notice||'PDF disponível para download.';
 modal(`<h2>${escapeHTML(m.title)}</h2><p>Revise a proposta antes de usar. As orientações e o gabarito ficam separados do conteúdo principal.</p><div class="document-preview" id="material-preview"></div><label class="field">Conteúdo do download<select id="export-audience"><option value="all">Material completo, com seção separada do professor</option><option value="student">Somente atividade / conteúdo principal</option><option value="teacher">Somente orientações e gabarito do professor</option></select></label><details><summary>Ajustar modelo acadêmico</summary><p>${escapeHTML(config.pdf_font||'Arial')} 12, preto, A4. Modelo ajustável; não declara conformidade integral com ABNT.</p><div class="form-row">${[['top','Superior',3],['left','Esquerda',3],['bottom','Inferior',2],['right','Direita',2]].map(([id,label,value])=>`<label class="field">Margem ${label.toLowerCase()} (cm)<input id="margin-${id}" type="number" min="1" max="4" step="0.1" value="${value}"></label>`).join('')}</div><label class="field">Espaçamento<select id="export-spacing"><option value="1.5">1,5</option><option value="1">1,0</option><option value="2">2,0</option></select></label></details><div class="dialog-actions" id="export-buttons"></div><p class="form-help">TXT mantém títulos e separações, mas não suporta fonte, cor ou diagramação. ${escapeHTML(pdfNotice)}</p>`);
 const preview=$('material-preview');preview.append(formatMessage(m.student));if(m.teacher){const separator=document.createElement('h3');separator.textContent='Orientações do professor';preview.append(separator,formatMessage(m.teacher));}
 ['docx','pdf','txt'].forEach(format=>{const action=button('↓ '+({docx:'Word',pdf:'PDF',txt:'TXT'})[format],async()=>{const layout={spacing:Number($('export-spacing').value)};['top','left','bottom','right'].forEach(k=>layout[k]=Number($('margin-'+k).value));const blob=await api('/materials/'+m.id+'/export',{method:'POST',blob:true,body:{format,audience:$('export-audience').value,layout}});download(blob,'eduplan-'+m.id+'.'+format);notice('Arquivo gerado e salvo no seu armazenamento privado.');},'secondary');if(format==='pdf'&&config.pdf_available===false){action.disabled=true;action.title='PDF indisponível no momento.';}$('export-buttons').append(action);});
}
function settings(){
 if(needLogin()||!stateReady())return;view('settings');libraryHeader('Configurações','Seu perfil e suas preferências, em um só lugar.');
 $('library-list').innerHTML=`<article class="list-card"><h3>Seu perfil</h3><p>${escapeHTML(data.profile?.name||'Complete seu perfil')}<br>${escapeHTML(data.profile?.subjects?.join(', ')||'Adicione suas disciplinas')}<br>${escapeHTML(data.profile?.classes?.join(', ')||'Adicione suas turmas')}</p><button id="edit-profile" class="secondary">Editar perfil</button></article><article class="list-card"><h3>Chave da IA</h3><p>A opção escolhida vale para todas as conversas. Sua chave pessoal é criptografada no servidor e nunca será exibida aqui.</p><label class="field">Qual chave deseja usar?<select id="key-mode"><option value="project">Usar a chave do projeto</option><option value="personal">Usar minha própria chave do Gemini</option></select></label><div id="personal-key"><label class="field">Chave do Gemini<input type="password" id="api-key" autocomplete="off" maxlength="256" placeholder="${data.key.saved?'Uma chave já está salva. Digite para substituir.':'Cole sua chave aqui'}"></label><p class="form-help">Validar usa uma chamada mínima à API. O plano estudantil do aplicativo Gemini não garante créditos da API.</p></div><div class="actions"><button id="save-key" class="primary">Validar e salvar</button><button id="delete-key" class="secondary">Excluir chave e usar a do projeto</button></div><p class="form-help">A chave do projeto possui limite diário por usuário. Não há troca automática quando a chave pessoal falha.</p></article><article class="list-card"><h3>Sua conta</h3><p>Ementas, conversas e materiais continuarão salvos ao sair.</p><button id="logout" class="secondary">Sair da conta</button></article>`;
 $('key-mode').value=data.key.mode;const visibility=()=>{$('personal-key').hidden=$('key-mode').value!=='personal';$('save-key').textContent=$('key-mode').value==='personal'?'Validar e salvar':'Usar chave do projeto';};visibility();on('key-mode','change',visibility);on('edit-profile','click',()=>profileForm());
 on('save-key','click',async()=>{const secret=$('api-key').value;$('api-key').value='';$('save-key').disabled=true;try{await api('/key',{method:'PUT',body:{mode:$('key-mode').value,key:secret||null}});await refresh();settings();notice('Preferência da chave salva.');}finally{if($('save-key'))$('save-key').disabled=false;}});
 on('delete-key','click',async()=>{await api('/key',{method:'PUT',body:{mode:'project',delete:true}});await refresh();settings();notice('Chave pessoal excluída. Seus materiais foram preservados.');});
 on('logout','click',async()=>{const {error}=await auth.auth.signOut();if(error)throw new Error('Não foi possível sair. Tente novamente.');location.reload();});
}
function microphone(){
 const mic=$('mic'), label=$('mic-label'), status=$('dictation-status'), field=$('message');
 const feedback=(text,error=false)=>{status.hidden=false;status.textContent=text;status.classList.toggle('dictation-error',error);};
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Speech || !window.isSecureContext){
  const reason=!window.isSecureContext?'O ditado precisa de HTTPS ou localhost.':'O ditado não está disponível neste navegador. Se estiver usando o navegador interno do aplicativo, abra este endereço em um navegador com reconhecimento de voz, como o Chrome.';
  label.textContent='Ditado indisponível';mic.title=reason;mic.classList.add('mic-unavailable');
  feedback(reason+' Você pode continuar digitando.');on('mic','click',()=>feedback(reason+' Você pode continuar digitando.',true));return;
 }
 let currentSession=null;
 const reset=()=>{mic.disabled=false;mic.classList.remove('recording');mic.setAttribute('aria-pressed','false');mic.setAttribute('aria-label','Ditar mensagem');label.textContent='Ditar';field.readOnly=false;$('send').disabled=busy;};
 const finish=(s,message,error=false,abort=false)=>{
  if(currentSession!==s)return;
  currentSession=null;clearTimeout(s.timer);reset();
  // Invalidate this session before abort: late events cannot overwrite edited text.
  if(abort){try{s.recognition.abort();}catch{}}
  feedback(message,error);field.focus();
 };
 const completed=s=>s.received?'Ditado concluído. Revise e edite a mensagem; ela só será enviada ao clicar em Enviar.':'Nenhuma fala foi identificada. Clique em Ditar para tentar novamente.';
 const stop=s=>{
  if(currentSession!==s||s.stopping)return;
  if(!s.started){finish(s,'Ditado cancelado. Você pode continuar digitando.',false,true);return;}
  s.stopping=true;clearTimeout(s.timer);label.textContent='Finalizando…';mic.disabled=true;
  feedback('Finalizando a transcrição…');
  // Some browsers never emit onend after stop. Release the composer regardless.
  s.timer=setTimeout(()=>finish(s,'Ditado encerrado. O texto disponível foi mantido; revise antes de enviar.',false,true),1500);
  try{s.recognition.stop();}catch{finish(s,completed(s),false,true);}
 };
 on('mic','click',()=>{
  if(currentSession){stop(currentSession);return;}
  if(busy){feedback('Aguarde a resposta antes de ditar outra mensagem.');return;}
  let recognition;
  try{recognition=new Speech();}catch{feedback('Não foi possível acessar o serviço de voz deste navegador.',true);return;}
  recognition.lang='pt-BR';recognition.interimResults=true;recognition.continuous=true;
  const s={recognition,before:field.value,started:false,stopping:false,received:false,timer:null};currentSession=s;
  field.readOnly=true;$('send').disabled=true;label.textContent='Cancelar';
  mic.setAttribute('aria-label','Cancelar início do ditado');mic.setAttribute('aria-pressed','true');
  feedback('Aguardando o microfone. Autorize o acesso se o navegador solicitar.');
  s.timer=setTimeout(()=>finish(s,'O microfone não iniciou. Confira a permissão no navegador e tente novamente.',true,true),12000);
  recognition.onstart=()=>{
   if(currentSession!==s){try{recognition.abort();}catch{}return;}
   s.started=true;clearTimeout(s.timer);label.textContent='Parar';mic.setAttribute('aria-label','Parar ditado');mic.classList.add('recording');
   feedback('Ouvindo… Clique em Parar para revisar e editar o texto antes de enviar. O áudio pode ser processado pelo serviço de voz do navegador.');
  };
  recognition.onresult=e=>{
   if(currentSession!==s)return;
   const transcript=Array.from(e.results).map(r=>r[0].transcript).join(' ');
   s.received=s.received||!!transcript.trim();field.value=(s.before+' '+transcript).trim().slice(0,12000);if(typeof resizeComposer==='function')resizeComposer();
   if(field.value.length>=12000)stop(s);
  };
  recognition.onerror=e=>{
   if(currentSession!==s)return;
   if(s.stopping){finish(s,completed(s),false,true);return;}
   finish(s,({
    'not-allowed':'Acesso ao microfone recusado. Confira a permissão deste site no navegador. Em um navegador interno, pode ser necessário abrir o EduPlan no Chrome.',
    'service-not-allowed':'O navegador bloqueou o serviço de reconhecimento de voz. Abra o EduPlan em um navegador compatível.',
    'audio-capture':'Não foi possível acessar o microfone. Verifique se ele está conectado e disponível.',
    'no-speech':'Nenhuma fala foi identificada. Clique em Ditar para tentar novamente.',
    network:'Não foi possível conectar ao serviço de voz do navegador. Confira a internet ou tente em outro navegador.',
    'language-not-supported':'O serviço de voz deste navegador não oferece português do Brasil.',
    aborted:'Ditado interrompido. O texto transcrito foi mantido.'
   })[e.error]||'O ditado não foi concluído. O texto transcrito foi mantido; você pode continuar digitando.',true,true);
  };
  recognition.onend=()=>finish(s,completed(s));
  try{recognition.start();}catch{finish(s,'Não foi possível iniciar o ditado. Confira a permissão do microfone no navegador e tente novamente.',true,true);}
 });
}
async function init(){
 microphone();
 config=await fetch('/api/config').then(r=>r.json());
 Object.entries(config.tasks).forEach(([id,label])=>{const el=button('',()=>{if(needLogin())return;task=id;prefillMessage(starters[id]);notice('Envie a mensagem sugerida ou acrescente detalhes. O EduPlan orientará os próximos passos.');},'task-card');el.innerHTML=`<strong>${escapeHTML(label)}</strong><small>${escapeHTML(descriptions[id])}</small>`;$('tasks').append(el);});
 on('menu','click',()=>{const open=document.body.classList.toggle('menu-open');$('menu').setAttribute('aria-expanded',String(open));});
 on('close-dialog','click',()=>$('dialog').close());on('new-chat','click',newChat);on('nav-home','click',()=>current?renderChat():view('home'));
 on('nav-syllabi','click',renderSyllabi);on('nav-materials','click',renderMaterials);on('nav-settings','click',settings);on('account-button','click',()=>session?settings():login());
 on('composer','submit',async e=>{e.preventDefault();await send($('message').value);});
 on('message','input',resizeComposer);on('message','keydown',async e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();await send($('message').value);}});resizeComposer();
 on('attach','click',()=>{if(!needLogin())$('chat-file').click();});on('chat-file','change',async()=>{if(attached.length>=3)throw new Error('Anexe até três arquivos por mensagem.');notice('Lendo e salvando o anexo…');try{attached.push(await uploadFile($('chat-file').files[0]));renderAttachments();notice('Anexo de atividade pronto. Ele não substitui sua ementa de referência.');}finally{$('chat-file').value='';}});
 on('reference','change',()=>{if(current&&$('reference').value!==(current.conversation.version_id||'')){const next=$('reference').value;$('reference').value=current.conversation.version_id||'';modal('<h2>Usar outra referência?</h2><p>Vamos iniciar uma nova conversa. Esta conversa continuará vinculada à versão original da ementa.</p><div id="switch-actions" class="dialog-actions"></div>');$('switch-actions').append(button('Iniciar nova conversa',()=>{if(busy)throw new Error('Aguarde a geração terminar.');$('dialog').close();newChat();$('reference').value=next;},'primary'),button('Continuar nesta conversa',()=>$('dialog').close()));}});
 window.addEventListener('offline',()=>notice('Você está sem conexão. Seu texto permanece aqui; reconecte para enviar.',true));window.addEventListener('online',()=>notice('Conexão restabelecida. Você pode tentar novamente.'));
 if(!config.configured){notice('Ambiente de instalação: conecte Supabase, Google e Gemini para usar as integrações. Nenhuma resposta de IA é simulada.');return;}
 if(!window.supabase)throw new Error('Não foi possível carregar o serviço de login. Verifique a conexão e recarregue.');
 auth=window.supabase.createClient(config.supabase_url,config.supabase_key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true}});
 const result=await auth.auth.getSession();session=result.data.session;
 if(session){await refresh();if(!data.profile)profileForm(true);}else{notice('Entre com o Google para salvar seu trabalho e conversar com o EduPlan.');}
 auth.auth.onAuthStateChange((event,s)=>{session=s;if(event==='SIGNED_OUT'){data=null;current=null;}});
}
run(init)();
