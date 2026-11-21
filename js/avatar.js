// Rigged human avatar (Mixamo skeleton) posed seated, with two-bone arm IK and head rotation.
// Avatar-local frame: facing +Z, floor at y = 0, its own left = +X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// Rotate `bone` so that the direction to `child` points at `target` (world space).
function aim(bone, child, target) {
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(false, false);
  const pb = bone.getWorldPosition(_v1.clone());
  const pc = child.getWorldPosition(_v2.clone());
  const cur = pc.sub(pb).normalize();
  const des = target.clone().sub(pb).normalize();
  if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
  const dq = new THREE.Quaternion().setFromUnitVectors(cur, des);
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.invert().multiply(dq.multiply(worldQ)));
  bone.updateWorldMatrix(false, true);
}


export class Avatar {
  constructor() {
    this.group = new THREE.Group();
    this.ready = false;
  }

  async load(spec) {
    const gltf = await new GLTFLoader().loadAsync(spec.file);
    const model = gltf.scene;
    if (this.model) this.group.remove(this.model);
    if (this.chair) this.group.remove(this.chair);
    // Pose in the group's own frame: park the group at the origin while setting up.
    const savedPos = this.group.position.clone(), savedRot = this.group.rotation.clone();
    this.group.position.set(0, 0, 0); this.group.rotation.set(0, 0, 0);
    this.group.updateMatrixWorld(true);
    this.model = model;
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
    this.group.add(model);
    // Bone names: Mixamo ('mixamorig:X', which GLTFLoader turns into 'mixamorigX') or plain ('X').
    const pre = spec.prefix ?? 'mixamorig';
    const bone = (n) => model.getObjectByName(pre + n);
    const B = (side, part) => `${side}${part}`;
    this.b = {
      hips: bone('Hips'), spine: bone('Spine'), spine2: bone('Spine2'),
      head: bone('Head'), headTop: bone('HeadTop_End'),
    };
    for (const s of ['Left', 'Right']) {
      this.b[s] = {
        arm: bone(B(s, 'Arm')), fore: bone(B(s, 'ForeArm')), hand: bone(B(s, 'Hand')),
        handTip: bone(B(s, 'HandMiddle1')) || bone(B(s, 'Hand')),
        up: bone(B(s, 'UpLeg')), leg: bone(B(s, 'Leg')), foot: bone(B(s, 'Foot')), toe: bone(B(s, 'ToeBase')),
        fingers: ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].map((f) => [1, 2, 3].map((k) => bone(B(s, `Hand${f}${k}`)))),
      };
    }

    // Scale to the requested standing height (head top to lowest foot), then face +Z.
    model.updateMatrixWorld(true);
    const top = this.b.headTop.getWorldPosition(new THREE.Vector3()).y;
    const foot = Math.min(this.b.Left.foot.getWorldPosition(new THREE.Vector3()).y, this.b.Right.foot.getWorldPosition(new THREE.Vector3()).y);
    model.scale.multiplyScalar(spec.height / ((top - foot) + 0.08));
    model.updateMatrixWorld(true);
    const lx = this.b.Left.arm.getWorldPosition(new THREE.Vector3()).x;
    const rx = this.b.Right.arm.getWorldPosition(new THREE.Vector3()).x;
    if (lx < rx) model.rotation.y = Math.PI; // make its own left = +X, i.e. facing +Z
    model.updateMatrixWorld(true);

    this._sit();
    this._buildChair();
    this._setupGrip();

