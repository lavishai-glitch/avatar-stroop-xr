// Training game: build towers of cubes on the pad, at a distance from the avatar, using rays from the
// avatar's controllers (Quest-style distance grab). Point the ray at a cube, hold the trigger: the cube
// follows the point where the ray meets the table. Release it over the pad to stack it.
import * as THREE from 'three';
import { TRAINING } from './config.js';

const COLORS = [0xe4572e, 0x29335c, 0xf3a712, 0x669bbc, 0x8cb369, 0xa8329c, 0x2ec4b6];
// Cube spots in the avatar's frame [forward, lateral] from its shoulders: on the middle/far part of the table.
const SPOTS = [[0.5, -0.3], [0.85, -0.36], [1.1, -0.2], [1.1, 0.2], [0.85, 0.36], [0.5, 0.3]];

export class TowerGame {
  constructor(exp, map) {
    this.exp = exp;
    this.map = map;
    this.group = new THREE.Group();
    this.group.visible = false;
    exp.root.add(this.group);
    const s = TRAINING.cubeSize;
    this.cubes = [];
    for (let i = 0; i < TRAINING.cubesPerTower; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: COLORS[i % COLORS.length], roughness: 0.5 }));
      m.userData = { idx: i, state: 'free' };
      this.cubes.push(m);
      this.group.add(m);
    }
    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.006, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x335577, roughness: 0.4 }));
    this.group.add(this.pad);
    this.raycaster = new THREE.Raycaster();
    this.events = [];
  }

  _frame() {
    const rootQinv = this.exp.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const av = this.exp.avatar;
    const f = av.forward().applyQuaternion(rootQinv); f.y = 0; f.normalize();
    const r = av.right().applyQuaternion(rootQinv); r.y = 0; r.normalize();
    const sc = this.exp.root.worldToLocal(av.shoulderCentre());
    return { f, r, sc };
  }

  start(seconds, now, label) {
    this.label = label;
    this.endTime = now + seconds * 1000;
    this.towers = 0; this.grabs = 0; this.drops = 0;
    this.held = {};
    this.group.visible = true;
    this.map.showRays = true;
    this._layout();
    this._log(now, 'start', { seconds });
  }

  stop(now) {
    this.group.visible = false;
    this.map.showRays = false;
    this.held = {};
    this._log(now, 'stop', { towers: this.towers, grabs: this.grabs, drops: this.drops });
    this.exp.hideHud();
  }

  _layout() {
    const { f, r, sc } = this._frame();
    const y0 = this.exp.tableY, s = TRAINING.cubeSize;
    const P = this.exp.P;
    this.padPos = new THREE.Vector3(P.x, y0, P.z);           // pad at the table centre
    this.pad.position.set(P.x, y0 + 0.003, P.z);
    this.tower = [];
    const base = new THREE.Vector3(sc.x, y0, sc.z);
    this.cubes.forEach((c, i) => {
      const [fw, lat] = SPOTS[i % SPOTS.length];
      const p = base.clone().addScaledVector(f, fw).addScaledVector(r, lat);
      c.position.set(p.x, y0 + s / 2, p.z);
      c.rotation.set(0, (i * 0.7) % 1.2, 0);
      c.userData.state = 'free';
      c.material.emissive.setHex(0x000000);
    });
    this.resetAt = null;
  }

  _towerTopY() { return this.exp.tableY + this.tower.length * TRAINING.cubeSize; }

  // Where a ray meets the table top (scene frame), or null.
  _tableHit(o, d) {
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (this.exp.tableY - o.y) / d.y;
    if (t <= 0 || t > 3) return null;
    const p = o.clone().addScaledVector(d, t), P = this.exp.P;
    return Math.abs(p.x - P.x) <= 0.5 && Math.abs(p.z - P.z) <= 0.5 ? p : null;
  }

  update(now, input) {
    if (!this.group.visible) return false;
    const root = this.exp.root;
    const rootQinv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const c of this.cubes) if (c.userData.state === 'free') c.material.emissive.setHex(0x000000);

    for (const hand of ['left', 'right']) {
      const s = input[hand], ray = this.map.rays[hand];
      if (!s || !s.present || !ray) continue;
      const o = root.worldToLocal(ray.origin.clone());
      const d = ray.dir.clone().applyQuaternion(rootQinv).normalize();
      const held = this.held[hand];

      if (held) {
        // The held cube follows the point where the ray meets the table (lifted a little), or the tower
        // top when over the pad; off the table it stays on the ray at its grab distance.
        const th = this._tableHit(o, d), sz = TRAINING.cubeSize;
        if (th) {
          const overPad = Math.hypot(th.x - this.padPos.x, th.z - this.padPos.z) <= TRAINING.snapRadius;
          held.cube.position.set(th.x, (overPad ? this._towerTopY() : this.exp.tableY) + sz / 2 + 0.04, th.z);
          this.map.setRayEnd(ray.side, root.localToWorld(th.clone()), true);
        } else {
          held.cube.position.copy(o).addScaledVector(d, held.dist);
          this.map.setRayEnd(ray.side, ray.origin.clone().addScaledVector(ray.dir, held.dist), true);
        }
        if (!s.trigger) this._release(now, hand, held.cube);
        continue;
      }

      // Hover: nearest free cube hit by the ray
      this.raycaster.set(o, d);
      const free = this.cubes.filter((c) => c.userData.state === 'free');
      const hit = this.raycaster.intersectObjects(free, false)[0];
      if (hit) {
        hit.object.material.emissive.setHex(0x333333);
        this.map.setRayEnd(ray.side, root.localToWorld(hit.point.clone()), true);
        if (s.triggerDown) {
          const c = hit.object;
          c.userData.state = 'held';
          this.held[hand] = { cube: c, dist: c.position.distanceTo(o) };
          this.grabs++;
          this._log(now, 'grab', { hand, cube: c.userData.idx });
        }
      } else {
        const th = this._tableHit(o, d);
        if (th) this.map.setRayEnd(ray.side, root.localToWorld(th), true);
      }
    }
    if (this.resetAt && now >= this.resetAt) this._layout();
    const left = Math.max(0, Math.ceil((this.endTime - now) / 1000));
    this.exp.setHudThrottled(`מגדלים: ${this.towers}   ·   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    return now >= this.endTime;
  }

  _release(now, hand, c) {
    delete this.held[hand];
    const s = TRAINING.cubeSize;
    const horiz = Math.hypot(c.position.x - this.padPos.x, c.position.z - this.padPos.z);
    if (horiz <= TRAINING.snapRadius) {
      c.position.set(this.padPos.x, this._towerTopY() + s / 2, this.padPos.z);
      c.rotation.set(0, 0, 0);
      c.userData.state = 'stacked';
      c.material.emissive.setHex(0x000000);
      this.tower.push(c);
      this._log(now, 'stack', { hand, cube: c.userData.idx, height: this.tower.length });
      if (this.tower.length === TRAINING.cubesPerTower) {
        this.towers++;
        this._log(now, 'tower', { towers: this.towers });
        this.resetAt = now + 900;
      }
    } else {
      const P = this.exp.P, h = 0.46;
      c.position.x = Math.min(Math.max(c.position.x, P.x - h), P.x + h);
      c.position.z = Math.min(Math.max(c.position.z, P.z - h), P.z + h);
      c.position.y = this.exp.tableY + s / 2;
      c.userData.state = 'free';
      this.drops++;
      this._log(now, 'drop', { hand, cube: c.userData.idx });
    }
  }

  _log(now, event, data) {
    this.events.push({ tMs: Math.round(now), label: this.label, event, data: JSON.stringify(data) });
  }
}
