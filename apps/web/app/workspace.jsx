"use client";

import { useEffect, useState } from "react";

export default function Workspace({ loginAvailable }) {
  const [objective, setObjective] = useState("");
  const [authState, setAuthState] = useState('checking');
  const [loginError, setLoginError] = useState(false);
  useEffect(() => {
    try { setObjective(sessionStorage.getItem('compor-objective') || ''); } catch { /* Storage may be unavailable. */ }
    setLoginError(new URLSearchParams(window.location.search).get('login') === 'erro');
    if (!loginAvailable) { setAuthState('unavailable'); return; }
    const controller = new AbortController();
    fetch('/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : { state: 'unavailable' })
      .then(data => setAuthState(data.state))
      .catch(error => { if (error.name !== 'AbortError') setAuthState('unavailable'); });
    return () => controller.abort();
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
            onChange={(event) => {
              setObjective(event.target.value);
              try { sessionStorage.setItem('compor-objective', event.target.value); } catch { /* Keep editing in memory. */ }
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
          {authState !== 'connected' && <form action="/auth/sign-in" method="post" className="login">
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
