// Collects output files in memory; the setup page offers them as downloads when the session ends.
// Trial rows are also mirrored to localStorage as a crash backup.

export const TRIAL_COLUMNS = [
  'participant', 'session', 'phase', 'mapping', 'avatarModel', 'seq', 'buttonMap', 'block', 'side', 'trial',
  'pos', 'word', 'type', 'correctButton', 'pressed', 'correct', 'itiMs', 'fixOnsetMs', 'stimOnsetMs', 'stimOffsetMs',
  'rtMs', 'timeout', 'seed',
];
export const MOTION_COLUMNS = ['tMs', 'state', 'headX', 'headY', 'headZ', 'headQx', 'headQy', 'headQz', 'headQw',
  'rCtrlX', 'rCtrlY', 'rCtrlZ', 'lCtrlX', 'lCtrlY', 'lCtrlZ', 'avRHandX', 'avRHandY', 'avRHandZ', 'avLHandX', 'avLHandY', 'avLHandZ'];
export const EVENT_COLUMNS = ['tMs', 'label', 'event', 'data'];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return '﻿' + lines.join('\n');
}

export class Logger {
  constructor(meta) {
    this.meta = meta;
    this.files = [];
    this.allTrials = [];
    this.backupKey = `avatar-stroop-backup-${meta.participant}-s${meta.session}-${meta.phase}`;
  }
  prefix() { const m = this.meta; return `${m.participant}_s${m.session}_${m.phase}`; }
  addTrial(row) {
    this.allTrials.push(row);
    try { localStorage.setItem(this.backupKey, toCSV(this.allTrials, TRIAL_COLUMNS)); } catch (e) { /* ignore */ }
  }
  addFile(name, blob) { this.files.push({ name, blob }); }
  finishBlock(blockIdx, side, trials, motionRows) {
    const tag = `${this.prefix()}_b${blockIdx}_${side}`;
    this.addFile(`${tag}_trials.csv`, new Blob([toCSV(trials, TRIAL_COLUMNS)], { type: 'text/csv' }));
    this.addFile(`${tag}_motion.csv`, new Blob([toCSV(motionRows, MOTION_COLUMNS)], { type: 'text/csv' }));
  }
  finishSession(extraMeta, events) {
    this.addFile(`${this.prefix()}_all_trials.csv`, new Blob([toCSV(this.allTrials, TRIAL_COLUMNS)], { type: 'text/csv' }));
    this.addFile(`${this.prefix()}_training_events.csv`, new Blob([toCSV(events, EVENT_COLUMNS)], { type: 'text/csv' }));
    const meta = { ...this.meta, ...extraMeta, userAgent: navigator.userAgent, savedAt: new Date().toISOString() };
    this.addFile(`${this.prefix()}_meta.json`, new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
  }
}
