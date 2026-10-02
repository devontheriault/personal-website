/*
  Small numeric helpers shared by the page artwork and the scene.
  Everything "random" in the Journal is seeded, so a Sketch or a smudge
  of foxing is the same on every visit.
*/

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// mulberry32 — tiny, fast, good enough for artwork
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a generator seeded from text (an id, a page), salted to give each use
// its own sequence
export function seeded(seedText, salt = 0) {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) h = (Math.imul(h, 31) + seedText.charCodeAt(i)) | 0;
  return seededRandom((h ^ Math.imul(salt + 1, 2654435761)) >>> 0);
}

// smooth 1D value noise in [0, 1]; the wobble in every hand-drawn line
export function valueNoise(seed) {
  const rand = seededRandom(seed);
  const table = Array.from({ length: 256 }, rand);
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & 255];
    const b = table[(i + 1) & 255];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

const NUMERALS = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function roman(n) {
  let out = "";
  for (const [value, glyph] of NUMERALS) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
