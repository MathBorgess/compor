import { POST_FORMATS, FORMAT_SPECS, isPostFormat, normalizePostFormat, formatSpec, formatImageSize } from './formats.mjs';
import { CREATIVE_CORE_SKILL } from './core.mjs';
import { ON_IMAGE_COPY_SKILL } from './copy-na-imagem.mjs';
import { POST_SINGLE_SKILL } from './format-single.mjs';
import { POST_CAROUSEL_SKILL } from './format-carousel.mjs';
import { POST_COLLECTION_SKILL } from './format-collection.mjs';
import { POST_STORY_SKILL } from './format-story.mjs';

export { POST_FORMATS, FORMAT_SPECS, isPostFormat, normalizePostFormat, formatSpec, formatImageSize };
export { CREATIVE_CORE_SKILL, ON_IMAGE_COPY_SKILL, POST_SINGLE_SKILL, POST_CAROUSEL_SKILL, POST_COLLECTION_SKILL, POST_STORY_SKILL };

export const CREATIVE_SKILLS_CATALOG_VERSION = 'compor-creative-skills.v4';

const FORMAT_SKILLS = Object.freeze({
  single: POST_SINGLE_SKILL,
  carousel: POST_CAROUSEL_SKILL,
  collection: POST_COLLECTION_SKILL,
  story: POST_STORY_SKILL,
});

/**
 * Resolves the two-layer curated skill bundle for the active post format and surface.
 * Layer 1: creative-core.v1 (always active)
 * Layer 2A: on-image-copy.v1 (always active — profile voice, direct response, carousel micro-copy)
 * Layer 2B: format-specific skill (exactly one for the active post format)
 */
export function resolveCreativeSkillBundle({ format = 'single', surface = 'chat' } = {}) {
  if (surface !== 'chat' && surface !== 'planner') {
    throw new TypeError('invalid skill surface');
  }
  const normalized = normalizePostFormat(format);
  const formatSkill = FORMAT_SKILLS[normalized];
  const skills = Object.freeze([CREATIVE_CORE_SKILL, ON_IMAGE_COPY_SKILL, formatSkill]);
  return Object.freeze({
    catalogVersion: CREATIVE_SKILLS_CATALOG_VERSION,
    format: normalized,
    surface,
    ids: Object.freeze(skills.map(skill => skill.id)),
    instructions: skills.map(skill => skill[surface]).join('\n'),
  });
}
