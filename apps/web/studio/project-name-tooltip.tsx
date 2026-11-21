"use client";

import {useCallback, useId, useRef, type PointerEvent, type ReactNode} from "react";

/** O atributo title só aparece no hover. O foco do teclado e o toque precisam de um tooltip visível. */
function projectNameTruncated(anchor: HTMLElement, title: string) {
  const label = anchor.querySelector("strong") ?? anchor;
  if (label.getClientRects().length === 0) return true;
  const shown = label.innerText.replace(/\s+/g, " ").trim();
  if (shown !== title) return true;
  const range = document.createRange();
  range.selectNodeContents(label);
  const text = range.getBoundingClientRect();
  const box = label.getBoundingClientRect();
  return text.width > box.width + 1 || text.height > box.height + 1;
}

function placeProjectNameTooltip(anchor: HTMLElement, tip: HTMLElement) {
  const margin = 8;
  const viewWidth = document.documentElement.clientWidth;
  const viewHeight = document.documentElement.clientHeight;
  const maxWidth = Math.max(160, Math.min(420, viewWidth - margin * 2));
  tip.style.maxWidth = `${maxWidth}px`;
  tip.style.left = "0px";
  tip.style.top = "0px";
  const anchorBox = anchor.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  let left = anchorBox.left;
  let top = anchorBox.bottom + 6;
  if (left + tipBox.width > viewWidth - margin) left = viewWidth - margin - tipBox.width;
  if (left < margin) left = margin;
  if (top + tipBox.height > viewHeight - margin) top = Math.max(margin, anchorBox.top - tipBox.height - 6);
  if (top < margin) top = margin;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

export function useProjectNameDisclosure(title: string) {
  const describedBy = useId();
  const tipRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    anchorRef.current = node;
    // Trocar o botão focado, como ao renomear, não dispara blur. O popover manual fecha quando a âncora sai.
    if (node) return;
    const tip = tipRef.current;
    if (tip?.matches(":popover-open")) tip.hidePopover();
  }, []);

  function hide() {
    const tip = tipRef.current;
    if (tip?.matches(":popover-open")) tip.hidePopover();
  }

  function open() {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip || !anchor.isConnected || !title.trim()) return;
    if (!projectNameTruncated(anchor, title)) {
      hide();
      return;
    }
    if (!tip.matches(":popover-open")) tip.showPopover();
    placeProjectNameTooltip(anchor, tip);
  }

  function close(event?: {pointerType?: string}) {
    if (event?.pointerType === "touch") return;
    if (anchorRef.current && document.activeElement === anchorRef.current) return;
    hide();
  }

  function handlers<T extends HTMLElement>() {
    return {
      ref: ref as (node: T | null) => void,
      "aria-describedby": describedBy,
      onFocus: () => { open(); },
      onBlur: () => { hide(); },
      onPointerDown: () => { open(); },
      onPointerLeave: (event: PointerEvent<T>) => { close(event); },
    };
  }

  const tooltip: ReactNode = (
    <span ref={tipRef} id={describedBy} popover="manual" role="tooltip" className="studio-name-tooltip">
      {title}
    </span>
  );

  return {handlers, tooltip};
}
