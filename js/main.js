import * as THREE from 'three';
import { GEOM, TIMING, BLOCK_SEQS } from './config.js';
import { ExperimentScene } from './scene.js';
import { makeBlock, hashSeed } from './trials.js';
import { Mic } from './audio.js';
import { Logger } from './logger.js';

// ---------- renderer / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 1.2, 0);           // desktop preview: seated eye height
scene.add(camera);
const exp = new ExperimentScene(scene);

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

const mic = new Mic();
let state = 'idle';
let cfg = null, logger = null, blocks = [], blockIdx = 0, trials = [], tIdx = 0;
let trialRows = [], headRows = [];
let cur = null;          // current trial runtime record
let pendingStart = false, pendingCalibrate = false;
let restEnd = 0;
let desktopMode = false;
const headPos = new THREE.Vector3(), headQuat = new THREE.Quaternion();

function readConfig() {
  return {
    participant: $('pid').value.trim() || 'P00',
    session: Number($('session').value),
    phase: $('phase').value,
    seq: Number($('seq').value),
    reps: Number($('reps').value),
    useMic: $('useMic').checked,
    geometry: GEOM, timing: TIMING,
  };
}

async function setupMic() {
  if (!cfg.useMic) return;
  if (!mic.available) await mic.init();
  await mic.resume();
  ui.status('Calibrating microphone: stay quiet for 2 s…');
  const c = await mic.calibrate();
  ui.log(`Mic: ${mic.sampleRate} Hz, noise RMS ${c.noiseRms.toFixed(4)}, threshold ${c.threshold.toFixed(4)}`);
}

function prepareSession() {
  cfg = readConfig();
  logger = new Logger(cfg);
  blocks = BLOCK_SEQS[cfg.seq].map(([task, side], i) => ({ idx: i + 1, task, side, seed: hashSeed(`${cfg.participant}|${cfg.session}|${cfg.phase}|${i + 1}`) }));
  blockIdx = 0;
  $('downloads').innerHTML = '';
}

async function startXR() {
  prepareSession();
  await setupMic();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
  session.addEventListener('end', onSessionEnd);
  session.addEventListener('select', () => onAdvance());
  session.addEventListener('squeeze', () => { pendingCalibrate = true; });
  await renderer.xr.setSession(session);
  pendingCalibrate = true;
  goInstructions();
}

async function startDesktop() {
  desktopMode = true;
  prepareSession();
  await setupMic();
  pendingCalibrate = true;
  goInstructions();
  ui.status('Desktop test: Space = start block, 1–4 = simulated voice response, Esc = end session');
}

function onSessionEnd() {
  if (state !== 'done') finishSession('ended early');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state !== 'idle' && state !== 'done') e.preventDefault(); // don't re-click a focused button
    onAdvance();
  }
  if (e.code === 'KeyR') pendingCalibrate = true;
  if (/^Digit[1-4]$/.test(e.code) && state === 'trials' && cur && cur.phase === 'stim') simulateVoice();
  if (e.code === 'Escape' && desktopMode && state !== 'idle' && state !== 'done') finishSession('ended by experimenter');
});

function onAdvance() {
  if (state === 'instructions') pendingStart = true;
}

// ---------- block flow ----------
const TASK_TEXT = {
  S: ['מנקודת המבט שלך', 'אמור/י בקול איפה המילה נמצאת עבורך:', 'ימין · שמאל · קרוב · רחוק', 'התעלם/י מהמילה עצמה'],
  A: ['מנקודת המבט של הדמות', 'אמור/י בקול איפה המילה נמצאת עבור הדמות:', 'ימין · שמאל · קרוב · רחוק', 'התעלם/י מהמילה עצמה'],
};

function goInstructions() {
  const b = blocks[blockIdx];
  exp.setAvatarSide(b.side);
  exp.hideWord();
  exp.fixation.visible = false;
  exp.setPanel([...TASK_TEXT[b.task], `בלוק ${b.idx} מתוך ${blocks.length} · לחיצה להתחלה`]);
  state = 'instructions';
  ui.log(`Block ${b.idx}: task ${b.task}, avatar ${b.side}`);
}

