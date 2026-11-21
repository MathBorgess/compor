"use client";

import {useCallback, useEffect, useRef, type PointerEvent, type ReactNode} from "react";

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

function hideTip(tip: HTMLElement | null) {
  if (tip?.matches(":popover-open")) tip.hidePopover();
}

const longPressMs = 500;

export function useProjectNameDisclosure(title: string, {longPressOnTouch = false}: {longPressOnTouch?: boolean} = {}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef(title);
  const touchGesture = useRef(false);
  const wasOpenAtPointerDown = useRef(false);
  const longPressOnTouchRef = useRef(longPressOnTouch);
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  titleRef.current = title;
  longPressOnTouchRef.current = longPressOnTouch;
  const ref = useCallback((node: HTMLElement | null) => {
    anchorRef.current = node;
    // Trocar o botão focado, como ao renomear, não dispara blur. O popover manual fecha quando a âncora sai.
    if (node) return;
    hideTip(tipRef.current);
  }, []);

  useEffect(() => {
    function outside(event: Event) {
      const tip = tipRef.current;
      const anchor = anchorRef.current;
      if (!tip?.matches(":popover-open") || !anchor) return;
      const target = event.target;
      if (target instanceof Node && (anchor.contains(target) || tip.contains(target))) return;
      hideTip(tip);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const tip = tipRef.current;
      const anchor = anchorRef.current;
      if (!tip?.matches(":popover-open") || !anchor) return;
      if (!touchGesture.current && !anchor.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      hideTip(tip);
    }
    function onScroll() {
      hideTip(tipRef.current);
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  function hide() {
    hideTip(tipRef.current);
  }

  function open() {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    const current = titleRef.current;
    if (!anchor || !tip || !anchor.isConnected || !current.trim()) return;
    if (!projectNameTruncated(anchor, current)) {
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

  /** No toque, o primeiro gesto só revela o nome cortado. O seguinte ativa o controle. */
  function holdActivation(clickCount: number) {
    if (clickCount === 0 || !touchGesture.current) return false;
    const anchor = anchorRef.current;
    if (!anchor || !projectNameTruncated(anchor, titleRef.current)) return false;
    const hold = !wasOpenAtPointerDown.current;
    if (!hold) touchGesture.current = false;
    return hold;
  }

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  /** O toque longo do trilho não troca de projeto. */
  function consumeLongPress() {
    const suppress = suppressClick.current;
    suppressClick.current = false;
    return suppress;
  }

  function handlers<T extends HTMLElement>() {
    return {
      ref: ref as (node: T | null) => void,
      onFocus: () => {
        if (longPressOnTouchRef.current && window.matchMedia("(pointer: coarse)").matches) return;
        open();
      },
      onBlur: () => { hide(); },
      onPointerDown: (event: PointerEvent<T>) => {
        touchGesture.current = event.pointerType === "touch";
        wasOpenAtPointerDown.current = tipRef.current?.matches(":popover-open") ?? false;
        if (longPressOnTouchRef.current && event.pointerType === "touch") {
          suppressClick.current = false;
          clearLongPress();
          longPressTimer.current = window.setTimeout(() => {
            longPressTimer.current = null;
            suppressClick.current = true;
            open();
          }, longPressMs);
          return;
        }
        open();
      },
      onPointerUp: () => { clearLongPress(); },
      onPointerCancel: () => { clearLongPress(); },
      onPointerLeave: (event: PointerEvent<T>) => {
        if (event.pointerType === "touch") {
          clearLongPress();
          return;
        }
        close(event);
      },
      onContextMenu: (event: {preventDefault: () => void}) => {
        if (longPressOnTouchRef.current) event.preventDefault();
      },
    };
  }

  const tooltip: ReactNode = (
    <span ref={tipRef} popover="manual" role="tooltip" className="studio-name-tooltip">
      {title}
    </span>
  );

  return {handlers, holdActivation, consumeLongPress, tooltip};
}
