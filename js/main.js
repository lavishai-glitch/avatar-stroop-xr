import * as THREE from 'three';
import { GEOM, TIMING, TRAINING, BLOCK_SEQS, BUTTON_MAPS, AVATARS } from './config.js';
import { ExperimentScene } from './scene.js';
import { makeBlock, hashSeed } from './trials.js';
import { Logger } from './logger.js';
import { Input } from './input.js';
import { BodyMap } from './mapping.js';
import { TowerGame } from './training.js';

// ---------- renderer / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 1.2, 0);
scene.add(camera);
const exp = new ExperimentScene(scene);
const input = new Input(renderer);
const bodyMap = new BodyMap(exp);
const game = new TowerGame(exp, bodyMap);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  status: (t) => { $('status').textContent = t; },
  log: (t) => { const d = document.createElement('div'); d.textContent = t; $('log').prepend(d); },
};

let state = 'idle';
let cfg = null, logger = null, blocks = [], blockIdx = 0, trials = [], tIdx = 0;
let trialRows = [], motionRows = [];
let cur = null, stateEnd = 0;
let pendingStart = false, pendingCalibrate = false;
let desktopMode = false;
const headPos = new THREE.Vector3(), headQuat = new THREE.Quaternion();
const keys = {};

function readConfig() {
  return {
    participant: $('pid').value.trim() || 'P00',
    session: Number($('session').value),
    phase: $('phase').value,                     // pre = no training, static avatar; post = training + live avatar
    mapping: $('phase').value === 'pre' ? 'static' : $('mapping').value,
    avatarModel: $('avatarModel').value,
    seq: Number($('seq').value),
    buttonMap: Number($('buttonMap').value),
    reps: Number($('reps').value),
    includeNeutral: $('neutral').checked,
    mainTrainingS: Number($('trainS').value),
    geometry: GEOM, timing: TIMING, training: TRAINING,
  };
}

async function prepareSession() {
  cfg = readConfig();
  logger = new Logger(cfg);
  blocks = BLOCK_SEQS[cfg.seq].map((side, i) => ({ idx: i + 1, side, seed: hashSeed(`${cfg.participant}|${cfg.session}|${cfg.phase}|${i + 1}`) }));
  blockIdx = 0;
  game.events = [];
  $('downloads').innerHTML = '';
  if (!exp.avatar.ready || exp.avatarModel !== cfg.avatarModel) {
    ui.status('Loading avatar…');
    await exp.loadAvatar(AVATARS[cfg.avatarModel]);
    exp.avatarModel = cfg.avatarModel;
  }
  bodyMap.mode = 'static';
}

async function startXR() {
  await prepareSession();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  session.addEventListener('end', () => { if (state !== 'done') finishSession('ended early'); });
  await renderer.xr.setSession(session);
  pendingCalibrate = true;
  goInstructions();
}

async function startDesktop() {
  desktopMode = true;
  await prepareSession();
  pendingCalibrate = true;
  goInstructions();
  ui.status('Desktop test: Space = continue · arrows/PgUp/PgDn move the right hand · G = grab · 1 = A, 2 = B · Esc = end');
}

// ---------- desktop keyboard: fake right controller ----------
const fakeRight = { pos: null, trigger: false, a: false, b: false };
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { if (state !== 'idle' && state !== 'done') e.preventDefault(); if (state === 'instructions') pendingStart = true; }
  if (e.code === 'KeyR') pendingCalibrate = true;
  if (e.code === 'KeyG') fakeRight.trigger = true;
  if (e.code === 'Digit1') fakeRight.a = true;
  if (e.code === 'Digit2') fakeRight.b = true;
  if (e.code === 'Escape' && desktopMode && state !== 'idle' && state !== 'done') finishSession('ended by experimenter');
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyG') fakeRight.trigger = false;
  if (e.code === 'Digit1') fakeRight.a = false;
  if (e.code === 'Digit2') fakeRight.b = false;
});
function updateDesktopFake(dt) {
  if (!desktopMode || window.__externalFake) return;
  if (!fakeRight.pos) fakeRight.pos = exp.root.localToWorld(new THREE.Vector3(0.18, (exp.eyeY ?? 1.2) - 0.55, -0.35));
  const v = 0.4 * dt / 1000, p = fakeRight.pos;
  const local = exp.root.worldToLocal(p.clone());
  if (keys.ArrowLeft) local.x -= v; if (keys.ArrowRight) local.x += v;
  if (keys.ArrowUp) local.z -= v; if (keys.ArrowDown) local.z += v;
  if (keys.PageUp) local.y += v; if (keys.PageDown) local.y -= v;
  p.copy(exp.root.localToWorld(local));
  input.fake = { right: fakeRight };
}

