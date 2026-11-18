"use client";

import type { StudioState } from "../lib/studio-domain";

export default function BriefSummary({ state }: { state: StudioState }) {
  const items = [
    { label: "O que divulgar", value: state.brief.offer },
    { label: "Para quem", value: state.persona.audience },
    { label: "O que a pessoa deve fazer", value: state.brief.action },
    { label: "Direção criativa", value: state.brief.direction },
  ];
  const filled = items.filter((item) => item.value.trim());
  return (
    <section className="studio-brief-summary" aria-labelledby="brief-summary-title">
      <h2 id="brief-summary-title">O que estamos construindo</h2>
      <p className="studio-hint">Este resumo acompanha a conversa e pode mudar com suas escolhas.</p>
      {filled.length ? (
        <dl>{filled.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      ) : <p>Conte sua ideia na conversa. Os pontos importantes aparecem aqui.</p>}
    </section>
  );
}
