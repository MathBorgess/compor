import type { KeyboardEvent } from "react";

/** Enter submits the textarea's form through its onSubmit, the same path as the send button. */
export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  // Safari reports the Enter that confirms an accent or an IME candidate only as keyCode 229.
  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
  // Touch keyboards have no Shift+Enter, so Enter keeps the newline and the button sends.
  if (window.matchMedia("(pointer: coarse)").matches) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