    // Segment lengths for IK
    this.len = {};
    for (const s of ['Left', 'Right']) {
      const a = this.b[s].arm.getWorldPosition(new THREE.Vector3());
      const f = this.b[s].fore.getWorldPosition(new THREE.Vector3());
      const h = this.b[s].hand.getWorldPosition(new THREE.Vector3());
      this.len[s] = { upper: a.distanceTo(f), lower: f.distanceTo(h) };
    }
    // Head rest orientation relative to the avatar group
    this.group.updateMatrixWorld(true);
    this.headRestQ = this.group.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(this.b.head.getWorldQuaternion(new THREE.Quaternion()));
    this.group.position.copy(savedPos); this.group.rotation.copy(savedRot);
    this.group.updateMatrixWorld(true);
    this.ready = true;
    this.restPose();
    return this;
  }

  _sit() {
    const m = this.model;
    m.updateMatrixWorld(true);
    // Slight forward lean
    this.b.spine.rotation.x += 0.12;
    for (const s of ['Left', 'Right']) {
      const L = this.b[s];
      const H = L.up.getWorldPosition(new THREE.Vector3());
      const K0 = L.leg.getWorldPosition(new THREE.Vector3());
      const F0 = L.foot.getWorldPosition(new THREE.Vector3());
      const thigh = H.distanceTo(K0), shin = K0.distanceTo(F0);
      const knee = H.clone().add(new THREE.Vector3(0, 0.02, thigh));
      aim(L.up, L.leg, knee);
      const footT = knee.clone().add(new THREE.Vector3(0, -shin, 0.04));
      aim(L.leg, L.foot, footT);
      if (L.toe) aim(L.foot, L.toe, L.foot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.05, 0.12)));
    }
    m.updateMatrixWorld(true);
    // Lower the body so the thighs rest on a 0.46 m seat
    const hy = this.b.Left.up.getWorldPosition(new THREE.Vector3()).y;
    m.position.y -= hy - 0.53;
    m.updateMatrixWorld(true);
  }

  _buildChair() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d3328, roughness: 0.8 });
    const hips = this.b.hips.getWorldPosition(new THREE.Vector3());
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.46), mat);
    seat.position.set(0, 0.44, 0.08);
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.04), mat);
    back.position.set(0, 0.72, -0.17);
    chair.add(back);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.44, 0.03), mat);
      l.position.set(x * 0.21, 0.22, 0.08 + z * 0.21);
      chair.add(l);
    }
    chair.position.set(hips.x, 0, hips.z);
    this.group.add(chair);
    this.chair = chair;
  }

  // World-space helpers
  forward() { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())); }
  right() { return new THREE.Vector3(-1, 0, 0).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())); }
  shoulderCentre() {
    const a = this.b.Left.arm.getWorldPosition(new THREE.Vector3());
    return a.add(this.b.Right.arm.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  }
  // Point between palm and fingers, used for grabbing.
  handPoint(side) {
    const L = this.b[side];
    const h = L.hand.getWorldPosition(new THREE.Vector3());
    const t = L.handTip.getWorldPosition(new THREE.Vector3());
    return h.lerp(t, 0.8);
  }

  // Two-bone IK: shoulder -> elbow -> wrist to `target` (world).
  reach(side, target) {
    const L = this.b[side], len = this.len[side];
    const S = L.arm.getWorldPosition(new THREE.Vector3());
    const toT = target.clone().sub(S);
    const maxD = (len.upper + len.lower) * 0.995;
    const D = Math.min(Math.max(toT.length(), 0.05), maxD);
    const dir = toT.normalize();
    const T = S.clone().addScaledVector(dir, D);
    const a = (len.upper * len.upper - len.lower * len.lower + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(len.upper * len.upper - a * a, 0));
    // Elbow points down, out and slightly back
    const out = side === 'Left' ? 1 : -1;
    const gq = this.group.getWorldQuaternion(new THREE.Quaternion());
    const pole = new THREE.Vector3(out * 0.6, -1, -0.3).applyQuaternion(gq);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    aim(L.arm, L.fore, E);
    aim(L.fore, L.hand, T);
  }

  // Measure each hand's frame in the bind pose (palms down) and curl the fingers into a grip.
  // Hand frame: F = wrist -> middle knuckle, S = pinky knuckle -> index knuckle (thumb side), P = palm normal.
  _setupGrip() {
    this.model.updateMatrixWorld(true);
    this.grip = {};
    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    for (const side of ['Left', 'Right']) {
      const L = this.b[side];
      const [idx, mid, , pinky, thumb] = L.fingers;
      if (!idx[0] || !mid[0] || !pinky[0]) continue;
      const W = wp(L.hand);
      const F = wp(mid[0]).sub(W).normalize();
      const S = wp(idx[0]).sub(wp(pinky[0]));
      S.addScaledVector(F, -S.dot(F)).normalize();
      const N = new THREE.Vector3().crossVectors(F, S);
      const sigma = N.y < 0 ? 1 : -1;             // bind pose has palms facing down
      const P = N.clone().multiplyScalar(sigma);
      const inv = L.hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.grip[side] = { sigma, Fl: F.clone().applyQuaternion(inv), Sl: S.clone().applyQuaternion(inv), Pl: P.clone().applyQuaternion(inv) };

      // Curl: rotate each phalanx toward the palm about the axis F x P.
      const curl = (bonesArr, angles, axisFn) => {
        bonesArr.forEach((b, i) => {
          if (!b) return;
          b.updateWorldMatrix(true, false);
          const q = new THREE.Quaternion().setFromAxisAngle(axisFn(), angles[i]);
          const wq = b.getWorldQuaternion(new THREE.Quaternion());
          const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
          b.quaternion.copy(pq.multiply(q.multiply(wq)));
          b.updateWorldMatrix(false, true);
        });
      };
      const fingerAxis = () => new THREE.Vector3().crossVectors(F, P).normalize();
      for (const chain of [idx, mid, L.fingers[2], pinky]) curl(chain, [1.05, 1.25, 0.8], fingerAxis);
      if (thumb[0]) {
        const tdir = wp(thumb[1] || thumb[0]).sub(wp(thumb[0])).normalize();
        curl(thumb, [0.25, 0.45, 0.35], () => new THREE.Vector3().crossVectors(tdir, P).normalize());
      }
    }
  }

  // Desired hand frame for holding a controller whose pointing direction is -Z of qCtrl (world):
  // knuckles forward and a little down, thumb side up and slightly forward.
  handFrame(side, qCtrl) {
    const g = this.grip[side];
    const F = new THREE.Vector3(0, -0.3, -1).normalize().applyQuaternion(qCtrl);
    const S = new THREE.Vector3(0, 1, -0.35).applyQuaternion(qCtrl);
    S.addScaledVector(F, -S.dot(F)).normalize();
    const P = new THREE.Vector3().crossVectors(F, S).multiplyScalar(g ? g.sigma : 1);
    return { F, S, P };
  }

  // Turn the hand to hold a controller oriented qCtrl; returns the palm centre (world).
  gripHand(side, qCtrl) {
    const g = this.grip[side], L = this.b[side];
    const { F, S, P } = this.handFrame(side, qCtrl);
    if (g) {
      const Ml = new THREE.Matrix4().makeBasis(g.Fl, g.Sl, g.Pl);
      const Md = new THREE.Matrix4().makeBasis(F, S, P);
      const R = Md.multiply(Ml.transpose());
      const wq = new THREE.Quaternion().setFromRotationMatrix(R);
      const pq = L.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      L.hand.quaternion.copy(pq.multiply(wq));
      L.hand.updateWorldMatrix(false, true);
    }
    return this.wrist(side).addScaledVector(F, 0.07).addScaledVector(P, 0.035);
  }

  // Point the hand (wrist -> fingers) at a world target.
  aimHand(side, target) {
    const L = this.b[side];
    if (L.handTip !== L.hand) aim(L.hand, L.handTip, target);
  }

  wrist(side) { return this.b[side].hand.getWorldPosition(new THREE.Vector3()); }

  // relQ: head rotation in the avatar's convention (identity = looking along its forward).
  setHead(relQ) {
    const gq = this.group.getWorldQuaternion(new THREE.Quaternion());
    const desired = gq.multiply(relQ.clone()).multiply(this.headRestQ);
    const parentQ = this.b.head.parent.getWorldQuaternion(new THREE.Quaternion());
    this.b.head.quaternion.copy(parentQ.invert().multiply(desired));
    this.b.head.updateWorldMatrix(false, true);
  }

  // One hand resting on the table in front of the avatar (world tableY).
  restArm(side, tableY) {
    const sc = this.shoulderCentre(), f = this.forward(), r = this.right();
    const sgn = side === 'Right' ? 1 : -1;
    // Wrist 9 cm above the table so the hand and fingers stay above the surface.
    const t = sc.clone().addScaledVector(f, 0.36).addScaledVector(r, sgn * 0.17);
    t.y = tableY !== undefined ? tableY + 0.09 : sc.y - 0.26;
    this.reach(side, t);
  }

  // Both hands resting on the table, head tilted toward the table.
  restPose(tableY) {
    if (!this.ready) return;
    this.group.updateMatrixWorld(true);
    this.restArm('Left', tableY);
    this.restArm('Right', tableY);
    this.setHead(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0, 0)));
  }
}
