/** Deterministyczny PRNG mulberry32. Seed jest wyłącznie odtwarzalnością, nie autorytetem wyniku w multiplayer. */
export function createRng(seed) {
  let state = Number(seed) >>> 0;
  return {
    next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error('Nieprawidłowy zakres losowania'); return min + Math.floor(this.next() * (max - min + 1)); },
    getState() { return state >>> 0; }
  };
}
export function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
