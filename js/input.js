// Controller input: grip poses and buttons from the Quest controllers (WebXR), or a fake source
// driven by the keyboard (desktop test) or by automated tests.
import * as THREE from 'three';

export class Input {
  constructor(renderer) {
    this.renderer = renderer;
    this.grips = {};      // handedness -> grip Object3D
    this.sources = {};    // handedness -> XRInputSource
    this.fake = null;     // { left:{pos,quat,trigger,a,b}, right:{...} } in WORLD coordinates
    this.prev = { left: {}, right: {} };
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      const ctrl = renderer.xr.getController(i);
      ctrl.addEventListener('connected', (e) => {
        const hand = e.data.handedness;
        if (hand !== 'left' && hand !== 'right') return;
        if (e.data.hand) return; // ignore tracked hands; controllers drive the avatar
        this.grips[hand] = grip;
        this.sources[hand] = e.data;
      });
      ctrl.addEventListener('disconnected', (e) => {
        const hand = e.data && e.data.handedness;
        if (hand && this.grips[hand] === grip) { delete this.grips[hand]; delete this.sources[hand]; }
      });
    }
  }

  // Returns per hand: { present, pos (world), quat (world), trigger, a, b, triggerDown, triggerUp, aDown, bDown }
  read() {
    const out = {};
    for (const hand of ['left', 'right']) {
      let s;
      if (this.fake && this.fake[hand]) {
        const f = this.fake[hand];
        s = { present: true, pos: f.pos.clone(), quat: (f.quat || new THREE.Quaternion()).clone(), trigger: !!f.trigger, a: !!f.a, b: !!f.b, y: !!f.y };
      } else if (this.grips[hand] && this.renderer.xr.isPresenting) {
        const g = this.grips[hand];
        const gp = this.sources[hand].gamepad;
        const btn = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
        s = { present: true, pos: g.getWorldPosition(new THREE.Vector3()), quat: g.getWorldQuaternion(new THREE.Quaternion()),
          trigger: btn(0), a: btn(4), b: btn(5), y: btn(5), buttons: gp ? gp.buttons.map((x) => x.pressed) : [] };
      } else {
        s = { present: false, trigger: false, a: false, b: false, y: false, buttons: [] };
      }
      const p = this.prev[hand];
      s.triggerDown = s.trigger && !p.trigger;
      s.triggerUp = !s.trigger && p.trigger;
      s.aDown = s.a && !p.a;
      s.bDown = s.b && !p.b;
      s.yDown = s.y && !p.y;
      this.prev[hand] = { trigger: s.trigger, a: s.a, b: s.b, y: s.y };
      out[hand] = s;
    }
    return out;
  }

  // Gamepad button by xr-standard index on the right controller (for the response mapping).
  pressedRight(index) {
    if (this.fake && this.fake.right) {
      const f = this.fake.right;
      return index === 4 ? !!f.a : index === 5 ? !!f.b : false;
    }
    const src = this.sources.right;
    const gp = src && src.gamepad;
    return !!(gp && gp.buttons[index] && gp.buttons[index].pressed);
  }
}
