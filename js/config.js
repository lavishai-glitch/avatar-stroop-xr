// All experiment parameters in one place. Values are starting points for the pilot.

export const WORDS = { near: 'קרוב', far: 'רחוק', neutral: '####' };

// Geometry in metres, in the "scene frame": participant at the origin facing -Z,
// +X to the participant's right. The scene root is aligned to the head on calibration.
export const GEOM = {
  tableDist: 1.5,       // horizontal distance from the head to the table centre P
  tableSize: 1.0,
  tableBelowEye: 0.5,   // table top = calibrated eye height - this
  avatarOffset: 0.90,   // avatar seat distance from P along X (avatar faces P)
  stimOffset: 0.35,     // stimulus cube: P -/+ this along the avatar's line of sight (near / far for the avatar)
  stimCube: 0.12,       // stimulus cube edge
  stimLift: 0.10,       // cube bottom above the table
  fixAboveTable: 0.20,
  // Arm mapping: participant shoulder centre = eye height - this
  shoulderBelowEye: 0.25,
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
  cubesPerTower: 5,
  cubeSize: 0.07,
  grabRadius: 0.10,       // avatar hand point to cube centre
  snapRadius: 0.06,       // horizontal tolerance to land on the tower
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
