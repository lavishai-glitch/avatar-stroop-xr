// Controller input, read directly from the XR session every frame (no reliance on 'connected' events).
// Pose: grip space in the reference space (= three.js world). Buttons: gamepad (xr-standard: 0 trigger,
// 1 grip, 4 A/X, 5 B/Y). 'select' events (trigger or hand pinch) also count as trigger, as a fallback.
// A fake source (desktop keyboard / automated tests) replaces XR when set.
import * as THREE from 'three';

export class Input {
  constructor(renderer) {
    this.renderer = renderer;
    this.fake = null;
    this.prev = { left: {}, right: {} };
    this.select = { left: false, right: false };
    this.diag = { sources: 0, hands: 0, right: false, left: false, lastButtons: '' };
    this._session = null;
  }

  _hookSession(session) {
    if (this._session === session) return;
    this._session = session;
    const set = (v) => (e) => { const h = e.inputSource && e.inputSource.handedness; if (h === 'left' || h === 'right') this.select[h] = v; };
    session.addEventListener('selectstart', set(true));
    session.addEventListener('selectend', set(false));
  }

  read() {
    const out = {};
    const xr = this.renderer.xr;
    const session = xr.isPresenting ? xr.getSession() : null;
    const frame = session ? xr.getFrame() : null;
    const ref = session ? xr.getReferenceSpace() : null;
    if (session) this._hookSession(session);

    const found = {};
    if (session && frame && ref) {
      this.diag.sources = session.inputSources.length;
      this.diag.hands = 0;
      for (const src of session.inputSources) {
        const h = src.handedness;
        if (h !== 'left' && h !== 'right') continue;
        if (src.hand) this.diag.hands++;
        const space = src.gripSpace || src.targetRaySpace;
        const pose = space ? frame.getPose(space, ref) : null;
        const gp = src.gamepad;
        const btn = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
        found[h] = {
          present: !!pose,
          isHand: !!src.hand,
          pos: pose ? new THREE.Vector3().copy(pose.transform.position) : null,
          quat: pose ? new THREE.Quaternion().copy(pose.transform.orientation) : null,
          trigger: btn(0) || this.select[h],
          a: btn(4), b: btn(5), y: btn(5), grip: btn(1),
          buttons: gp ? gp.buttons.map((x) => (x.pressed ? 1 : 0)).join('') : '',
        };
      }
    }

    for (const hand of ['left', 'right']) {
      let s;
      if (this.fake && this.fake[hand]) {
        const f = this.fake[hand];
        s = { present: true, pos: f.pos.clone(), quat: (f.quat || new THREE.Quaternion()).clone(), trigger: !!f.trigger, a: !!f.a, b: !!f.b, y: !!f.y, grip: !!f.grip };
      } else if (found[hand]) {
        s = found[hand];
      } else {
        s = { present: false, trigger: false, a: false, b: false, y: false, grip: false };
      }
      const p = this.prev[hand];
      s.triggerDown = s.trigger && !p.trigger;
      s.triggerUp = !s.trigger && p.trigger;
      s.aDown = s.a && !p.a;
      s.bDown = s.b && !p.b;
      s.yDown = s.y && !p.y;
      s.gripDown = s.grip && !p.grip;
      this.prev[hand] = { trigger: s.trigger, a: s.a, b: s.b, y: s.y, grip: s.grip };
      out[hand] = s;
    }
    this.diag.right = out.right.present;
    this.diag.left = out.left.present;
    this.diag.lastButtons = `R:${found.right ? found.right.buttons : '-'} L:${found.left ? found.left.buttons : '-'}`;
    return out;
  }
}
