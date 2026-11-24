"use client";

export const imageReviewDisclosureSummary = 'Revisão automática de qualidade ativa';
export const imageReviewDisclosure =
  'Antes de entregar sua arte, o Compor envia a imagem gerada e o pedido à OpenAI com a chave de revisão do Compor. Imagens com erro grave podem ser retidas antes da entrega.';

export function ReviewDisclosureBadge({ compact = false }: { compact?: boolean }) {
  if (!compact) {
    return (
      <p className="review-disclosure-inline">
        <strong>{imageReviewDisclosureSummary}:</strong> {imageReviewDisclosure}
      </p>
    );
  }
  return (
    <details className="review-disclosure-compact">
      <summary>
        <span aria-hidden="true">ⓘ</span> {imageReviewDisclosureSummary} · <span>Como funciona</span>
      </summary>
      <p>{imageReviewDisclosure}</p>
    </details>
  );
}
