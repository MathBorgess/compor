/** Navigate the production UI through the same explicit actions as a person. */
export async function finishPreparation(page,{useDefault=false}={}) {
 await page.getByRole('navigation',{name:'Preparação do projeto',exact:true}).or(page.getByRole('button',{name:'Configurações do projeto',exact:true})).first().waitFor();
 if (!await page.getByRole('navigation',{name:'Preparação do projeto',exact:true}).isVisible()) return;
 for(let step=0;step<3;step++){
  const last=page.getByRole('button',{name:'Continuar para a IA',exact:true});
  if(await last.isVisible()){await last.click();break;}
  const next=page.getByRole('button',{name:'Continuar',exact:true});
  if(!await next.isVisible())break;
  await next.click();
 }
 if(await page.getByRole('heading',{name:'Escolha sua IA',exact:true}).isVisible()){
  if(useDefault){await page.getByRole('button',{name:/^Usar a IA do Compor/}).click();await page.getByRole('button',{name:'Continuar para referências',exact:true}).click();}
  else await page.getByRole('button',{name:'Escolher depois',exact:true}).click();
 }
 const finish=page.getByRole('button',{name:'Continuar para meu primeiro post',exact:true});
 if(await finish.isVisible())await finish.click();
}
export async function openPostEditor(page){
 await finishPreparation(page);
 const first=page.getByRole('button',{name:/Abrir post e conversa$/}).first();
 if(await first.isVisible())await first.click();
 else if(await page.getByRole('button',{name:'Novo post',exact:true}).isVisible())await page.getByRole('button',{name:'Novo post',exact:true}).click();
 const manual=page.getByRole('button',{name:'Começar sem IA, no editor',exact:true});
 if(await manual.isVisible())await manual.click();
 const post=page.locator('.guided-pane-controls').getByRole('button',{name:'Post',exact:true});
 if(page.viewportSize().width<=800&&await post.isVisible())await post.click();
 const fields=page.getByText('Editar textos, legenda e aprovação',{exact:true});
 if(await fields.isVisible()&&!await page.getByLabel('Título',{exact:true}).isVisible())await fields.click();
 await page.getByLabel('Título',{exact:true}).waitFor();
 const variants=page.locator('details.guided-versions');if(await variants.isVisible()&&!await variants.evaluate(el=>el.open))await variants.locator('summary').click();
}
export async function openSettings(page,tab='Contexto'){
 await finishPreparation(page);
 const panel=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
 if(!await panel.isVisible())await page.getByRole('button',{name:'Configurações do projeto',exact:true}).click();
 await panel.getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:tab,exact:true}).click();
 return panel;
}
export async function closeSettings(page){
 const panel=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
 if(await panel.isVisible()){await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});}
}
export async function openConversation(page){
 const button=page.locator('.guided-pane-controls').getByRole('button',{name:'Conversa',exact:true});
 const message=page.locator('.guided-conversation:not([hidden])').getByRole('textbox',{name:'Sua mensagem',exact:true});
 if(page.viewportSize().width>800){const both=page.getByRole('button',{name:'Ver ambos',exact:true});if(await both.isVisible())await both.click();}
 else if(!await message.isVisible()&&await button.isVisible())await button.click();
 await message.waitFor();return message;
}
