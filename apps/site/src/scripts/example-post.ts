import { EXAMPLE, exampleCaption } from "../data/site";

type EditField = "date" | "price" | null;

type Frame = {
  date: string;
  price: string;
  edit: EditField;
  hold: number;
  commit: boolean;
};

function buildFrames(): Frame[] {
  const frames: Frame[] = [];
  const from = "470";
  const to = "390";
  const dateA = EXAMPLE.date;
  const dateB = EXAMPLE.nextDate;

  frames.push({ date: dateA, price: EXAMPLE.price, edit: null, hold: 1100, commit: true });
  frames.push({ date: dateA, price: EXAMPLE.price, edit: "price", hold: 420, commit: true });

  for (let i = from.length - 1; i >= 0; i -= 1) {
    frames.push({
      date: dateA,
      price: `R$ ${from.slice(0, i)}`,
      edit: "price",
      hold: 90,
      commit: false,
    });
  }

  for (let i = 1; i <= to.length; i += 1) {
    frames.push({
      date: dateA,
      price: `R$ ${to.slice(0, i)}`,
      edit: "price",
      hold: 110,
      commit: i === to.length,
    });
  }

  frames.push({ date: dateA, price: EXAMPLE.nextPrice, edit: "price", hold: 640, commit: true });
  frames.push({ date: dateA, price: EXAMPLE.nextPrice, edit: null, hold: 280, commit: true });
  frames.push({ date: dateA, price: EXAMPLE.nextPrice, edit: "date", hold: 460, commit: true });
  frames.push({ date: dateB, price: EXAMPLE.nextPrice, edit: "date", hold: 1200, commit: true });
  frames.push({ date: dateB, price: EXAMPLE.nextPrice, edit: null, hold: 1700, commit: true });

  return frames;
}

function editLabel(edit: EditField): string {
  if (edit === "price") return "editando o preço";
  if (edit === "date") return "editando a data";
  return "";
}

async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function setupCopy(): void {
  const button = document.getElementById("copy-caption");
  const caption = document.getElementById("caption-text");
  const note = document.getElementById("caption-note");
  const status = document.getElementById("copy-status");
  if (!(button instanceof HTMLButtonElement) || !caption || !note) return;

  button.addEventListener("click", async () => {
    const text = `${caption.textContent?.trim() ?? ""}\n\n${note.textContent?.trim() ?? ""}`;
    const ok = await copyText(text);
    if (status) {
      status.textContent = ok ? "Legenda copiada." : "Selecione a legenda e copie manualmente.";
    }
  });
}

export function startExample(): void {
  setupCopy();

  const dateEl = document.querySelector<HTMLElement>("[data-value='date']");
  const priceEl = document.querySelector<HTMLElement>("[data-value='price']");
  const stateEl = document.querySelector<HTMLElement>("[data-layer-state]");
  const caption = document.getElementById("caption-text");
  const pauseBtn = document.querySelector<HTMLButtonElement>("#pause-animation");
  const poster = document.querySelector(".poster");

  if (!dateEl || !priceEl || !caption || !poster) return;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  const frames = buildFrames();
  let index = 0;
  let playing = true;
  let onScreen = false;
  let timer: number | undefined;

  const clearTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };

  const render = (frame: Frame) => {
    dateEl.textContent = frame.date;
    priceEl.textContent = frame.price;

    for (const field of poster.querySelectorAll<HTMLElement>(".field")) {
      field.classList.toggle("is-editing", field.dataset.field === frame.edit);
    }

    if (stateEl) stateEl.textContent = editLabel(frame.edit);

    if (frame.commit) {
      caption.textContent = exampleCaption(frame.date, frame.price);
    }
  };

  const step = () => {
    clearTimer();
    if (!playing || !onScreen || document.hidden) return;
    const frame = frames[index];
    if (!frame) return;
    render(frame);
    index = (index + 1) % frames.length;
    timer = window.setTimeout(step, frame.hold);
  };

  pauseBtn?.removeAttribute("hidden");
  pauseBtn?.addEventListener("click", () => {
    playing = !playing;
    const paused = !playing;
    pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
    pauseBtn.textContent = paused ? "Continuar animação" : "Pausar animação";
    if (paused) clearTimer();
    else step();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimer();
    else step();
  });

  motion.addEventListener("change", () => {
    if (!motion.matches) return;
    playing = false;
    clearTimer();
    pauseBtn?.setAttribute("hidden", "");
  });

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = Boolean(entry?.isIntersecting);
    if (onScreen) step();
    else clearTimer();
  });
  observer.observe(poster);
}
