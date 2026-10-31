import { WAITLIST_SUBMIT_TARGET } from "../data/site";
import { track } from "./analytics";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldValue(form: HTMLFormElement, name: string): string {
  const data = new FormData(form);
  return String(data.get(name) ?? "").trim();
}

function setError(inputId: string, message: string | null): void {
  const input = document.getElementById(inputId);
  const error = document.getElementById(`${inputId}-error`);
  if (!(error instanceof HTMLElement)) return;

  if (message) {
    error.hidden = false;
    error.textContent = message;
    input?.setAttribute("aria-invalid", "true");
    return;
  }

  error.hidden = true;
  error.textContent = "";
  input?.removeAttribute("aria-invalid");
}

function mailtoUrl(nome: string, email: string, oferta: string): string {
  const subject = "Lista de teste do Compor";
  const body = [
    `Nome: ${nome}`,
    `E-mail: ${email}`,
    `O que você vende: ${oferta}`,
    "",
    "Quero entrar na lista para testar o Compor.",
  ].join("\n");

  const target = WAITLIST_SUBMIT_TARGET.startsWith("mailto:")
    ? WAITLIST_SUBMIT_TARGET
    : `mailto:${WAITLIST_SUBMIT_TARGET}`;

  return `${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function setupWaitlist(): void {
  const form = document.querySelector<HTMLFormElement>("#waitlist-form");
  if (!form) return;

  const status = document.getElementById("waitlist-status");

  form.addEventListener("submit", (event) => {
    const nome = fieldValue(form, "nome");
    const email = fieldValue(form, "email");
    const oferta = fieldValue(form, "oferta");

    const nomeError = nome ? null : "Informe seu nome.";
    const emailError = EMAIL_PATTERN.test(email) ? null : "Informe um e-mail válido.";
    const ofertaError = oferta ? null : "Conte o que você vende.";

    setError("nome", nomeError);
    setError("email", emailError);
    setError("oferta", ofertaError);

    if (nomeError || emailError || ofertaError) {
      event.preventDefault();
      const firstInvalid = form.querySelector<HTMLElement>("[aria-invalid='true']");
      firstInvalid?.focus();
      return;
    }

    track({ name: "cta_clicked", position: "final" });
    track({ name: "waitlist_submitted" });

    if (!WAITLIST_SUBMIT_TARGET.startsWith("mailto:")) {
      if (status) {
        status.textContent = "O envio segue para o endereço configurado. Nada mais é feito nesta página.";
      }
      return;
    }

    event.preventDefault();
    if (status) {
      status.hidden = false;
      status.textContent =
        "Nada foi gravado nesta página. O seu programa de e-mail deve abrir com a mensagem pronta.";
      status.focus();
    }
    window.location.href = mailtoUrl(nome, email, oferta);
  });
}
