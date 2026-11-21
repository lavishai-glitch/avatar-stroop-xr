// Maps the participant's controllers and head onto the avatar, and gives the avatar its own controllers.
//
// Hand position (relative): at calibration (block start, or a grip press) the controller position is tied
// to the avatar's resting hand; movement from there is applied 1:1 (x gain) in the avatar's frame.
// Controller orientation: the participant's controller orientation rotated into the avatar's frame
// (mirror mode: reflected across the participant's sagittal plane first). It aims the avatar's controller
// and its ray, and turns the avatar's hand.
// anatomical: right controller -> avatar's right hand.  mirror: right controller -> avatar's left hand.
// static: avatar rests, holding its controllers, no rays.
import * as THREE from 'three';
import { MAPPING } from './config.js';

const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const REST_PITCH = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0)); // controller tilted down at rest

function makeController() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.35 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.105, 18), body);
  handle.position.set(0, -0.035, 0.012);
  handle.rotation.x = -0.45;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, 24), body);
  head.position.set(0, 0.016, -0.01);
  head.rotation.x = 0.35;
  g.add(head);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 10, 32), ringMat);
  ring.position.set(0, 0.02, -0.02);
  ring.rotation.x = Math.PI / 2 + 0.35;
  g.add(ring);
  return g;
}

function makeRay() {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x66d9ff }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0x66d9ff }));
  const g = new THREE.Group();
  g.add(line, dot);
  g.visible = false;
  return { group: g, line, dot };
}

export class BodyMap {
  constructor(exp) {
    this.exp = exp;
    this.mode = 'static';
    this.showRays = false;
    this.zero = { left: null, right: null };
    this.controllers = { Left: makeController(), Right: makeController() };
    this.rayVis = { Left: makeRay(), Right: makeRay() };
    for (const side of ['Left', 'Right']) {
      this.controllers[side].visible = false;
      exp.root.add(this.controllers[side]);
      exp.root.add(this.rayVis[side].group);
    }
    this.rays = { left: null, right: null }; // per participant hand: { origin, dir (world), side }
    this._lastRays = {};
  }

  avatarSideFor(hand) {
    const same = hand === 'right' ? 'Right' : 'Left';
    const other = hand === 'right' ? 'Left' : 'Right';
    return this.mode === 'mirror' ? other : same;
  }

  _rest(side) {
    const sc = this.exp.avatar.shoulderCentre();
    return { fw: 0.32, lat: (side === 'Right' ? 1 : -1) * 0.17, up: (this.exp.tableY + 0.11) - sc.y };
  }

  calibrate(input, hands = ['left', 'right']) {
    for (const hand of hands) {
      const s = input[hand];
      this.zero[hand] = s && s.present ? this.exp.root.worldToLocal(s.pos.clone()) : null;
    }
  }

  _constrain(side, c, sc) {
    const s = side === 'Right' ? 1 : -1;
    c.fw = Math.max(c.fw, MAPPING.minForward);
    const cross = c.fw < MAPPING.nearBodyForward
      ? -MAPPING.nearBodySide
      : Math.min(MAPPING.maxCrossFar, MAPPING.maxCross + (c.fw - MAPPING.nearBodyForward) * 2);
    if (c.lat * s < -cross) c.lat = -cross * s;
    const minUp = (this.exp.tableY + MAPPING.aboveTable) - sc.y;
    c.up = Math.min(Math.max(c.up, minUp), MAPPING.maxUp);
    return c;
  }

  // Rotation (scene frame) that turns the participant's forward (-Z) into the avatar's forward.
  _frameRot(rootQinv) {
    const f = this.exp.avatar.forward().applyQuaternion(rootQinv);
    f.y = 0; f.normalize();
    return new THREE.Quaternion().setFromUnitVectors(FWD, f);
  }

