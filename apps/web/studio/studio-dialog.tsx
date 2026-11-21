"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function StudioDialog({ title, children, onClose, className, closeLabel, closeDisabled = false }: { title: string; children: ReactNode; onClose: () => void; className?: string; closeLabel?: string; closeDisabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current,
      prior = document.activeElement;
    if (!element) return;
    element.showModal();
    return () => {
      element.close();
      if (prior instanceof HTMLElement) prior.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={className ? `studio-modal ${className}` : "studio-modal"}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) close.current?.();
      }}
    >
      {closeLabel && (
        <button type="button" className="studio-modal-close" disabled={closeDisabled} aria-label={closeLabel} title={closeLabel} onClick={() => close.current?.()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
