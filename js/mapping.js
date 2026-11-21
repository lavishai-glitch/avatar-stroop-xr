// Maps the participant's controllers and head onto the avatar.
// Relative mapping: at calibration (block start, or a grip press) the current controller position is
// tied to the avatar's resting hand position; from then on, controller movement is applied 1:1 (x gain)
// in the avatar's frame. No jump at the start, and the participant can re-centre at any time.
// anatomical: right controller -> avatar's right hand.  mirror: right controller -> avatar's left hand,
// lateral movement mirrored.  static: avatar rests.
import * as THREE from 'three';
import { MAPPING } from './config.js';

const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const UP = new THREE.Vector3(0, 1, 0);

export class BodyMap {
  constructor(exp) {
    this.exp = exp;
    this.mode = 'static';
    this.zero = { left: null, right: null };   // controller position (scene frame) at calibration
  }

  avatarSideFor(hand) {
    const same = hand === 'right' ? 'Right' : 'Left';
    const other = hand === 'right' ? 'Left' : 'Right';
    return this.mode === 'mirror' ? other : same;
  }

  // Resting hand position in the avatar's frame, relative to its shoulder centre: [forward, lateral(+ = its right), up]
  _rest(side) {
    const av = this.exp.avatar;
    const sc = av.shoulderCentre();
    return { fw: 0.36, lat: (side === 'Right' ? 1 : -1) * 0.17, up: (this.exp.tableY + 0.09) - sc.y };
  }

  calibrate(input, hands = ['left', 'right']) {
    for (const hand of hands) {
      const s = input[hand];
      this.zero[hand] = s && s.present ? this.exp.root.worldToLocal(s.pos.clone()) : null;
    }
  }

  // Keep the wrist out of the torso and above the table.
  _constrain(side, c, sc) {
    const s = side === 'Right' ? 1 : -1;
    c.fw = Math.max(c.fw, MAPPING.minForward);
    // Midline crossing: none close to the chest, more as the hand moves forward (as a real arm allows).
    const cross = c.fw < MAPPING.nearBodyForward
      ? -MAPPING.nearBodySide
      : Math.min(MAPPING.maxCrossFar, MAPPING.maxCross + (c.fw - MAPPING.nearBodyForward) * 2);
    if (c.lat * s < -cross) c.lat = -cross * s;
    const minUp = (this.exp.tableY + MAPPING.aboveTable) - sc.y;
    c.up = Math.min(Math.max(c.up, minUp), MAPPING.maxUp);
    return c;
  }

  update(input, headQuat) {
    const exp = this.exp, av = exp.avatar;
    if (!av.ready) return;
    av.group.updateMatrixWorld(true);
    if (this.mode === 'static') { av.restPose(exp.tableY); return; }

    const root = exp.root;
    const lateralSign = this.mode === 'mirror' ? -1 : 1;
    const sc = av.shoulderCentre(), f = av.forward(), r = av.right();
    for (const hand of ['left', 'right']) {
      const side = this.avatarSideFor(hand);
      const s = input[hand];
      if (!s || !s.present) { av.restArm(side, exp.tableY); continue; }
      if (s.gripDown || !this.zero[hand]) this.calibrate(input, [hand]);
      const d = root.worldToLocal(s.pos.clone()).sub(this.zero[hand]); // participant frame: x right, y up, -z forward
      const rest = this._rest(side), g = MAPPING.gain;
      const c = this._constrain(side, { fw: rest.fw - g * d.z, lat: rest.lat + lateralSign * g * d.x, up: rest.up + g * d.y }, sc);
      const target = sc.clone().addScaledVector(f, c.fw).addScaledVector(r, c.lat).addScaledVector(UP, c.up);
      av.reach(side, target);
    }

    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const rel = rootQ.invert().multiply(headQuat.clone());
    let q = Y180.clone().multiply(rel).multiply(Y180.clone().invert());
    if (this.mode === 'mirror') q = new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
    av.setHead(q);
  }
}
