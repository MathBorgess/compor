"use client";

import { useEffect, useRef, useState } from "react";

export default function Workspace({ loginAvailable }) {
  const [objective, setObjective] = useState("");
  const [authState, setAuthState] = useState('checking');
  const draftKey = useRef(null);
  const [loginError, setLoginError] = useState(false);
  useEffect(() => {
    setLoginError(new URLSearchParams(window.location.search).get('login') === 'erro');
    if (!loginAvailable) { setAuthState('unavailable'); return; }
    let controller;
    const checkSession = () => {
      controller?.abort();
      controller = new AbortController();
      draftKey.current = null;
      setObjective('');
      setAuthState('checking');
      fetch('/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : { state: 'unavailable' })
      .then(data => {
        if (data.state === 'connected' && typeof data.userId === 'string' && data.userId) {
          try {
            const key = `compor-objective:user:${data.userId}`;
            const seenAccount = sessionStorage.getItem('compor-has-authenticated') === '1';
            const claim = !seenAccount && sessionStorage.getItem('compor-claim-pending') === '1';
            const existing = sessionStorage.getItem(key);
            const guest = claim ? sessionStorage.getItem('compor-objective:guest') : null;
            sessionStorage.setItem('compor-has-authenticated', '1');
            if (claim && existing === null && guest !== null) sessionStorage.setItem(key, guest);
            sessionStorage.removeItem('compor-objective:guest');
            sessionStorage.removeItem('compor-claim-pending');
            draftKey.current = key;
            setObjective(existing ?? guest ?? '');
          } catch { draftKey.current = null; setObjective(''); }
          setAuthState('connected');
        } else if (data.state === 'signed-out') {
          try {
            sessionStorage.removeItem('compor-claim-pending');
            const seenAccount = sessionStorage.getItem('compor-has-authenticated') === '1';
            draftKey.current = seenAccount ? null : 'compor-objective:guest';
            setObjective(draftKey.current ? sessionStorage.getItem(draftKey.current) || '' : '');
          } catch { draftKey.current = null; setObjective(''); }
          setAuthState('signed-out');
        } else { draftKey.current = null; setObjective(''); setAuthState('unavailable'); }
      })
      .catch(error => { if (error.name !== 'AbortError') setAuthState('unavailable'); });
    };
    const checkVisible = () => { if (document.visibilityState === 'visible') checkSession(); };
    checkSession();
    window.addEventListener('focus', checkSession);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
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
              try { if (draftKey.current) sessionStorage.setItem(draftKey.current, event.target.value); } catch { /* Keep editing in memory. */ }
            }}
            rows={6}
          />
          <p className="hint" role="status">
            O texto fica nesta aba enquanto você escreve. Ele ainda não é salvo.
          </p>
          <div className="actions">
            <button type="button" disabled>Continuar</button>
            <span>Conexão necessária para continuar</span>
          </div>
          {authState !== 'connected' && <form action="/auth/sign-in" method="post" className="login" onSubmit={() => {
            try { if (draftKey.current === 'compor-objective:guest') sessionStorage.setItem('compor-claim-pending', '1'); } catch { /* Login remains available. */ }
          }}>
            <button type="submit" disabled={!loginAvailable || authState === 'unavailable' || authState === 'checking'}>Entrar com Google</button>
            {authState === 'unavailable' && <p className="hint">Login temporariamente indisponível.</p>}
            {loginError && <p className="hint" role="alert">Não foi possível concluir o login. Tente novamente.</p>}
          </form>}
        </section>
      </div>
      <footer>Você no controle de cada escolha.</footer>
    </main>
  );
}
