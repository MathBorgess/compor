import {openSettings} from './guided-navigation.mjs';

export async function connectOwnOpenAiKey(page, key) {
  const input = page.getByLabel('Chave OpenAI', { exact: true });
  const guided = page.locator('[data-guided="true"]');
  if (await guided.count()) {
    if (!await input.isVisible()) {
      if (!await page.getByRole('heading', {name:'Escolha sua IA',exact:true}).isVisible()) await openSettings(page,'IA');
      await page.getByRole('button', {name:/^Usar minha chave Conectar/}).click();
    }
    await input.fill(key);
    await page.getByRole('button', {name:'Usar minha chave',exact:true}).click();
    return;
  }
  const alreadyInConnection = await input.isVisible();
  if (!alreadyInConnection)
    await page.getByRole('button', { name: /^(Usar minha chave|Gerenciar IA)$/, exact: true }).click();
  await input.fill(key);
  await page.getByRole('button', { name: 'Usar minha chave', exact: true }).click();
  if (!alreadyInConnection)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
}
