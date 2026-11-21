// All experiment parameters in one place. Values are starting points for the pilot.

export const WORDS = { near: 'קרוב', far: 'רחוק', neutral: '####' };

// Geometry in metres, in the "scene frame": participant at the origin facing -Z,
// +X to the participant's right. The scene root is aligned to the head on calibration.
export const GEOM = {
  tableDist: 1.5,       // horizontal distance from the head to the table centre P
  tableSize: 1.0,
  tableBelowEye: 0.5,   // table top = calibrated eye height - this
  avatarOffset: 0.72,   // avatar seat distance from P along X (avatar faces P); close enough to reach the table
  stimOffset: 0.35,     // stimulus cube: P -/+ this along the avatar's line of sight (near / far for the avatar)
  stimCube: 0.12,       // stimulus cube edge
  stimLift: 0.10,       // cube bottom above the table
  fixAboveTable: 0.20,
};

export const TIMING = {   // milliseconds unless noted
  itiMin: 800,
  itiMax: 1200,
  fixation: 500,
  stimMax: 2000,
  respWindow: 2500,
  restSeconds: 20,
  transitionMs: 1500,     // "test starts" message between training and trials
};

export const TRAINING = {
  mainSeconds: 300,       // first training of a post-training session
  topUpSeconds: 45,       // before each later block
  activeCubes: 3,         // cubes on the table at once
  cubeSize: 0.08,
  respawnMs: 500,         // a blasted cube reappears elsewhere after this
  spawnForward: [0.6, 1.15],  // spawn range from the avatar's shoulders, metres forward...
  spawnLateral: 0.38,         // ...and +/- this to the sides (always kept on the table)
};

// Controller -> avatar hand mapping (relative; metres in the avatar's frame, from its shoulder centre)
export const MAPPING = {
  gain: 1.0,             // controller movement x gain = avatar hand movement
  minForward: 0.17,      // wrist never closer than this to the chest plane
  maxCross: 0.08,        // midline crossing allowed just beyond nearBodyForward...
  maxCrossFar: 0.30,     // ...growing to this with the hand further forward
  nearBodyForward: 0.28, // when the wrist is closer than this...
  nearBodySide: 0.06,    // ...it must stay at least this far on its own side
  aboveTable: 0.05,      // wrist never lower than table top + this
  maxUp: 0.20,           // wrist never higher than shoulders + this
};

// Avatar side per block (avatar on the participant's Right / Left).
export const BLOCK_SEQS = {
  1: ['R', 'L', 'L', 'R'],
  2: ['L', 'R', 'R', 'L'],
};

// Right-controller buttons (xr-standard mapping: 4 = A, 5 = B).
export const BUTTON_MAPS = {
  1: { near: 4, far: 5, label: 'A = קרוב · B = רחוק' },
  2: { near: 5, far: 4, label: 'A = רחוק · B = קרוב' },
};

export const AVATARS = {
  male: { file: 'models/rpm.glb', height: 1.78, prefix: '' },
  female: { file: 'models/Michelle.glb', height: 1.68, prefix: 'mixamorig' },
};
