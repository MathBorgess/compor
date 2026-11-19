import {readFile} from 'node:fs/promises';

const directionFile = new URL('./skills/direcao-visual-de-campanha/SKILL.md', import.meta.url);
const promptFile = new URL('./skills/preparar-prompt-de-arte/SKILL.md', import.meta.url);
const formatsFile = new URL('./skills/formatos-instagram/SKILL.md', import.meta.url);
const editHeading = '\n## Edição\n';
let skillPack;

async function readSkill(file) {
 const raw = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
 const [, name, metadata, body] = /^---\nname: ([a-z0-9-]+)\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(raw) ?? [];
 const version = metadata?.match(/^ {2}version: "([0-9.]+)"$/m)?.[1];
 if (!version || !body?.trim()) throw Error('invalid image prompt skill');
 return {marker:`Skill ${name}@${version}`,body:body.trim()};
}

async function loadPack() {
 const [direction, prompt, formats] = await Promise.all([readSkill(directionFile), readSkill(promptFile), readSkill(formatsFile)]);
 const editStart = prompt.body.indexOf(editHeading);
 if (editStart < 0) throw Error('missing image edit skill instructions');
 const heading = [
  `### ${formats.marker}`,
  formats.body,
  `### ${direction.marker}`,
  direction.body,
  `### ${prompt.marker}`,
 ].join('\n');
 return {
  post: `${heading}\n${prompt.body}`,
  exploration: `${heading}\n${prompt.body.slice(0, editStart).trimEnd()}`,
 };
}

// With environment:none the hosted agent can't read package files. The server
// selects these fixed local procedures and injects only the applicable excerpt.
export async function imagePromptSkills(scope) {
 if (scope !== 'post' && scope !== 'exploration') throw Error('unknown image prompt skill scope');
 skillPack ??= loadPack();
 return (await skillPack)[scope];
}
