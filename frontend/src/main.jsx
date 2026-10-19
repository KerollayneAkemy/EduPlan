import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, Boxes, FilePlus2, FileText, Home, LogOut, Menu, Search, Settings, Sparkles, X } from 'lucide-react'
import './style.css'
import './responsive.css'

const API = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') || ''
const nav = [
  { id: 'home', name: 'Visão geral', icon: Home }, { id: 'syllabi', name: 'Minhas ementas', icon: BookOpen },
  { id: 'generate', name: 'Gerar material', icon: Sparkles }, { id: 'materials', name: 'Meus materiais', icon: Boxes },
]

function App() {
  const recoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const recoveryFlow = recoveryParams.get('type') === 'recovery'
  const [token, setToken] = useState(() => {
    const initial = recoveryFlow ? recoveryParams.get('access_token') : null
    const refresh = recoveryFlow ? recoveryParams.get('refresh_token') : null
    if (initial) { localStorage.setItem('eduplan-token', initial); if (refresh) localStorage.setItem('eduplan-refresh-token', refresh); return initial }
    return localStorage.getItem('eduplan-token')
  })
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('eduplan-user') || 'null'))
  const [page, setPage] = useState('home')
  const [recovering, setRecovering] = useState(recoveryFlow)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState(null)
  const [refresh, setRefresh] = useState(0)

  const api = async (path, options = {}) => {
    if (!API) throw new Error('O serviço do EduPlan ainda não está configurado. Tente novamente mais tarde.')
    let requestToken = token
    const headers = new Headers(options.headers || {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    let response = await fetch(`${API}${path}`, { ...options, headers })
    if (response.status === 401 && requestToken && path !== '/auth/refresh' && path !== '/auth/logout') {
      const refreshToken = localStorage.getItem('eduplan-refresh-token')
      if (refreshToken) {
        const refreshResponse = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }) })
        if (refreshResponse.ok) {
          const refreshed = await refreshResponse.json()
          saveSession(refreshed)
          requestToken = refreshed.session.access_token
          headers.set('Authorization', `Bearer ${requestToken}`)
          response = await fetch(`${API}${path}`, { ...options, headers })
        }
      }
      if (response.status === 401) { logout(); throw new Error('Sua sessão expirou. Entre novamente.') }
    }
    if (!response.ok) {
      let detail = 'Ocorreu um erro. Tente novamente.'
      try { const data = await response.json(); detail = data.detail || data.message || detail } catch {}
      throw new Error(detail)
    }
    return response.status === 204 ? null : response.json()
  }

  useEffect(() => {
    if (!token) return
    api('/auth/me').then(async (identity) => {
      const profile = await api('/profile').catch(() => ({}))
      const merged = { ...user, ...identity, ...profile }
      setUser(merged)
      localStorage.setItem('eduplan-user', JSON.stringify(merged))
    }).catch(() => {})
  }, [token])

  function saveSession(data) {
    if (!data.session?.access_token) throw new Error('Confirme seu e-mail para ativar a conta e entrar.')
    localStorage.setItem('eduplan-token', data.session.access_token)
    localStorage.setItem('eduplan-refresh-token', data.session.refresh_token || '')
    localStorage.setItem('eduplan-user', JSON.stringify(data.user))
    setToken(data.session.access_token); setUser(data.user)
  }
  function logout() {
    if (token) fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: localStorage.getItem('eduplan-refresh-token') || '' }) }).catch(() => {})
    localStorage.removeItem('eduplan-token'); localStorage.removeItem('eduplan-refresh-token'); localStorage.removeItem('eduplan-user')
    setToken(null); setUser(null); setPage('home')
  }
  function toast(message, type = 'success') { setNotice({ message, type }); window.setTimeout(() => setNotice(null), 4500) }

  if (recovering) return <Auth api={api} onSession={saveSession} toast={toast} initialMode="reset" onPasswordUpdated={() => { logout(); setRecovering(false); history.replaceState(null, '', window.location.pathname) }} />
  if (!token) return <Auth api={api} onSession={saveSession} toast={toast} />
  const PageIcon = nav.find((item) => item.id === page)?.icon || Home
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><BookOpen size={21} /></div><div><strong>EduPlan</strong><span>Apoio pedagógico</span></div><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={20}/></button></div>
      <div className="nav-caption">ESPAÇO DO PROFESSOR</div>
      <nav>{nav.map(({ id, name, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileMenu(false) }}><Icon size={18}/><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}><Settings size={18}/><span>Meu perfil</span></button><div className="user-mini"><div className="avatar">{(user?.email || 'P').slice(0,1).toUpperCase()}</div><div className="user-info"><strong>{user?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Professor(a)'}</strong><small>{user?.email || ''}</small></div><button className="icon-button" title="Sair" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    {mobileMenu && <button aria-label="Fechar menu" className="scrim" onClick={() => setMobileMenu(false)} />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21}/></button><div className="breadcrumbs">EduPlan <span>/</span> <strong><PageIcon size={15}/>{nav.find((item) => item.id === page)?.name || 'Meu perfil'}</strong></div><div className="topbar-right"><span className="status-dot"/> Ambiente seguro</div></header>
      <div className="page-content">{page === 'home' && <Dashboard api={api} setPage={setPage} refresh={refresh} user={user} />}{page === 'syllabi' && <Syllabi api={api} refresh={refresh} toast={toast} onChange={() => setRefresh((n) => n + 1)} />}{page === 'generate' && <Generator api={api} toast={toast} onCreated={(id) => { setRefresh((n) => n + 1); setPage('materials'); return id }} />}{page === 'materials' && <Materials api={api} refresh={refresh} toast={toast} onChange={() => setRefresh((n) => n + 1)} />}{page === 'profile' && <Profile api={api} user={user} toast={toast} onSaved={(profile) => { const merged = { ...user, ...profile }; setUser(merged); localStorage.setItem('eduplan-user', JSON.stringify(merged)) }} />}</div>
    </main>
    {notice && <div className={`toast ${notice.type}`} role="status">{notice.message}</div>}
  </div>
}

function Auth({ api, onSession, toast, initialMode = 'login', onPasswordUpdated }) {
  const [mode, setMode] = useState(initialMode); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget); const email = form.get('email'); const password = form.get('password')
    try {
      if (mode === 'reset') { await api('/auth/update-password', { method: 'POST', body: JSON.stringify({ password }) }); toast('Senha atualizada. Entre com sua nova senha.'); onPasswordUpdated?.() }
      else if (mode === 'forgot') { await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(email) }); toast('Se o e-mail estiver cadastrado, você receberá instruções.'); setMode('login') }
      else { const result = await api(`/auth/${mode === 'signup' ? 'signup' : 'login'}`, { method: 'POST', body: JSON.stringify({ email, password, full_name: form.get('full_name') || '' }) }); if (mode === 'signup' && !result.session) { toast('Cadastro realizado. Confira seu e-mail para confirmar a conta.'); setMode('login') } else onSession(result) }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="auth-layout"><section className="auth-aside"><div className="auth-brand"><div className="brand-mark"><BookOpen size={22}/></div><strong>EduPlan</strong></div><div className="auth-message"><div className="eyebrow">TECNOLOGIA A SERVIÇO DA EDUCAÇÃO</div><h1>Mais tempo para o que importa: <em>ensinar.</em></h1><p>Organize ementas, planeje suas aulas e crie materiais pedagógicos com apoio inteligente.</p><div className="auth-proof"><span><BookOpen size={16}/> Ementas organizadas</span><span><Sparkles size={16}/> Materiais alinhados ao currículo</span></div></div><div className="auth-footer">EduPlan · Apoio ao trabalho docente</div></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="mobile-auth-brand"><div className="brand-mark"><BookOpen size={21}/></div><strong>EduPlan</strong></div><div className="eyebrow">ÁREA DO PROFESSOR</div><h2>{mode === 'login' ? 'Boas-vindas' : mode === 'signup' ? 'Crie sua conta' : mode === 'reset' ? 'Escolha uma nova senha' : 'Recuperar senha'}</h2><p className="muted">{mode === 'login' ? 'Entre para continuar seu planejamento.' : mode === 'signup' ? 'Cadastre-se para começar a usar o EduPlan.' : mode === 'reset' ? 'Defina uma senha segura para sua conta.' : 'Enviaremos as instruções para seu e-mail.'}</p>{mode === 'signup' && <label>Nome completo<input name="full_name" type="text" placeholder="Como podemos chamar você?" autoComplete="name" maxLength="160" required /></label>}{mode !== 'reset' && <label>E-mail<input name="email" type="email" placeholder="voce@escola.edu.br" autoComplete="email" required /></label>}{mode !== 'forgot' && <label>{mode === 'reset' ? 'Nova senha' : 'Senha'}<input name="password" type="password" placeholder="Mínimo de 8 caracteres" minLength="8" autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'} required /></label>}{error && <div className="inline-error" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Atualizar senha' : 'Enviar instruções'}</button><div className="auth-links">{mode === 'login' ? <><button type="button" className="text-button" onClick={() => setMode('forgot')}>Esqueci minha senha</button><span>Não tem uma conta? <button type="button" className="text-button" onClick={() => setMode('signup')}>Cadastre-se</button></span></> : mode !== 'reset' ? <button type="button" className="text-button" onClick={() => setMode('login')}>Voltar para o login</button> : null}</div></form></section></div>
}

