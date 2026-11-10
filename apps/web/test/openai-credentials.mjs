export async function connectOwnOpenAiKey(page, key) {
  const input = page.getByLabel('Chave OpenAI', { exact: true });
  const alreadyInConnection = await input.isVisible();
  if (!alreadyInConnection)
    await page.getByRole('button', { name: /^(Usar minha chave|Gerenciar IA)$/, exact: true }).click();
  await input.fill(key);
  await page.getByRole('button', { name: 'Usar minha chave', exact: true }).click();
  if (!alreadyInConnection)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
}