// ---------- flow ----------
function instructionText() {
  const map = BUTTON_MAPS[cfg.buttonMap].label;
  if (cfg.phase === 'pre') {
    return ['ניסוי נקודת מבט', 'קובייה תופיע על השולחן', 'לחצ/י לפי המיקום שלה ביחס לדמות', map, 'התעלם/י מהמילה · טריגר להתחלה'];
  }
  return ['ניסוי נקודת מבט', 'בנה/י מגדל: כוון/י את הקרן מהשלט של הדמות לקובייה · טריגר = תפיסה', 'אחר כך: לחצ/י לפי מיקום הקובייה ביחס לדמות · ' + map,
    'grip = איפוס הידיים בכל רגע', 'החזק/י את הידיים לפנים בנוחות ולחצ/י טריגר להתחלה'];
}

let panelKey = '';
function diagLine() {
  const d = input.diag;
  if (!renderer.xr.isPresenting) return '';
  if (d.hands > 0 && !d.right) return 'זוהו ידיים במקום שלטים: יש להחזיק את השלטים';
  return `שלט ימין ${d.right ? '✓' : '✗'} · שלט שמאל ${d.left ? '✓' : '✗'}`;
}
function showInstructions() {
  const lines = [...instructionText(), diagLine()].filter(Boolean);
  const key = lines.join('|');
  if (key !== panelKey) { panelKey = key; exp.setPanel(lines); }
}

function goInstructions() {
  const b = blocks[blockIdx];
  exp.setAvatarSide(b.side);
  exp.hideStim(); exp.fixation.visible = false; exp.hideHud();
  panelKey = '';
  showInstructions();
  state = 'instructions';
  ui.log(`Block ${b.idx}: avatar ${b.side}`);
}

function startBlock(now, inp) {
  const b = blocks[blockIdx];
  exp.setAvatarSide(b.side);
  exp.hidePanel();
  motionRows = [];
  bodyMap.mode = cfg.mapping;
  bodyMap.calibrate(inp); // hands where they are now = avatar's resting hands
  if (cfg.phase === 'post') {
    const secs = blockIdx === 0 ? cfg.mainTrainingS : TRAINING.topUpSeconds;
    game.start(secs, now, `block${b.idx}`);
    state = 'training';
  } else {
    goTransition(now);
  }
}

function goTransition(now) {
  exp.setPanel(['שלב המבחן', BUTTON_MAPS[cfg.buttonMap].label]);
  state = 'transition';
  stateEnd = now + TIMING.transitionMs;
}

function startTrials(now) {
  const b = blocks[blockIdx];
  exp.hidePanel();
  trials = makeBlock(cfg.reps, cfg.includeNeutral, b.seed);
  tIdx = 0; trialRows = [];
  state = 'trials';
  newTrial(now);
}

function endBlock(now) {
  const b = blocks[blockIdx];
  logger.finishBlock(b.idx, b.side, trialRows, motionRows);
  const acc = trialRows.filter((r) => r.correct === 1).length;
  ui.log(`Block ${b.idx} done: ${trialRows.length} trials, ${acc} correct`);
  blockIdx++;
  if (blockIdx >= blocks.length) return finishSession('complete');
  state = 'rest';
  stateEnd = now + TIMING.restSeconds * 1000;
  exp.setAvatarSide(blocks[blockIdx].side); // move the avatar during the break
}

