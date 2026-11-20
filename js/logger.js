// Collects output files in memory; the setup page offers them as downloads when the session ends.
// Trial rows are also mirrored to localStorage as a crash backup.

export const TRIAL_COLUMNS = [
  'participant', 'session', 'phase', 'seq', 'block', 'task', 'side', 'trial',
  'pos', 'word', 'selfLabel', 'avatarLabel', 'correct', 'type', 'typeSelfTask', 'typeAvatarTask',
  'itiMs', 'fixOnsetMs', 'stimOnsetMs', 'stimOffsetMs', 'stimAudioFrame', 'wavFirstFrame',
  'voiceFrame', 'onlineRtMs', 'keyRtMs', 'timeout', 'seed',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','));
  return '﻿' + lines.join('\n'); // BOM so Excel shows Hebrew correctly
}

export class Logger {
  constructor(meta) {
    this.meta = meta;
    this.files = [];      // { name, blob }
    this.allTrials = [];
    this.backupKey = `avatar-stroop-backup-${meta.participant}-s${meta.session}-${meta.phase}`;
  }

  prefix() {
    const m = this.meta;
    return `${m.participant}_s${m.session}_${m.phase}`;
  }

  addTrial(row) {
    this.allTrials.push(row);
    try { localStorage.setItem(this.backupKey, toCSV(this.allTrials, TRIAL_COLUMNS)); } catch (e) { /* storage full: ignore */ }
  }

  addFile(name, blob) { this.files.push({ name, blob }); }

  finishBlock(blockIdx, task, side, trials, headRows, audio) {
    const tag = `${this.prefix()}_b${blockIdx}_${task}${side}`;
    this.addFile(`${tag}_trials.csv`, new Blob([toCSV(trials, TRIAL_COLUMNS)], { type: 'text/csv' }));
    this.addFile(`${tag}_head.csv`, new Blob([toCSV(headRows, ['tMs', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw'])], { type: 'text/csv' }));
    if (audio) this.addFile(`${tag}_audio.wav`, audio.wav);
  }

  finishSession(extraMeta) {
    this.addFile(`${this.prefix()}_all_trials.csv`, new Blob([toCSV(this.allTrials, TRIAL_COLUMNS)], { type: 'text/csv' }));
    const meta = { ...this.meta, ...extraMeta, userAgent: navigator.userAgent, savedAt: new Date().toISOString() };
    this.addFile(`${this.prefix()}_meta.json`, new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
  }
}
