// Dev tuning (temporary, for experiments): the world's linear scale against
// the tiles. At X, props are X times bigger and 1/X² as dense, mountains and
// the sky X times taller, and the altitudes where rock and snow take over X
// times higher. Set from the "Linear size" slider (or ?scale=X); the view is
// rebuilt to apply it.
export const WORLD_SCALE = { linear: Number(new URLSearchParams(globalThis.location?.search ?? '').get('scale')) || 1 };
