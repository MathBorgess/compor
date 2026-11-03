"use client";

import { useState } from "react";

export default function Home() {
  const [objective, setObjective] = useState("");

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">compor<span aria-hidden="true">.</span></span>
        <span className="status">Ainda não conectado</span>
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
            onChange={(event) => setObjective(event.target.value)}
            rows={6}
          />
          <p className="hint" role="status">
            O texto fica nesta aba enquanto você escreve. Ele ainda não é salvo.
          </p>
          <div className="actions">
            <button type="button" disabled>Continuar</button>
            <span>Conexão necessária para continuar</span>
          </div>
        </section>
      </div>
      <footer>Você no controle de cada escolha.</footer>
    </main>
  );
}
