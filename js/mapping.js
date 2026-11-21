// Maps the participant's controllers and head onto the avatar.
// anatomical: right controller -> avatar's right hand, movement rotated into the avatar's frame.
// mirror:     right controller -> avatar's left hand, lateral component mirrored.
// static:     avatar rests (no control).
import * as THREE from 'three';
import { GEOM } from './config.js';

const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const UP = new THREE.Vector3(0, 1, 0);

export class BodyMap {
  constructor(exp) {
    this.exp = exp;
    this.mode = 'static';
  }

  // Which avatar hand ('Left'/'Right') a controller ('left'/'right') drives.
  avatarSideFor(hand) {
    const same = hand === 'right' ? 'Right' : 'Left';
    const other = hand === 'right' ? 'Left' : 'Right';
    return this.mode === 'mirror' ? other : same;
  }

  update(input, headQuat) {
    const exp = this.exp, av = exp.avatar;
    if (!av.ready) return;
    av.group.updateMatrixWorld(true);
    if (this.mode === 'static') { av.restPose(exp.tableY + exp.root.position.y); return; }

    const root = exp.root;
    const anchor = new THREE.Vector3(0, (exp.eyeY ?? 1.2) - GEOM.shoulderBelowEye, 0);
    const sign = this.mode === 'mirror' ? -1 : 1;
    const sc = av.shoulderCentre(), f = av.forward(), r = av.right();
    for (const hand of ['left', 'right']) {
      const side = this.avatarSideFor(hand);
      const s = input[hand];
      if (!s || !s.present) { av.restArm(side, exp.tableY); continue; }
      const d = root.worldToLocal(s.pos.clone()).sub(anchor); // participant frame: x right, y up, -z forward
      const target = sc.clone().addScaledVector(r, sign * d.x).addScaledVector(UP, d.y).addScaledVector(f, -d.z);
      av.reach(side, target);
    }

    // Head: participant's head rotation relative to the calibrated forward, in the avatar's convention.
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const rel = rootQ.invert().multiply(headQuat.clone());
    let q = Y180.clone().multiply(rel).multiply(Y180.clone().invert());
    if (this.mode === 'mirror') q = new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
    av.setHead(q);
  }
}
