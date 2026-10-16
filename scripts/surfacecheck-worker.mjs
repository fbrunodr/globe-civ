// Worker entry: registers the TypeScript loader inside the worker thread,
// then runs the worker half of surfacecheck.ts.
import { register } from 'tsx/esm/api';

register();
await import('./surfacecheck.ts');
