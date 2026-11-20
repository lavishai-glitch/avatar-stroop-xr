// All experiment parameters in one place. Values are starting points for the pilot.

export const WORDS = {
  right: 'ימין',
  left: 'שמאל',
  near: 'קרוב',
  far: 'רחוק',
  neutral: '####',
};

// Geometry in metres, in the "scene frame": participant at the origin facing -Z,
// +X to the participant's right. The scene root is aligned to the head on calibration.
export const GEOM = {
  tableDist: 1.5,        // horizontal distance from the head to the table centre P
  tableSize: 1.0,        // square table edge
  tableBelowEye: 0.5,    // table top = calibrated eye height - this
  postOffset: 0.35,      // A/B left-right of P, C/D nearer/farther than P
  postHeight: 0.12,
  wordAbovePost: 0.20,   // word centre above the post top
  wordWidth: 0.30,       // word plate size (letters about 6 cm high)
  wordHeight: 0.12,
  fixAboveTable: 0.25,
  avatarOffset: 0.90,    // avatar seat distance from P along X
};

// Milliseconds
export const TIMING = {
  itiMin: 800,
  itiMax: 1200,
  fixation: 500,
  stimMax: 2000,     // word disappears after this if no voice
  respWindow: 2500,  // trial ends as a timeout after this
  minVoiceRT: 150,   // ignore sound earlier than this after onset
  restSeconds: 30,
};

// Block order per counterbalancing sequence: [task, avatar side]
// S = judge from own perspective, A = from the avatar's; R/L = avatar on the participant's right/left
export const BLOCK_SEQS = {
  1: [['S', 'R'], ['A', 'R'], ['A', 'L'], ['S', 'L']],
  2: [['A', 'R'], ['S', 'R'], ['S', 'L'], ['A', 'L']],
  3: [['S', 'L'], ['A', 'L'], ['A', 'R'], ['S', 'R']],
  4: [['A', 'L'], ['S', 'L'], ['S', 'R'], ['A', 'R']],
};

export const VOICE = {
  calibrationMs: 2000,
  thresholdFactor: 4,   // threshold = max(noise RMS * factor, minThreshold)
  minThreshold: 0.02,
};