function Dashboard({ api, setPage, refresh, user }) {
  const [data, setData] = useState(null); const [error, setError] = useState('')
  useEffect(() => { api('/dashboard').then(setData).catch((e) => setError(e.message)) }, [refresh])
  return <><div className="welcome-row"><div><div className="eyebrow">PAINEL DO PROFESSOR</div><h1>Olá, {(user?.full_name || user?.user_metadata?.full_name || '').split(' ')[0] || 'professor(a)'}.</h1><p className="muted">Organize seus materiais e prepare sua próxima aula.</p></div><button className="button primary" onClick={() => setPage('generate')}><Sparkles size={16}/> Gerar material</button></div>{error ? <div className="notice error">{error}</div> : !data ? <div className="loading-row">Carregando seus dados…</div> : <><div className="stats-grid"><Stat label="Ementas cadastradas" value={data.syllabi_count} note="Sua biblioteca curricular" icon={BookOpen}/><Stat label="Materiais produzidos" value={data.materials_count} note="Conteúdos salvos por você" icon={FileText}/></div><div className="section-head"><div><h2>Comece por aqui</h2><p className="muted">Atalhos para o seu planejamento.</p></div></div><div className="quick-grid"><button className="quick-card" onClick={() => setPage('syllabi')}><span className="quick-icon"><FilePlus2 size={19}/></span><span><strong>Cadastrar ementa</strong><small>Envie um PDF ou DOCX para organizar</small></span><span className="arrow">→</span></button><button className="quick-card" onClick={() => setPage('generate')}><span className="quick-icon"><Sparkles size={19}/></span><span><strong>Criar material pedagógico</strong><small>Planeje aula, atividade ou avaliação</small></span><span className="arrow">→</span></button></div><div className="section-head recent-head"><div><h2>Materiais recentes</h2><p className="muted">Seus últimos conteúdos produzidos.</p></div><button className="text-button" onClick={() => setPage('materials')}>Ver todos →</button></div><Materials api={api} refresh={refresh} compact toast={() => {}} onChange={() => {}} /></>}</>
}
function Stat({ label, value, note, icon: Icon }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={18}/></div><strong className="stat-value">{value}</strong><small>{note}</small></div> }

