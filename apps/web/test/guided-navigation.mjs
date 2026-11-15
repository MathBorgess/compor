import {mockPostCatalog} from './mock-post-catalog.mjs';
const namedPosts=new WeakMap();
/** Navigate the production UI through the same explicit actions as a person. */
export async function finishPreparation(page,{useDefault=false,preparePost=true}={}) {
 await mockPostCatalog(page);
 await page.getByRole('navigation',{name:'Preparação do projeto',exact:true}).or(page.getByRole('button',{name:'Configurações do projeto',exact:true})).first().waitFor();
 if (!await page.getByRole('navigation',{name:'Preparação do projeto',exact:true}).isVisible()) {if(preparePost)await beginPost(page);return;}
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
 const finish=page.getByRole('button',{name:'Ir para os posts do projeto',exact:true});
 if(await finish.isVisible())await finish.click();
 if(preparePost)await beginPost(page);
}
async function beginPost(page){
 const create=page.getByRole('button',{name:'Criar novo post',exact:true});
 if(await create.isVisible()){
  const existing=page.getByRole('button',{name:/Abrir post e conversa$|Continuar preparação$/}).first();
  if(await existing.isVisible())await existing.click();else await create.click();
 }
 const next=page.getByRole('button',{name:'Continuar para criação',exact:true});
 if(await next.isVisible()){const name=page.getByRole('textbox',{name:'Nome do post',exact:true});if(await name.isVisible()&&!await name.inputValue()){const number=(namedPosts.get(page)??0)+1;namedPosts.set(page,number);await name.fill(`Post ${number}`);}await next.click();await name.waitFor({state:'hidden'});}
}
export async function openPostEditor(page){
 await finishPreparation(page);
 const first=page.getByRole('button',{name:/Abrir post e conversa$/}).first();
 if(await first.isVisible())await first.click();
 else if(await page.getByRole('button',{name:'Criar novo post',exact:true}).isVisible())await page.getByRole('button',{name:'Criar novo post',exact:true}).click();
 const manual=page.getByRole('button',{name:'Começar sem IA, no editor',exact:true});
 if(await manual.isVisible())await manual.click();
 const minimize=page.getByRole('button',{name:'Minimizar conversa',exact:true});
 if(page.viewportSize().width<=800&&await minimize.isVisible())await minimize.click();
 const fields=page.getByText('Editar textos, legenda e aprovação',{exact:true});
 if(await fields.isVisible()&&!await page.getByLabel('Título',{exact:true}).isVisible())await fields.click();
 await page.getByLabel('Título',{exact:true}).waitFor();
 const variants=page.locator('details.guided-versions');if(await variants.isVisible()&&!await variants.evaluate(el=>el.open))await variants.locator('summary').click();
}
export async function openSettings(page,tab='Contexto'){
 const postReferences=page.getByRole('dialog',{name:'Referências deste post',exact:true});
 if(await postReferences.isVisible()){
  if(tab==='Referências'){
   await postReferences.getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:'Referências',exact:true}).click();
   return page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
  }
  await page.keyboard.press('Escape');await postReferences.waitFor({state:'hidden'});
 }
 await finishPreparation(page,{preparePost:false});
 const panel=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
 if(!await panel.isVisible())await page.getByRole('button',{name:'Configurações do projeto',exact:true}).click();
 await panel.getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:tab,exact:true}).click();
 return panel;
}
export async function closeSettings(page){
 const panel=page.getByRole('dialog',{name:'Configurações do projeto',exact:true}).or(page.getByRole('dialog',{name:'Referências deste post',exact:true}));
 if(await panel.isVisible()){await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});}
}
export async function openConversation(page){
 await beginPost(page);
 const launcher=page.getByRole('button',{name:'Abrir conversa',exact:true});
 const message=page.locator('.guided-conversation:not([hidden])').getByRole('textbox',{name:'Sua mensagem',exact:true});
 if(await launcher.isVisible())await launcher.click();
 await message.waitFor();return message;
}

export async function addProjectReferences(page,files){
 const panel=await openSettings(page,'Referências');
 await panel.getByRole('button',{name:'Enviar imagem',exact:true}).click();
 await panel.locator('input[type="file"]').setInputFiles(files);
}
