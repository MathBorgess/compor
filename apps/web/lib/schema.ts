// Mini keeps the same core validators without shipping the fluent builder API.
// The classic entry configured English on import; retain its error messages.
import {config} from 'zod/mini';
import en from 'zod/v4/locales/en.js';
config(en());
export * from 'zod/mini';