function Syllabi({ api, refresh, toast, onChange }) {
  const [items, setItems] = useState(null); const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [preview, setPreview] = useState(null)
  async function load() { try { const q = new URLSearchParams(); if (search) q.set('search', search); setItems(await api(`/syllabi?${q}`)); setError('') } catch(e) { setError(e.message) } }
  useEffect(() => { const timer = setTimeout(load, 220); return () => clearTimeout(timer) }, [search, refresh])
  async function upload(event) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await api('/syllabi', { method: 'POST', body: form }); event.currentTarget.reset(); toast('Ementa cadastrada.'); onChange() } catch(e) { setError(e.message) } finally { setBusy(false) } }
  async function remove(item) { if (!confirm(`Excluir a ementa “${item.file_name}”?`)) return; try { await api(`/syllabi/${item.id}`, { method: 'DELETE' }); toast('Ementa excluída.'); onChange() } catch(e) { toast(e.message, 'error') } }
  return <><div className="welcome-row"><div><div className="eyebrow">BIBLIOTECA CURRICULAR</div><h1>Minhas ementas</h1><p className="muted">Mantenha seus documentos organizados por disciplina e período.</p></div></div><section className="panel upload-panel"><div><h2>Adicionar ementa</h2><p className="muted">PDF ou DOCX · até 15 MB. O documento precisa ter texto legível.</p></div><form onSubmit={upload} className="syllabus-form"><label>Disciplina<input name="subject" placeholder="Ex.: Ciências" required maxLength="120"/></label><label>Nível de ensino<select name="education_level" required defaultValue=""><option value="" disabled>Selecione</option><option>Educação Infantil</option><option>Ensino Fundamental</option><option>Ensino Médio</option><option>EJA</option></select></label><label>Ano/série<input name="school_year" placeholder="Ex.: 6º ano" required maxLength="60"/></label><label>Ano letivo<input name="academic_year" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required/></label><label>Semestre<select name="semester" defaultValue="1"><option value="1">1º semestre</option><option value="2">2º semestre</option></select></label><label className="file-field">Arquivo (PDF ou DOCX)<input name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required/></label><button className="button primary" disabled={busy}><FilePlus2 size={16}/>{busy ? 'Analisando…' : 'Enviar ementa'}</button></form>{error && <div className="inline-error">{error}</div>}</section><div className="list-toolbar"><div><h2>Ementas cadastradas</h2><span className="muted">{items?.length ?? '…'} documentos</span></div><label className="searchbox"><Search size={16}/><input placeholder="Buscar disciplina ou arquivo" value={search} onChange={(e) => setSearch(e.target.value)}/></label></div>{!items ? <div className="loading-row">Carregando ementas…</div> : !items.length ? <Empty title="Nenhuma ementa por aqui" description="Envie sua primeira ementa para usar como referência ao gerar materiais."/> : <div className="data-list">{items.map((item) => <div className="data-row" key={item.id}><div className="file-icon"><FileText size={19}/></div><div className="data-main"><strong>{item.subject}</strong><small>{item.file_name} · {item.education_level}, {item.school_year}</small></div><span className="tag">{item.academic_year} · {item.semester}º sem.</span><button className="text-button" onClick={async () => { try { setPreview(await api(`/syllabi/${item.id}`)) } catch(e) { toast(e.message,'error') } }}>Ver</button><button className="text-button danger-text" onClick={() => remove(item)}>Excluir</button></div>)}</div>}{preview && <div className="modal-backdrop" onClick={() => setPreview(null)}><section className="panel preview-modal" onClick={(e) => e.stopPropagation()}><div className="editor-head"><div><div className="eyebrow">TEXTO EXTRAÍDO</div><h2>{preview.subject} · {preview.file_name}</h2><p className="muted">{preview.education_level}, {preview.school_year} · {preview.academic_year}</p></div><button className="icon-button" onClick={() => setPreview(null)} aria-label="Fechar"><X/></button></div><pre>{preview.extracted_text}</pre></section></div>}</>
}

