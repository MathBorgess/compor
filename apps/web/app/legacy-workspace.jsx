"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Projects from './projects';

export default function Workspace({ loginAvailable }) {
  const [objective, setObjective] = useState("");
  const [authState, setAuthState] = useState('checking');
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const openAIKey = useRef('');
  const openAIKeyInput = useRef(null);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const openAIKeyOwner = useRef(null);
  const clearOpenAIKey = () => {
    openAIKey.current = '';
    openAIKeyOwner.current = null;
    if (openAIKeyInput.current) openAIKeyInput.current.value = '';
    setHasOpenAIKey(false);
  };
  const draftKey = useRef(null);
  const memoryDrafts = useRef(new Map());
  const activeIdentity = useRef(null);
  const pendingKey = useRef(null);
  const [loginError, setLoginError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  useLayoutEffect(() => {
    if (authState === 'connected' && openAIKeyInput.current) openAIKeyInput.current.value = openAIKey.current;
  }, [authState, authenticatedUser]);
  useEffect(() => {
    const clearOnExit = () => clearOpenAIKey();
    window.addEventListener('pagehide', clearOnExit);
    return () => { window.removeEventListener('pagehide', clearOnExit); openAIKey.current = ''; openAIKeyOwner.current = null; if (openAIKeyInput.current) openAIKeyInput.current.value = ''; };
  }, []);
  useEffect(() => {
    setLoginError(new URLSearchParams(window.location.search).get('login') === 'erro');
    if (!loginAvailable) { clearOpenAIKey(); activeIdentity.current = 'offline'; setAuthState('offline'); return; }
    let controller;
    let generation = 0;
    const checkSession = () => {
      const currentGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      draftKey.current = null;
      activeIdentity.current = null;
      pendingKey.current = null;
      setHasPendingDraft(false);
      setObjective('');
      setAuthState('checking');
      fetch('/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : { state: 'unavailable' })
      .then(data => {
        if (currentGeneration !== generation) return;
        if (data.state === 'connected' && typeof data.userId === 'string' && data.userId) {
          if (openAIKeyOwner.current && openAIKeyOwner.current !== data.userId) clearOpenAIKey();
          setAuthenticatedUser(data.userId);
          const identity = `user:${data.userId}`;
          activeIdentity.current = identity;
          try {
            const key = `compor-objective:user:${data.userId}`;
            const seenAccount = sessionStorage.getItem('compor-has-authenticated') === '1';
            const claimSource = sessionStorage.getItem('compor-claim-pending');
            const claim = claimSource === 'anonymous' || (claimSource === 'guest' && !seenAccount);
            const sourceKey = claim ? `compor-objective:${claimSource}` : null;
            const existing = sessionStorage.getItem(key);
            const guest = sourceKey ? sessionStorage.getItem(sourceKey) : null;
            if (claim && existing === null && guest !== null) sessionStorage.setItem(key, guest);
            const pending = `compor-objective:pending:${data.userId}`;
            if (claim && existing !== null && guest !== null && existing !== guest) {
              const previous = sessionStorage.getItem(pending);
              if (previous !== null && previous !== guest) sessionStorage.setItem(`${pending}:archive:${crypto.randomUUID()}`, previous);
              sessionStorage.setItem(pending, guest);
            }
            sessionStorage.setItem('compor-has-authenticated', '1');
            if (claimSource === 'anonymous' && claim) sessionStorage.removeItem(sourceKey);
            sessionStorage.removeItem('compor-claim-pending');
            draftKey.current = key;
            pendingKey.current = pending;
            setHasPendingDraft(sessionStorage.getItem(pending) !== null);
            setObjective(memoryDrafts.current.get(identity) ?? existing ?? guest ?? '');
          } catch { draftKey.current = null; setObjective(memoryDrafts.current.get(identity) ?? ''); }
          setAuthState('connected');
        } else if (data.state === 'signed-out') {
          clearOpenAIKey();
          try {
            sessionStorage.removeItem('compor-claim-pending');
            const seenAccount = sessionStorage.getItem('compor-has-authenticated') === '1';
            draftKey.current = seenAccount ? 'compor-objective:anonymous' : 'compor-objective:guest';
            activeIdentity.current = seenAccount ? 'signed-out' : 'guest';
            setObjective(memoryDrafts.current.get(activeIdentity.current) ?? (draftKey.current ? sessionStorage.getItem(draftKey.current) || '' : ''));
          } catch { draftKey.current = null; activeIdentity.current = 'signed-out'; setObjective(memoryDrafts.current.get('signed-out') ?? ''); }
          setAuthState('signed-out');
        } else { clearOpenAIKey(); draftKey.current = null; setObjective(''); setAuthState('unavailable'); }
      })
      .catch(error => { if (currentGeneration === generation && error.name !== 'AbortError') { clearOpenAIKey(); setAuthState('unavailable'); } });
    };
    const checkVisible = () => { if (document.visibilityState === 'visible') checkSession(); };
    checkSession();
    window.addEventListener('focus', checkSession);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
      generation++;
      controller?.abort();
      window.removeEventListener('focus', checkSession);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, [loginAvailable]);

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">compor<span aria-hidden="true">.</span></span>
        <span className="status">{authState === 'connected' ? 'Conta conectada' : 'Ainda não conectado'}</span>
      </header>
      <div className="content">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">UM COMEÇO DE CADA VEZ</p>
          <h1 id="page-title">Toda boa ideia começa com um objetivo.</h1>
          <p className="lead">
            Conte o que você quer divulgar. Vamos construir a direção criativa a partir daí.
          </p>
        </section>
        <section className="workspace" aria-labelledby="objective-label">
          <div className="workspace-head">
            <div>
              <p className="eyebrow">SEU PONTO DE PARTIDA</p>
              <h2 id="objective-label">Seu objetivo</h2>
            </div>
          </div>
          <label className="label" htmlFor="objective">O que você quer divulgar?</label>
          <textarea
            id="objective"
            name="objective"
            placeholder="Uma aula, um produto, uma ideia..."
            value={objective}
            disabled={authState === 'checking' || authState === 'unavailable'}
            onChange={(event) => {
              setObjective(event.target.value);
              if (activeIdentity.current) memoryDrafts.current.set(activeIdentity.current, event.target.value);
              try { if (draftKey.current) sessionStorage.setItem(draftKey.current, event.target.value); setStorageError(false); } catch { /* Keep editing in memory. */ }
            }}
            rows={6}
          />
          <p className="hint" role="status">
            O texto fica nesta aba enquanto você escreve. Ele ainda não é salvo.
          </p>
          {authState === 'connected' && <div className="session-key">
            <label htmlFor="openai-key">Chave OpenAI</label>
            <input ref={openAIKeyInput} id="openai-key" type="password" autoComplete="off" spellCheck={false} maxLength={300} onChange={event => { openAIKey.current = event.target.value; openAIKeyOwner.current = authenticatedUser; setHasOpenAIKey(Boolean(event.target.value)); }} />
            <p className="hint">A chave fica apenas na memória desta aba e será removida ao sair ou trocar de conta. A geração ainda não está disponível até selecionar uma peça salva.</p>
            <button type="button" disabled={!hasOpenAIKey} onClick={clearOpenAIKey}>Remover chave</button>
          </div>}
          <div className="actions">
            <button type="button" disabled>Continuar</button>
            <span>Conexão necessária para continuar</span>
          </div>
          {authState === 'connected' && hasPendingDraft && <div className="login">
            <button type="button" onClick={() => {
              try {
                const pending = sessionStorage.getItem(pendingKey.current);
                if (pending === null || !draftKey.current) return;
                if (objective && objective !== pending) sessionStorage.setItem(`${draftKey.current}:archive:${crypto.randomUUID()}`, objective);
                sessionStorage.setItem(draftKey.current, pending);
                sessionStorage.removeItem(pendingKey.current);
                memoryDrafts.current.set(activeIdentity.current, pending);
                setObjective(pending);
                setHasPendingDraft(false);
                setStorageError(false);
              } catch { setStorageError(true); }
            }}>Recuperar rascunho anterior</button>
          </div>}
          {authState !== 'connected' && <form action="/auth/sign-in" method="post" className="login" onSubmit={(event) => {
            try {
              if (draftKey.current) {
                sessionStorage.setItem(draftKey.current, objective);
                sessionStorage.setItem('compor-claim-pending', draftKey.current === 'compor-objective:guest' ? 'guest' : 'anonymous');
              } else if (objective) throw new Error('storage indisponível');
            } catch {
              if (objective) { event.preventDefault(); setStorageError(true); }
            }
          }}>
            <button type="submit" disabled={!loginAvailable || authState === 'unavailable' || authState === 'checking'}>Entrar com Google</button>
            {(authState === 'unavailable' || authState === 'offline') && <p className="hint">Login temporariamente indisponível.</p>}
            {loginError && <p className="hint" role="alert">Não foi possível concluir o login. Tente novamente.</p>}
          </form>}
          {storageError && <p className="hint" role="alert">Não foi possível preservar seu rascunho. Copie o texto antes de continuar.</p>}
        </section>
      </div>
      {authState === 'connected' && <Projects key={authenticatedUser} userId={authenticatedUser} objective={objective} hasApiKey={hasOpenAIKey} getApiKey={() => openAIKeyOwner.current === authenticatedUser ? openAIKey.current : ''} />}
      <footer>Você no controle de cada escolha.</footer>
    </main>
  );
}
