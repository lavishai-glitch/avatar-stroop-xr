// A seated mannequin built from primitives. Local frame: floor at y = 0, facing +Z,
// hands resting at y = 0.74 about 0.45 m in front. Replace with a rigged model for the training phase.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function limb(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 6, 12), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}

export function makeAvatar() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a68a, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4a6b8a, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.9 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x3d3328, roughness: 0.8 });

  // Chair
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), chairMat);
  seat.position.set(0, 0.43, 0);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), chairMat);
  back.position.set(0, 0.7, -0.21);
  g.add(back);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.43, 0.03), chairMat);
    l.position.set(x * 0.19, 0.215, z * 0.19);
    g.add(l);
  }

  // Legs (thighs forward, shins down)
  for (const sx of [-1, 1]) {
    g.add(limb([sx * 0.1, 0.5, 0], [sx * 0.1, 0.5, 0.42], 0.065, pants));
    g.add(limb([sx * 0.1, 0.5, 0.42], [sx * 0.1, 0.05, 0.45], 0.05, pants));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), pants);
    foot.position.set(sx * 0.1, 0.025, 0.52);
    g.add(foot);
  }

  // Torso, neck, head
  g.add(limb([0, 0.52, -0.02], [0, 1.0, -0.02], 0.16, shirt));
  g.add(limb([0, 1.0, -0.01], [0, 1.17, 0], 0.05, skin));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), skin);
  head.position.set(0, 1.23, 0.01);
  head.scale.set(0.9, 1.1, 1);
  g.add(head);
  // Face direction cues: nose and eyes
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 12), skin);
  nose.position.set(0, 1.22, 0.115);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), eyeMat);
    eye.position.set(sx * 0.035, 1.255, 0.095);
    g.add(eye);
  }

  // Arms: shoulder -> elbow -> hand resting on the table
  const hands = {};
  for (const sx of [-1, 1]) {
    const sh = [sx * 0.21, 1.0, -0.02], el = [sx * 0.25, 0.8, 0.18], wr = [sx * 0.16, 0.76, 0.42];
    g.add(limb(sh, el, 0.045, shirt));
    g.add(limb(el, wr, 0.038, skin));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.1), skin);
    hand.position.set(sx * 0.15, 0.75, 0.47);
    g.add(hand);
    hands[sx > 0 ? 'left' : 'right'] = hand; // mannequin faces +Z, so its own left is +X
  }
  g.userData.hands = hands;
  return g;
}