function startBlock(now) {
  const b = blocks[blockIdx];
  trials = makeBlock(b.task, b.side, cfg.reps, b.seed);
  tIdx = 0; trialRows = []; headRows = [];
  exp.hidePanel();
  if (cfg.useMic) mic.startRecording();
  state = 'trials';
  newTrial(now);
}

function endBlock() {
  const b = blocks[blockIdx];
  const audio = cfg.useMic ? mic.stopRecording() : null;
  if (audio) for (const r of trialRows) r.wavFirstFrame = audio.firstFrame;
  logger.finishBlock(b.idx, b.task, b.side, trialRows, headRows, audio);
  const done = trialRows.filter((r) => !r.timeout).length;
  ui.log(`Block ${b.idx} done: ${trialRows.length} trials, ${done} with a response`);
  blockIdx++;
  if (blockIdx >= blocks.length) return finishSession('complete');
  state = 'rest';
  restEnd = performance.now() + TIMING.restSeconds * 1000;
}

function finishSession(reason) {
  state = 'done';
  mic.disarm();
  if (cfg && cfg.useMic && mic.recording) mic.stopRecording();
  exp.hideWord(); exp.fixation.visible = false;
  exp.setPanel(['סיימנו את החלק הזה', 'תודה!']);
  logger.finishSession({ endReason: reason, sampleRate: mic.sampleRate, noiseRms: mic.noiseRms, threshold: mic.threshold, blocks });
  ui.status(`Session ${reason}. Exit VR and download the files below.`);
  renderDownloads();
}