function Generator({ api, toast, onCreated }) {
  const [syllabi, setSyllabi] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [type, setType] = useState('plano de aula')
  useEffect(() => { api('/syllabi').then(setSyllabi).catch((e) => setError(e.message)) }, [])
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); const data = Object.fromEntries(new FormData(e.currentTarget)); for (const key of ['duration_minutes','questions']) data[key] = data[key] ? Number(data[key]) : null; if (!data.syllabus_id) data.syllabus_id = null; try { await api('/materials/generate', { method: 'POST', body: JSON.stringify(data) }); toast('Material gerado e salvo. Revise antes de usar em aula.'); onCreated() } catch(err) { setError(err.message) } finally { setBusy(false) } }
  return <><div className="welcome-row"><div><div className="eyebrow">ASSISTENTE PEDAGÓGICO</div><h1>Gerar material</h1><p className="muted">A ementa selecionada orienta a geração. Você poderá revisar e editar o resultado.</p></div></div><div className="generator-layout"><form className="panel generator-form" onSubmit={submit}><label>Tipo de material<select name="kind" value={type} onChange={(e) => setType(e.target.value)}>{['plano de aula','atividade','avaliação','gabarito','adaptação','resumo'].map((kind) => <option key={kind}>{kind}</option>)}</select></label><label>Ementa de referência<select name="syllabus_id" defaultValue=""><option value="">Sem ementa específica</option>{syllabi.map((s) => <option value={s.id} key={s.id}>{s.subject} — {s.school_year} · {s.academic_year}</option>)}</select><small className="field-help">A IA vai indicar o que encontrou no documento e separar sugestões complementares.</small></label><div className="form-grid"><label>Disciplina<input name="subject" required maxLength="120" placeholder="Ex.: História"/></label><label>Ano/série<input name="grade" maxLength="80" placeholder="Ex.: 7º ano"/></label></div><label>Tema ou conteúdo<input name="topic" required minLength="3" maxLength="500" placeholder="Ex.: Ciclo da água"/></label><label>Objetivo de aprendizagem<textarea name="objective" maxLength="1000" rows="2" placeholder="O que os estudantes deverão aprender?"/></label>{type === 'plano de aula' && <label>Duração da aula (minutos)<input name="duration_minutes" type="number" min="5" max="300" placeholder="50"/></label>}{type === 'avaliação' && <><div className="form-grid"><label>Quantidade de questões<input name="questions" type="number" min="1" max="50" placeholder="10"/></label><label>Dificuldade<select name="difficulty"><option value="">Não definida</option><option>Fácil</option><option>Intermediária</option><option>Avançada</option><option>Variada</option></select></label></div><label className="checkbox-field"><input name="include_answer_key" type="checkbox" value="true"/>Incluir gabarito e explicações</label></>}{type === 'adaptação' && <label>Necessidade de aprendizagem<textarea name="instructions" maxLength="2000" rows="3" placeholder="Informe necessidades relevantes sem incluir dados pessoais identificáveis."/></label>}{!['adaptação'].includes(type) && <label>Instruções complementares<textarea name="instructions" maxLength="2000" rows="3" placeholder="Preferências de formato ou contexto adicional"/></label>}{error && <div className="inline-error" role="alert">{error}</div>}<div className="form-actions"><span className="muted small-note"><Sparkles size={15}/> A IA pode cometer erros. Revise o conteúdo antes de utilizar.</span><button className="button primary" disabled={busy}><Sparkles size={16}/>{busy ? 'Gerando material…' : 'Gerar material'}</button></div></form><aside className="side-note"><div className="quick-icon"><BookOpen size={19}/></div><h3>Como a referência é usada</h3><p>O assistente considera a ementa selecionada como fonte principal. Quando sugerir algo além do documento, deverá sinalizar essa diferença.</p><p>Revise o material e adapte-o à realidade da sua turma.</p><button className="text-button" onClick={() => onCreated()}>Ver meus materiais →</button></aside></div></>
}

