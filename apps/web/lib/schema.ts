// Keep Mini's original validators and the English error messages used by the studio.
import { config } from 'zod/mini';
import en from 'zod/v4/locales/en.js';

config(en());

export {
  _default, array, boolean, catchall, discriminatedUnion, enum, extend,
  instanceof, int, iso, literal, maxLength, maximum, minLength, minimum,
  nonnegative, null, nullable, number, object, optional, pipe, positive,
  record, refine, regex, strictObject, string, superRefine, transform, trim,
  union, unknown, uuid,
} from 'zod/mini';
export type * from 'zod/mini';