function renderDownloads() {
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

// ---------- trial state machine (runs every frame) ----------
function newTrial(now) {
  if (tIdx >= trials.length) return endBlock();
  const t = trials[tIdx];
  const iti = TIMING.itiMin + Math.random() * (TIMING.itiMax - TIMING.itiMin);
  cur = { ...t, phase: 'iti', itiMs: Math.round(iti), itiEnd: now + iti };
}

function simulateVoice() {
  const now = performance.now();
  cur.keyRtMs = Math.round(now - cur.stimOnsetMs);
  cur.responded = true;
}

function onVoice(frame) {
  if (!cur || cur.phase !== 'stim') return;
  cur.voiceFrame = frame;
  cur.onlineRtMs = Math.round(((frame - cur.stimAudioFrame) / mic.sampleRate) * 1000);
  cur.responded = true;
}

function closeTrial(now, timeout) {
  if (exp.word.visible) { exp.hideWord(); cur.stimOffsetMs = Math.round(now); }
  mic.disarm();
  const b = blocks[blockIdx];
  const row = {
    participant: cfg.participant, session: cfg.session, phase: cfg.phase, seq: cfg.seq,
    block: b.idx, task: b.task, side: b.side, trial: cur.trial,
    pos: cur.pos, word: cur.word, selfLabel: cur.selfLabel, avatarLabel: cur.avatarLabel,
    correct: cur.correct, type: cur.type, typeSelfTask: cur.typeSelfTask, typeAvatarTask: cur.typeAvatarTask,
    itiMs: cur.itiMs, fixOnsetMs: Math.round(cur.fixOnsetMs), stimOnsetMs: Math.round(cur.stimOnsetMs),
    stimOffsetMs: cur.stimOffsetMs, stimAudioFrame: cur.stimAudioFrame, wavFirstFrame: null,
    voiceFrame: cur.voiceFrame, onlineRtMs: cur.onlineRtMs, keyRtMs: cur.keyRtMs,
    timeout: timeout ? 1 : 0, seed: b.seed,
  };
  trialRows.push(row);
  logger.addTrial(row);
  tIdx++;
  newTrial(now);
}

function step(now) {
  if (state === 'rest') {
    const left = Math.ceil((restEnd - now) / 1000);
    if (left > 0) exp.setPanel(['הפסקה קצרה', `${left} שניות`]);
    else goInstructions();
    return;
  }
  if (state === 'instructions' && pendingStart) { pendingStart = false; startBlock(now); return; }
  if (state !== 'trials' || !cur) return;

  if (cur.phase === 'iti' && now >= cur.itiEnd) {
    exp.fixation.visible = true;
    cur.fixOnsetMs = now;
    cur.phase = 'fix';
  } else if (cur.phase === 'fix' && now >= cur.fixOnsetMs + TIMING.fixation) {
    exp.fixation.visible = false;
    exp.showWord(cur.pos, cur.word);
    cur.stimOnsetMs = now;          // time of the frame in which the word is first drawn
    cur.phase = 'stim';
    if (cfg.useMic) {
      cur.stimAudioFrame = mic.perfToFrame(now);
      mic.arm(cur.stimAudioFrame + Math.round(TIMING.minVoiceRT / 1000 * mic.sampleRate), onVoice);
    }
  } else if (cur.phase === 'stim') {
    const dt = now - cur.stimOnsetMs;
    if (cur.responded) return closeTrial(now, false);
    if (dt >= TIMING.stimMax && exp.word.visible) { exp.hideWord(); cur.stimOffsetMs = Math.round(now); }
    if (dt >= TIMING.respWindow) closeTrial(now, true);
  }
}

// ---------- render loop ----------
renderer.setAnimationLoop((time) => {
  const xrCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  xrCam.getWorldPosition(headPos);
  xrCam.getWorldQuaternion(headQuat);

  // Head pose is valid only once the headset reports a real height (first XR frames can be at 0).
  if (pendingCalibrate && headPos.y > 0.3 && (state === 'instructions' || state === 'rest' || state === 'idle')) {
    exp.calibrate(headPos, headQuat, GEOM.tableBelowEye);
    pendingCalibrate = false;
    ui.log(`Calibrated: eye height ${headPos.y.toFixed(2)} m, table ${exp.tableY.toFixed(2)} m`);
  }

  // performance.now() and the XR frame time share the same clock origin.
  const now = time;
  step(now);
  if (state === 'trials') {
    headRows.push({ tMs: now.toFixed(1), x: headPos.x.toFixed(4), y: headPos.y.toFixed(4), z: headPos.z.toFixed(4),
      qx: headQuat.x.toFixed(5), qy: headQuat.y.toFixed(5), qz: headQuat.z.toFixed(5), qw: headQuat.w.toFixed(5) });
  }
  exp.faceCamera(headPos);
  renderer.render(scene, camera);
});

// ---------- buttons ----------
for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => b.blur());
$('btnXR').addEventListener('click', () => startXR().catch((e) => ui.status('Could not start VR: ' + e.message)));
$('btnDesktop').addEventListener('click', () => startDesktop().catch((e) => ui.status('Could not start: ' + e.message)));
$('btnMicTest').addEventListener('click', async () => {
  try {
    if (!mic.available) await mic.init();
    await mic.resume();
    const c = await mic.calibrate();
    ui.status(`Mic OK: noise ${c.noiseRms.toFixed(4)}, threshold ${c.threshold.toFixed(4)}. Speak to see the level.`);
    const meter = $('meter');
    const tick = () => { meter.value = Math.min(1, mic.level / (mic.threshold * 2)); requestAnimationFrame(tick); };
    tick();
  } catch (e) { ui.status('Mic error: ' + e.message); }
});

(async () => {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  $('btnXR').disabled = !ok;
  ui.status(ok ? 'Ready. Fill in the session details and press Enter VR.' : 'WebXR VR not available here: use desktop test mode.');
  exp.setPanel(['ניסוי נקודת מבט', 'ממתין להתחלה']);
})();

// Exposed for automated tests
window.__exp = { get state() { return state; }, get trials() { return trials; }, get logger() { return logger; }, exp };
