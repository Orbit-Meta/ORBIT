import { EventEmitter } from 'node:events';

// Everything the live screen shows flows through this bus.
// Events: session, partial, partial-clear, final, muse.
// Private DM content (Phase 4) must NEVER be emitted here.
export const bus = new EventEmitter();
bus.setMaxListeners(50);
