// Audio worklet: passes raw microphone samples with their sample-frame index to the main thread,
// plus RMS per 128-sample quantum for online voice detection.
class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(256);
    this.fill = 0;
    this.startFrame = 0;
    this.rms = [];
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.fill === 0) this.startFrame = currentFrame;
    this.buf.set(ch, this.fill);
    let s = 0;
    for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
    this.rms.push(Math.sqrt(s / ch.length));
    this.fill += ch.length;
    if (this.fill >= this.buf.length) {
      this.port.postMessage({ frame: this.startFrame, data: this.buf.slice(0, this.fill), rms: this.rms, quantum: ch.length });
      this.fill = 0;
      this.rms = [];
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTap);
