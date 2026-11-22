export type PostFormat = 'single' | 'carousel' | 'collection' | 'story';
export type PostImageSize = '1024x1280' | '864x1536';
export type CreativeSkillSurface = 'chat' | 'planner';

export interface PostFormatSpec {
  readonly id: PostFormat;
  readonly label: string;
  readonly aspectRatio: '4:5' | '9:16';
  readonly imageSize: PostImageSize;
  readonly minFrames: number;
  readonly maxFrames: number;
  readonly defaultFrames: number;
  readonly multiFrame: boolean;
  readonly safeZonePrompt: string;
}

export interface CreativeSkillEntry {
  readonly id: string;
  readonly version: string;
  readonly format?: PostFormat;
  readonly chat: string;
  readonly planner: string;
}

export interface CreativeSkillBundle {
  readonly catalogVersion: string;
  readonly format: PostFormat;
  readonly surface: CreativeSkillSurface;
  readonly ids: readonly string[];
  readonly instructions: string;
}

export declare const POST_FORMATS: readonly PostFormat[];
export declare const FORMAT_SPECS: Readonly<Record<PostFormat, PostFormatSpec>>;
export declare const CREATIVE_SKILLS_CATALOG_VERSION: string;
export declare const CREATIVE_CORE_SKILL: CreativeSkillEntry;
export declare const ON_IMAGE_COPY_SKILL: CreativeSkillEntry;
export declare const POST_SINGLE_SKILL: CreativeSkillEntry;
export declare const POST_CAROUSEL_SKILL: CreativeSkillEntry;
export declare const POST_COLLECTION_SKILL: CreativeSkillEntry;
export declare const POST_STORY_SKILL: CreativeSkillEntry;

export declare function isPostFormat(value: unknown): value is PostFormat;
export declare function normalizePostFormat(value: unknown): PostFormat;
export declare function formatSpec(value: unknown): PostFormatSpec;
export declare function formatImageSize(value: unknown): PostImageSize;
export declare function resolveCreativeSkillBundle(options?: {
  format?: PostFormat;
  surface?: CreativeSkillSurface;
}): CreativeSkillBundle;
