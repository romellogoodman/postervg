// Monotonic-ish layer id: timestamp base36 + an in-session counter so ids
// stay unique even when the user creates many layers in the same millisecond
// (e.g. via array / radial repeat). The specific format doesn't matter —
// React keys and equality checks just need distinct strings.
let _uid = 0;
export const nextId = () =>
  `l${Date.now().toString(36)}${(_uid++).toString(36)}`;