  // Place one avatar hand + controller: wrist target (world), controller orientation (world).
  _pose(side, target, qWorld, rootQinv, withRay) {
    const av = this.exp.avatar;
    av.reach(side, target);
    const dir = FWD.clone().applyQuaternion(qWorld);
    const fingers = dir.clone().addScaledVector(UP, -0.35).normalize();
    const wrist = av.wrist(side);
    av.aimHand(side, wrist.clone().addScaledVector(fingers, 0.1));
    const ctrl = this.controllers[side];
    ctrl.visible = true;
    ctrl.position.copy(this.exp.root.worldToLocal(wrist.clone().addScaledVector(fingers, 0.075)));
    ctrl.quaternion.copy(rootQinv.clone().multiply(qWorld));
    ctrl.updateMatrixWorld(true);
    const origin = ctrl.localToWorld(new THREE.Vector3(0, 0.01, -0.06));
    this.rayVis[side].group.visible = withRay;
    return { origin, dir, side };
  }

  // Draw a ray from its origin to endWorld; the dot marks a hit.
  setRayEnd(side, endWorld, hit) {
    const v = this.rayVis[side];
    const r = this._lastRays[side];
    if (!r) return;
    const root = this.exp.root;
    const a = root.worldToLocal(r.origin.clone()), b = root.worldToLocal(endWorld.clone());
    v.line.geometry.setFromPoints([a, b]);
    v.dot.position.copy(b);
    v.dot.visible = !!hit;
  }

  hideControllers() {
    for (const side of ['Left', 'Right']) { this.controllers[side].visible = false; this.rayVis[side].group.visible = false; }
  }

  update(input, headQuat) {
    const exp = this.exp, av = exp.avatar;
    if (!av.ready) return;
    av.group.updateMatrixWorld(true);
    const root = exp.root;
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const rootQinv = rootQ.clone().invert();
    const Qmap = this._frameRot(rootQinv);
    const sc = av.shoulderCentre(), f = av.forward(), r = av.right();
    const toWorld = (c) => sc.clone().addScaledVector(f, c.fw).addScaledVector(r, c.lat).addScaledVector(UP, c.up);
    const restQ = rootQ.clone().multiply(Qmap).multiply(REST_PITCH);
    this.rays = { left: null, right: null };
    this._lastRays = {};

    if (this.mode === 'static') {
      for (const side of ['Left', 'Right']) this._pose(side, toWorld(this._rest(side)), restQ, rootQinv, false);
      av.setHead(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0, 0)));
      return;
    }

    const lateralSign = this.mode === 'mirror' ? -1 : 1;
    for (const hand of ['left', 'right']) {
      const side = this.avatarSideFor(hand);
      const s = input[hand];
      if (!s || !s.present) { this._pose(side, toWorld(this._rest(side)), restQ, rootQinv, false); continue; }
      if (s.gripDown || !this.zero[hand]) this.calibrate(input, [hand]);
      const d = root.worldToLocal(s.pos.clone()).sub(this.zero[hand]);
      const rest = this._rest(side), g = MAPPING.gain;
      const c = this._constrain(side, { fw: rest.fw - g * d.z, lat: rest.lat + lateralSign * g * d.x, up: rest.up + g * d.y }, sc);
      // Controller orientation in the scene frame, mirrored if needed, rotated into the avatar's frame.
      let qLocal = rootQinv.clone().multiply(s.rayQuat || s.quat || new THREE.Quaternion());
      if (this.mode === 'mirror') qLocal = new THREE.Quaternion(qLocal.x, -qLocal.y, -qLocal.z, qLocal.w);
      const qWorld = rootQ.clone().multiply(Qmap).multiply(qLocal);
      const ray = this._pose(side, toWorld(c), qWorld, rootQinv, this.showRays);
      this.rays[hand] = ray;
      this._lastRays[side] = ray;
      if (this.showRays) this.setRayEnd(side, ray.origin.clone().addScaledVector(ray.dir, 1.2), false);
    }

    const rel = rootQinv.clone().multiply(headQuat.clone());
    let q = Y180.clone().multiply(rel).multiply(Y180.clone().invert());
    if (this.mode === 'mirror') q = new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
    av.setHead(q);
  }
}
