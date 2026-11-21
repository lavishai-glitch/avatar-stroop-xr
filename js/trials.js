// Trials: a cube on the avatar's line of sight (near / far for the avatar) with a word on every face.
// The participant presses the button for the cube's location relative to the avatar and ignores the word.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function trialType(pos, word) {
  if (word === 'neutral') return 'neutral';
  return pos === word ? 'congruent' : 'incongruent';
}

// pos: 'near' | 'far' (relative to the avatar). No more than 3 identical cells in a row.
export function makeBlock(reps, includeNeutral, seed) {
  const rng = mulberry32(seed);
  const words = includeNeutral ? ['near', 'far', 'neutral'] : ['near', 'far'];
  const cells = [];
  for (let r = 0; r < reps; r++) for (const pos of ['near', 'far']) for (const word of words) cells.push({ pos, word });
  const ok = (arr) => {
    for (let i = 3; i < arr.length; i++) {
      const same = (k) => arr[i - k].pos === arr[i].pos && arr[i - k].word === arr[i].word;
      if (same(1) && same(2) && same(3)) return false;
    }
    return true;
  };
  for (let attempt = 0; attempt < 5000; attempt++) {
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    if (ok(cells)) return cells.map((c, i) => ({ trial: i + 1, pos: c.pos, word: c.word, type: trialType(c.pos, c.word) }));
  }
  throw new Error('Could not build block');
}