function Materials({ api, refresh, toast, onChange, compact = false }) {
  const [items, setItems] = useState(null); const [search, setSearch] = useState(''); const [kind, setKind] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [editing, setEditing] = useState(null); const [error, setError] = useState('')
  async function load() { try { const q = new URLSearchParams(); if (search) q.set('search', search); if (kind) q.set('kind', kind); if (start) q.set('start', `${start}T00:00:00`); if (end) q.set('end', `${end}T23:59:59`); if (compact) q.set('limit', '5'); setItems(await api(`/materials?${q}`)); setError('') } catch(e) { setError(e.message) } }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer) }, [refresh, search, kind, start, end, compact])
  async function open(item) { try { setEditing(await api(`/materials/${item.id}`)) } catch(e) { toast(e.message, 'error') } }
  async function remove(item) { if (!confirm(`Excluir “${item.title}”?`)) return; try { await api(`/materials/${item.id}`, { method: 'DELETE' }); toast('Material excluído.'); onChange() } catch(e) { toast(e.message,'error') } }
  async function save(e) { e.preventDefault(); try { await api(`/materials/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ title: editing.title, content: editing.content }) }); toast('Alterações salvas.'); setEditing(null); onChange() } catch(err) { toast(err.message,'error') } }
  async function download(item, format) { try { const response = await fetch(`${API}/materials/${item.id}/export/${format}`, { headers: { Authorization: `Bearer ${localStorage.getItem('eduplan-token')}` } }); if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Falha ao exportar.') } const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `eduplan-${item.id}.${format}`; a.click(); URL.revokeObjectURL(url) } catch(e) { toast(e.message,'error') } }
  if (editing) return <div className="panel editor-panel"><form onSubmit={save}><div className="editor-head"><div><div className="eyebrow">EDITAR MATERIAL</div><h2>Revise e salve suas alterações</h2><p className="muted">{editing.syllabus ? `Ementa usada: ${editing.syllabus.subject} · ${editing.syllabus.school_year} · ${editing.syllabus.academic_year}` : 'Material gerado sem ementa vinculada.'}</p></div><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Fechar editor"><X/></button></div><label>Título<input value={editing.title} onChange={(e) => setEditing({...editing,title:e.target.value})} required maxLength="200"/></label><label>Conteúdo<textarea className="editor-content" value={editing.content} onChange={(e) => setEditing({...editing,content:e.target.value})} required maxLength="100000"/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary">Salvar alterações</button></div></form></div>
  return <>{!compact && <div className="welcome-row"><div><div className="eyebrow">SUA BIBLIOTECA</div><h1>Meus materiais</h1><p className="muted">Consulte, edite e exporte o conteúdo que você já criou.</p></div></div>}{!compact && <div className="list-toolbar"><div><h2>Materiais salvos</h2><span className="muted">{items?.length ?? '…'} materiais</span></div><label className="searchbox"><Search size={16}/><input placeholder="Buscar título ou disciplina" value={search} onChange={(e) => setSearch(e.target.value)}/></label><select className="kind-filter" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Todos os tipos</option>{['plano de aula','atividade','avaliação','gabarito','adaptação','resumo'].map(k=><option key={k}>{k}</option>)}</select><input className="date-filter" aria-label="Criados a partir de" type="date" value={start} onChange={e=>setStart(e.target.value)}/><input className="date-filter" aria-label="Criados até" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>}{error ? <div className="notice error">{error}</div> : !items ? <div className="loading-row">Carregando materiais…</div> : !items.length ? <Empty title="Nenhum material salvo" description="Gere seu primeiro material pedagógico para encontrá-lo aqui."/> : <div className="data-list material-list">{items.map((item) => <div className="material-row" key={item.id}><div className="file-icon"><FileText size={19}/></div><button className="material-summary" onClick={() => open(item)}><strong>{item.title}</strong><small>{item.subject} · {item.kind} · {new Date(item.updated_at || item.created_at).toLocaleDateString('pt-BR')}</small></button><div className="row-actions"><button className="text-button" onClick={() => open(item)}>Editar</button><button className="text-button" onClick={() => download(item,'pdf')}>PDF</button><button className="text-button" onClick={() => download(item,'docx')}>Word</button><button className="text-button danger-text" onClick={() => remove(item)}>Excluir</button></div></div>)}</div>}</>
}

function Profile({ api, user, toast, onSaved }) {
 const [profile, setProfile] = useState(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('')
 useEffect(()=>{ api('/profile').then(setProfile).catch(e=>setError(e.message)) },[])
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const updated=await api('/profile',{method:'PATCH',body:JSON.stringify(profile)});setProfile(updated);onSaved?.(updated);toast('Perfil atualizado.')}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <><div className="welcome-row"><div><div className="eyebrow">CONFIGURAÇÕES DA CONTA</div><h1>Meu perfil</h1><p className="muted">Seus dados de professor.</p></div></div>{error&&<div className="notice error">{error}</div>}{profile && <form className="panel profile-form" onSubmit={save}><label>Nome completo<input value={profile.full_name} maxLength="160" onChange={e=>setProfile({...profile,full_name:e.target.value})}/></label><label>E-mail<input value={user?.email || ''} disabled/></label><label>Escola (opcional)<input value={profile.school_name || ''} maxLength="160" onChange={e=>setProfile({...profile,school_name:e.target.value})}/></label>{error&&<div className="inline-error">{error}</div>}<button className="button primary" disabled={busy}>{busy?'Salvando…':'Salvar perfil'}</button></form>}</>
}
function Empty({ title, description }) { return <div className="empty-state"><div className="empty-icon"><FileText size={21}/></div><strong>{title}</strong><p>{description}</p></div> }

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
