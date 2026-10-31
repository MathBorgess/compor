export type CtaPosition = "header" | "hero" | "final";

export type AnalyticsEvent =
  | { name: "landing_viewed" }
  | { name: "cta_clicked"; position: CtaPosition }
  | { name: "waitlist_submitted" };

type AnalyticsGlobal = typeof globalThis & {
  __COMPOR_ANALYTICS__?: AnalyticsEvent[];
};

const pending: AnalyticsEvent[] = [];

/**
 * TODO(analytics): decisão pendente entre PostHog e Vercel Analytics.
 * Não carregar SDK e não definir chave neste repositório.
 * Quando houver decisão e consentimento, troque o corpo desta função
 * por posthog.capture(event.name, props) — sem enviar nome, e-mail ou oferta.
 *
 * Eventos já ligados na página:
 * - landing_viewed
 * - cta_clicked { position: "header" | "hero" | "final" }
 * - waitlist_submitted
 */
export function track(event: AnalyticsEvent): void {
  pending.push(event);
  (globalThis as AnalyticsGlobal).__COMPOR_ANALYTICS__ = pending;
}
