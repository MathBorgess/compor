"use client";

import { useEffect, useRef, useState } from 'react';
import Pieces from './pieces';

export default function Projects({ userId, objective, hasApiKey, getApiKey }) {
  const [projects, setProjects] = useState([]);
  const [state, setState] = useState('loading');
  const [title, setTitle] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState(null);
  const sequence = useRef(0);
  async function refresh() {
    const current = ++sequence.current;
    setState('loading');
    try {
      const result = await fetch('/api/projects', { cache: 'no-store' });
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (!Array.isArray(data.projects)) throw new Error();
      if (current !== sequence.current) return;
      setProjects(data.projects);
      try { const prior = sessionStorage.getItem(`compor-selected-project:${userId}`); if (data.projects.some(project => project.id === prior)) setSelected(prior); } catch { /* Selection remains in memory. */ }
      setState('ready');
    } catch { if (current === sequence.current) setState('unavailable'); }
  }
  useEffect(() => { refresh(); return () => { sequence.current++; }; }, []);
  async function create(event) {
    event.preventDefault();
    if (state !== 'ready' || uncertain || !title.trim()) return;
    const current = sequence.current;
    setState('creating');
    try {
      const result = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (!data.project || typeof data.project.id !== 'string' || typeof data.project.title !== 'string') throw new Error();
      if (current !== sequence.current) return;
      setProjects(existing => [...existing, data.project]);
      setTitle('');
      setState('ready');
    } catch {
      if (current !== sequence.current) return;
      setUncertain(true);
      setState('unavailable');
    }
  }
  return <section className="workspace projects" aria-labelledby="projects-title">
    <h2 id="projects-title">Seus projetos</h2>
    {state === 'loading' && <p role="status">Carregando projetos…</p>}
    {state === 'unavailable' && <p role="alert">{uncertain ? 'A criação pode ter acontecido. Atualize a lista antes de tentar novamente.' : 'Não foi possível carregar os projetos.'}</p>}
    {state === 'unavailable' && <button type="button" onClick={refresh}>Atualizar lista</button>}
    {(state === 'ready' || state === 'creating') && <>
      {projects.length ? <ul>{projects.map(project => <li key={project.id}><span>{project.title}</span> <button type="button" onClick={() => { setSelected(project.id); try { sessionStorage.setItem(`compor-selected-project:${userId}`, project.id); } catch { /* Selection remains in memory. */ } }}>Abrir {project.title}</button></li>)}</ul> : <p>Você ainda não tem projetos.</p>}
      {uncertain && <p role="alert">A criação anterior ainda pode aparecer mais tarde. <button type="button" onClick={() => setUncertain(false)}>Entendi, criar outro</button></p>}
      <form onSubmit={create}>
        <label htmlFor="project-name">Nome do projeto</label>
        <input id="project-name" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} />
        <button type="submit" disabled={state === 'creating' || uncertain || !title.trim()}>{state === 'creating' ? 'Criando…' : 'Criar projeto'}</button>
      </form>
    </>}
    {selected && <Pieces key={`${userId}:${selected}`} projectId={selected} userId={userId} objective={objective} hasApiKey={hasApiKey} getApiKey={getApiKey} />}
  </section>;
}