function finishSession(reason) {
  if (state === 'done') return;
  state = 'done';
  game.group.visible = false;
  exp.hideStim(); exp.fixation.visible = false; exp.hideHud();
  exp.setPanel(['סיימנו את החלק הזה', 'תודה!']);
  logger.finishSession({ endReason: reason, blocks }, game.events);
  ui.status(`Session ${reason}. Exit VR and download the files below.`);
  const box = $('downloads');
  box.innerHTML = '<h3>Data files</h3>';
  for (const f of logger.files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f.blob);
    a.download = f.name;
    a.textContent = `${f.name} (${(f.blob.size / 1024).toFixed(0)} KB)`;
    box.appendChild(a);
  }
}

// ---------- trials ----------
function newTrial(now) {
  if (tIdx >= trials.length) return endBlock(now);
  const iti = TIMING.itiMin + Math.random() * (TIMING.itiMax - TIMING.itiMin);
  cur = { ...trials[tIdx], phase: 'iti', itiMs: Math.round(iti), itiEnd: now + iti };
}

function closeTrial(now, pressed) {
  if (exp.stim.visible) { exp.hideStim(); cur.stimOffsetMs = Math.round(now); }
  const b = blocks[blockIdx];
  const row = {
    participant: cfg.participant, session: cfg.session, phase: cfg.phase, mapping: cfg.mapping, avatarModel: cfg.avatarModel,
    seq: cfg.seq, buttonMap: cfg.buttonMap, block: b.idx, side: b.side, trial: cur.trial,
    pos: cur.pos, word: cur.word, type: cur.type, correctButton: cur.pos, pressed: pressed || '',
    correct: pressed ? (pressed === cur.pos ? 1 : 0) : 0,
    itiMs: cur.itiMs, fixOnsetMs: Math.round(cur.fixOnsetMs), stimOnsetMs: Math.round(cur.stimOnsetMs), stimOffsetMs: cur.stimOffsetMs,
    rtMs: pressed ? Math.round(now - cur.stimOnsetMs) : '', timeout: pressed ? 0 : 1, seed: b.seed,
  };
  trialRows.push(row);
  logger.addTrial(row);
  tIdx++;
  newTrial(now);
}

function stepTrials(now, inp) {
  if (cur.phase === 'iti' && now >= cur.itiEnd) {
    exp.fixation.visible = true;
    cur.fixOnsetMs = now;
    cur.phase = 'fix';
  } else if (cur.phase === 'fix' && now >= cur.fixOnsetMs + TIMING.fixation) {
    exp.fixation.visible = false;
    exp.showStim(cur.pos, cur.word);
    cur.stimOnsetMs = now; // frame in which the cube is first drawn
    cur.phase = 'stim';
  } else if (cur.phase === 'stim') {
    const map = BUTTON_MAPS[cfg.buttonMap];
    const r = inp.right;
    const down = (idx) => (idx === 4 ? r.aDown : r.bDown);
    if (down(map.near) && !down(map.far)) return closeTrial(now, 'near');
    if (down(map.far) && !down(map.near)) return closeTrial(now, 'far');
    const dt = now - cur.stimOnsetMs;
    if (dt >= TIMING.stimMax && exp.stim.visible) { exp.hideStim(); cur.stimOffsetMs = Math.round(now); }
    if (dt >= TIMING.respWindow) closeTrial(now, null);
  }
}

