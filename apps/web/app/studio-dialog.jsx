"use client";
import { useEffect, useRef } from "react";
export default function StudioDialog({ title, children, onClose }) {
  const dialog = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current,
      prior = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      prior?.focus?.();
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
