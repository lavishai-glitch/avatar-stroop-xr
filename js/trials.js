// Trial labels, classification and block generation.

export const POSITIONS = ['A', 'B', 'C', 'D'];
export const WORD_KEYS = ['right', 'left', 'near', 'far', 'neutral'];

// Location label of each post in the participant's frame.
const SELF_LABEL = { A: 'right', B: 'left', C: 'near', D: 'far' };
// Location label of each post in the avatar's frame, by avatar side.
const AVATAR_LABEL = {
  R: { A: 'near', B: 'far', C: 'left', D: 'right' },
  L: { A: 'far', B: 'near', C: 'right', D: 'left' },
};
const OPPOSITE = { right: 'left', left: 'right', near: 'far', far: 'near' };

export function labels(pos, side) {
  return { self: SELF_LABEL[pos], avatar: AVATAR_LABEL[side][pos] };
}

// Type of a word relative to a judged frame label (J) and the other frame label (O).
export function classify(word, judged, other) {
  if (word === 'neutral') return 'neutral';
  if (word === judged) return 'congJ';
  if (word === OPPOSITE[judged]) return 'oppJ';
  if (word === other) return 'matchO';
  if (word === OPPOSITE[other]) return 'oppO';
  throw new Error(`Unclassifiable trial: ${word} / ${judged} / ${other}`);
}

export function describeTrial(pos, word, task, side) {
  const l = labels(pos, side);
  const typeSelfTask = classify(word, l.self, l.avatar);
  const typeAvatarTask = classify(word, l.avatar, l.self);
  return {
    pos, word, task, side,
    selfLabel: l.self,
    avatarLabel: l.avatar,
    correct: task === 'S' ? l.self : l.avatar,
    type: task === 'S' ? typeSelfTask : typeAvatarTask,
    typeSelfTask, typeAvatarTask,
  };
}

// Seeded PRNG so every block order can be reproduced from its logged seed.
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

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const sameCell = (a, b) => a.pos === b.pos && a.word === b.word;

// 4 positions x 5 stimuli x reps, shuffled with no immediate repeat of the same word+position.
export function makeBlock(task, side, reps, seed) {
  const rng = mulberry32(seed);
  const cells = [];
  for (let r = 0; r < reps; r++)
    for (const pos of POSITIONS)
      for (const word of WORD_KEYS) cells.push({ pos, word });

  for (let attempt = 0; attempt < 2000; attempt++) {
    shuffle(cells, rng);
    let ok = true;
    for (let i = 1; i < cells.length; i++) if (sameCell(cells[i], cells[i - 1])) { ok = false; break; }
    if (ok) return cells.map((c, i) => ({ trial: i + 1, ...describeTrial(c.pos, c.word, task, side) }));
  }
  throw new Error('Could not build a block without repeats');
}
