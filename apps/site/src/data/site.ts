export const SITE_URL = "https://compor.mathai.com.br";
export const SITE_NAME = "Compor";

export const HERO_TITLE =
  "O post de divulgação do seu curso, pronto. Sem inventar nada sobre a sua oferta.";

export const HERO_SUBTITLE =
  "Você conta o que está vendendo. O Compor entrega a arte limpa, o seu texto editável e a legenda para colar.";

export const PAGE_TITLE = "Compor — O post de divulgação do seu curso, pronto.";

export const CTA_LABEL = "Criar meu post";

export const FINAL_CTA = "Entre na lista e seja dos primeiros a testar.";

export const GENERIC_GENERATOR =
  "Gerador genérico cria do zero. O Compor usa só o que você contou, e você edita tudo o que aparece no post.";

export const AUDIENCE =
  "Para o infoprodutor que lança sozinho e não quer reescrever o preço e a data a cada lançamento.";

export const STEPS = [
  {
    title: "Conte o que você está vendendo",
    body: "Curso, mentoria ou ebook, com o preço e a data.",
  },
  {
    title: "Seu post, com os seus dados",
    body: "Receba o post com a arte limpa e o texto em camadas.",
  },
  {
    title: "Preço e data ajustados, sem gerar de novo",
    body: "Ajuste o preço, a data ou o texto.",
  },
] as const;

export const DOWNLOAD_STEP = {
  title: "Baixar o post",
  body: "O arquivo do post fica com você.",
} as const;

export const CAPTION_STEP = {
  title: "Copiar a legenda",
  body: "O texto sai separado, para colar onde você publicar.",
} as const;

export const FAQ = [
  {
    question: "Preciso de chave de IA?",
    answer: "Na fase de teste, não.",
  },
  {
    question: "Quanto custa?",
    answer: "Por enquanto, o acesso é por convite durante o teste.",
  },
  {
    question: "O Compor inventa informação?",
    answer: "Não. Ele só usa o que você escreveu.",
  },
] as const;

export const EXAMPLE = {
  stamp: "Exemplo ilustrativo",
  kicker: "Curso",
  course: "Planilhas para a rotina",
  detail: "Cinco aulas gravadas, com exercícios.",
  date: "3 de novembro",
  price: "R$ 470",
  nextDate: "19 de novembro",
  nextPrice: "R$ 390",
  note: "Exemplo ilustrativo. Não é uma oferta real.",
} as const;

/**
 * TODO(owner): o destino do CTA ainda não foi decidido.
 * "waitlist" — os botões "Criar meu post" descem até a lista.
 * "contact" — os mesmos botões abrem WAITLIST_SUBMIT_TARGET.
 */
export const CTA_DESTINATION = "waitlist" as "waitlist" | "contact";

/**
 * TODO(waitlist): sem backend. Nada é gravado no site.
 * Defina PUBLIC_WAITLIST_SUBMIT_TARGET com um mailto confirmado
 * ou, no futuro, a URL do endpoint. Veja .env.example.
 */
export const WAITLIST_SUBMIT_TARGET =
  import.meta.env.PUBLIC_WAITLIST_SUBMIT_TARGET || "mailto:ola@mathai.com.br";

export function ctaHref(): string {
  if (CTA_DESTINATION === "contact") return WAITLIST_SUBMIT_TARGET;
  return "/#lista";
}

export function exampleCaption(date: string, price: string): string {
  return [
    `Inscrições abertas para ${EXAMPLE.course}.`,
    EXAMPLE.detail,
    `Encontro em ${date}.`,
    `Investimento: ${price}.`,
  ].join("\n");
}

export function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/favicon.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${SITE_URL}/`,
        inLanguage: "pt-BR",
        description: HERO_SUBTITLE,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}
