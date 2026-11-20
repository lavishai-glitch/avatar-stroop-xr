// Microphone capture: continuous recording per block (for offline voice-onset analysis)
// and a simple energy detector for ending trials online.
import { VOICE } from './config.js';

export class Mic {
  constructor() {
    this.ctx = null;
    this.recording = false;
    this.chunks = [];
    this.recStartFrame = 0;
    this.threshold = VOICE.minThreshold;
    this.noiseRms = 0;
    this.armedFromFrame = null;   // detection active for samples at/after this frame
    this.onVoice = null;          // callback(frame)
    this.level = 0;
    this._calib = null;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 0; }
  get available() { return !!this.ctx; }

  async init() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    const src = this.ctx.createMediaStreamSource(this.stream);
    const tap = new AudioWorkletNode(this.ctx, 'mic-tap');
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    src.connect(tap).connect(mute).connect(this.ctx.destination); // keeps the graph pulled, silent
    tap.port.onmessage = (e) => this._onChunk(e.data);
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async resume() { if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume(); }

  _onChunk({ frame, data, rms, quantum }) {
    if (this.recording) this.chunks.push({ frame, data });
    this.level = rms[rms.length - 1];
    if (this._calib) this._calib.push(...rms);
    if (this.armedFromFrame !== null && this.onVoice) {
      for (let i = 0; i < rms.length; i++) {
        const f = frame + i * quantum;
        if (f >= this.armedFromFrame && rms[i] > this.threshold) {
          const cb = this.onVoice;
          this.armedFromFrame = null;
          cb(f);
          break;
        }
      }
    }
  }

  // Measure background noise for VOICE.calibrationMs and set the detection threshold.
  async calibrate() {
    this._calib = [];
    await new Promise((r) => setTimeout(r, VOICE.calibrationMs));
    const v = this._calib.sort((a, b) => a - b);
    this._calib = null;
    this.noiseRms = v.length ? v[Math.floor(v.length * 0.95)] : 0;
    this.threshold = Math.max(this.noiseRms * VOICE.thresholdFactor, VOICE.minThreshold);
    return { noiseRms: this.noiseRms, threshold: this.threshold };
  }

  // Map a performance.now() timestamp to an (approximate) audio sample frame.
  // The offset between output and input clocks is constant within a session and is
  // measured separately (see README, latency calibration).
  perfToFrame(perfMs) {
    if (!this.ctx) return null;
    const ts = this.ctx.getOutputTimestamp();
    const ctxTime = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    return Math.round(ctxTime * this.ctx.sampleRate);
  }

  arm(fromFrame, cb) { this.armedFromFrame = fromFrame; this.onVoice = cb; }
  disarm() { this.armedFromFrame = null; this.onVoice = null; }

  startRecording() {
    this.chunks = [];
    this.recording = true;
    this.recStartFrame = this.perfToFrame(performance.now());
  }

  // Returns { wav: Blob, firstFrame } — firstFrame is the sample frame of the WAV's first sample.
  stopRecording() {
    this.recording = false;
    if (!this.chunks.length) return null;
    const firstFrame = this.chunks[0].frame;
    const last = this.chunks[this.chunks.length - 1];
    const n = last.frame + last.data.length - firstFrame;
    const pcm = new Float32Array(n);
    for (const c of this.chunks) pcm.set(c.data, c.frame - firstFrame);
    this.chunks = [];
    return { wav: encodeWav(pcm, this.ctx.sampleRate), firstFrame };
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