// ---------- per-frame ----------
const f4 = (v) => (v === undefined || v === null ? '' : v.toFixed(4));
function logMotion(now, inp) {
  const L = (v) => (v ? exp.root.worldToLocal(v.clone()) : null);
  const h = L(headPos), rc = inp.right.present ? L(inp.right.pos) : null, lc = inp.left.present ? L(inp.left.pos) : null;
  const ar = exp.avatar.ready ? L(exp.avatar.handPoint('Right')) : null, al = exp.avatar.ready ? L(exp.avatar.handPoint('Left')) : null;
  motionRows.push({ tMs: now.toFixed(1), state, headX: f4(h.x), headY: f4(h.y), headZ: f4(h.z),
    headQx: f4(headQuat.x), headQy: f4(headQuat.y), headQz: f4(headQuat.z), headQw: f4(headQuat.w),
    rCtrlX: f4(rc?.x), rCtrlY: f4(rc?.y), rCtrlZ: f4(rc?.z), lCtrlX: f4(lc?.x), lCtrlY: f4(lc?.y), lCtrlZ: f4(lc?.z),
    avRHandX: f4(ar?.x), avRHandY: f4(ar?.y), avRHandZ: f4(ar?.z), avLHandX: f4(al?.x), avLHandY: f4(al?.y), avLHandZ: f4(al?.z) });
}

let lastT = 0;
renderer.setAnimationLoop((time) => {
  const now = time, dt = lastT ? now - lastT : 16; lastT = now;
  const xrCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  xrCam.getWorldPosition(headPos);
  xrCam.getWorldQuaternion(headQuat);

  if (pendingCalibrate && headPos.y > 0.3 && ['idle', 'instructions', 'rest'].includes(state)) {
    exp.calibrate(headPos, headQuat, GEOM.tableBelowEye);
    pendingCalibrate = false;
    fakeRight.pos = null;
    ui.log(`Calibrated: eye height ${headPos.y.toFixed(2)} m, table ${exp.tableY.toFixed(2)} m`);
    if (state === 'instructions') panelKey = '';
  }
  updateDesktopFake(dt);
  const inp = input.read();

  // Participant controls (instructions / rest)
  if (state === 'instructions') {
    showInstructions();
    if (inp.right.triggerDown || inp.left.triggerDown || inp.right.aDown || pendingStart) { pendingStart = false; startBlock(now, inp); }
  }
  if ((state === 'instructions' || state === 'rest') && inp.left.yDown) pendingCalibrate = true;

  bodyMap.update(inp, headQuat);

  if (state === 'training') {
    if (game.update(now, inp)) { game.stop(now); goTransition(now); }
  } else if (state === 'transition' && now >= stateEnd) {
    startTrials(now);
  } else if (state === 'trials' && cur) {
    stepTrials(now, inp);
  } else if (state === 'rest') {
    const left = Math.ceil((stateEnd - now) / 1000);
    if (left > 0) exp.setPanel(['הפסקה קצרה', `${left} שניות`, 'הדמות עוברת לצד השני']);
    else goInstructions();
  }
  if (['training', 'transition', 'trials'].includes(state)) logMotion(now, inp);

  exp.faceCamera(headPos);
  renderer.render(scene, camera);
});

// Show runtime errors inside VR as well, so they can be reported.
window.addEventListener('error', (e) => { ui.status('Error: ' + e.message); try { exp.setPanel(['שגיאה', String(e.message).slice(0, 60)]); } catch (_) { /* ignore */ } });
window.addEventListener('unhandledrejection', (e) => { ui.status('Error: ' + (e.reason && e.reason.message)); });

// ---------- buttons ----------
for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => b.blur());
$('btnXR').addEventListener('click', () => startXR().catch((e) => ui.status('Could not start VR: ' + e.message)));
$('btnDesktop').addEventListener('click', () => startDesktop().catch((e) => ui.status('Could not start: ' + e.message)));

(async () => {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  $('btnXR').disabled = !ok;
  ui.status(ok ? 'Ready. Fill in the session details and press Enter VR.' : 'WebXR VR not available here: use desktop test mode.');
  exp.setPanel(['ניסוי נקודת מבט', 'ממתין להתחלה']);
  try { await exp.loadAvatar(AVATARS[$('avatarModel').value]); exp.avatarModel = $('avatarModel').value; } catch (e) { ui.status('Avatar failed to load: ' + e.message); }
})();

// Exposed for automated tests
window.__exp = {
  get state() { return state; }, get logger() { return logger; }, get cur() { return cur; }, exp, input, bodyMap, game,
  setFake(f) { window.__externalFake = true; input.fake = f; },
};
