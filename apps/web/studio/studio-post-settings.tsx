"use client";
import {useId,type ChangeEvent} from 'react';
import type {PostContext,PostFormat} from '../lib/studio-domain';
import {POST_FORMAT_OPTIONS,clampFrameCount,postFormatOption} from '../lib/studio-post-formats';

export type PostSettingsPatch = Partial<PostContext & {format:PostFormat;targetFrameCount:number}>;

export default function PostSettings({
  value,
  format = 'single',
  targetFrameCount,
  legacyAction,
  onChange,
  preparing = false,
}: {
  value: PostContext;
  format?: PostFormat;
  targetFrameCount?: number;
  legacyAction: string;
  onChange: (patch: PostSettingsPatch) => void;
  preparing?: boolean;
}) {
  const id = useId();
  const activeOption = postFormatOption(format);
  const frameCount = clampFrameCount(format, targetFrameCount);
  return (
    <section className="guided-post-context">
      <p>{preparing ? 'Estas informações valem apenas para este post.' : 'Vale só para os próximos pedidos deste post. Tema, público geral e marca ficam no projeto. As versões existentes são preservadas.'}</p>
      <fieldset className="studio-format-picker">
        <legend>Formato do post (proporção Instagram)</legend>
        <div className="studio-format-grid">
          {POST_FORMAT_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className="studio-format-option"
              aria-pressed={format === option.id}
              data-format={option.id}
              onClick={() => onChange({ format: option.id, targetFrameCount: option.defaultFrames })}
            >
              <span className={`studio-format-glyph is-${option.id}`} aria-hidden="true" />
              <strong>{option.label}</strong>
              <span className="studio-format-ratio">{option.ratioLabel}</span>
              <span className="studio-format-hint">{option.shortHint}</span>
            </button>
          ))}
        </div>
        {activeOption.multiFrame && (
          <div className="studio-format-count">
            <label htmlFor={`${id}-frames`}>
              {format === 'carousel' ? 'Quantas lâminas no carrossel?' : 'Quantas fotos na coleção?'}
              <input
                id={`${id}-frames`}
                type="number"
                min={activeOption.minFrames}
                max={activeOption.maxFrames}
                value={frameCount}
                onChange={event => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) onChange({ format, targetFrameCount: clampFrameCount(format, Math.trunc(parsed)) });
                }}
              />
            </label>
            <span className="studio-hint">Entre {activeOption.minFrames} e {activeOption.maxFrames}. Você pode ajustar depois no estúdio ou na conversa.</span>
          </div>
        )}
      </fieldset>
      {([['objective','Objetivo deste post','Ex.: live gratuita, venda ou autoridade',1],['message','O que este post deve comunicar?','Conte a ideia principal e um detalhe que a torne sua.',4],['action','Chamada para ação (opcional)','Ex.: inscreva-se na live.',2]] as const).map(([field,label,placeholder,rows]) => {
        const props = {id:`${id}-${field}`,maxLength:4000,value:value[field],placeholder,onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange({[field]:event.target.value})};
        return <div key={field}><label htmlFor={props.id}>{label}</label>{field==='objective'?<input {...props}/>:<textarea {...props} rows={rows}/>}</div>;
      })}
      {legacyAction && <details><summary>Ação anterior</summary><p>{legacyAction}</p><button type="button" className="studio-button-secondary" onClick={()=>onChange({action:legacyAction})}>Usar neste post</button></details>}
    </section>
  );
}
