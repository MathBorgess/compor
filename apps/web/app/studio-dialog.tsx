"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function StudioDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
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
      className="studio-modal"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close.current?.();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
