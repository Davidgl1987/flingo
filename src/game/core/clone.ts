// NOTE: cloneState runs on the Zustand store object, which carries the action
// functions (tick, resetRun, ...) alongside the game data. JSON serialization is
// used on purpose: it strips those non-serializable functions (the store merges
// them back in on set). structuredClone would throw DataCloneError on them.
// The performance win comes from calling this once per frame instead of ~30
// times, not from the clone algorithm itself.
export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
