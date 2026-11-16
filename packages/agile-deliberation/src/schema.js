// Preserve the classic entry's default error locale with the smaller builders.
import {config} from 'zod/mini';
import en from 'zod/v4/locales/en.js';
config(en());
export * from 'zod/mini';
