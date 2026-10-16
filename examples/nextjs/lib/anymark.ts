import { createAnymark } from 'anymark';
import { srtPlugin } from './srtPlugin';

// One instance per server process: the registry is per instance, never global in the library.
export const anymark = createAnymark().use(srtPlugin);
