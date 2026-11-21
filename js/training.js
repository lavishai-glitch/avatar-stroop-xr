// Training game: build towers of cubes on the pad in front of the avatar, using the avatar's hands.
// Trigger = grab with the avatar hand that this controller drives; release over the tower to stack.
import * as THREE from 'three';
import { TRAINING } from './config.js';

const COLORS = [0xe4572e, 0x29335c, 0xf3a712, 0x669bbc, 0x8cb369, 0xa8329c, 0x2ec4b6];

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
    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x335577, roughness: 0.4 }));
    this.group.add(this.pad);
    this.events = [];
  }

  // Avatar-frame directions in the scene (root) frame.
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
    this.startTime = now;
    this.towers = 0; this.grabs = 0; this.drops = 0;
    this.held = {};
    this.group.visible = true;
    this._layout(now);
    this._log(now, 'start', { seconds });
  }

  stop(now) {
    this.group.visible = false;
    this.held = {};
    this._log(now, 'stop', { towers: this.towers, grabs: this.grabs, drops: this.drops });
    this.exp.hideHud();
  }

  _layout(now) {
    const { f, r, sc } = this._frame();
    const y0 = this.exp.tableY;
    const s = TRAINING.cubeSize;
    const base = new THREE.Vector3(sc.x, y0, sc.z);
    this.padPos = base.clone().addScaledVector(f, 0.36);
    this.pad.position.set(this.padPos.x, y0 + 0.003, this.padPos.z);
    this.tower = [];
    // [forward, lateral] from the shoulders, all within the avatar's reach (~0.45 m at table level)
    const spots = [[0.24, -0.2], [0.34, -0.25], [0.44, -0.11], [0.44, 0.11], [0.34, 0.25], [0.24, 0.2], [0.2, 0]];
    this.cubes.forEach((c, i) => {
      const [fw, lat] = spots[i % spots.length];
      const p = base.clone().addScaledVector(f, fw).addScaledVector(r, lat);
      c.position.set(p.x, y0 + s / 2, p.z);
      c.rotation.set(0, (i * 0.7) % 1.2, 0);
      c.userData.state = 'free';
      c.visible = true;
    });
    this.resetAt = null;
  }

  _towerTopY() { return this.exp.tableY + this.tower.length * TRAINING.cubeSize; }

  update(now, input) {
    if (!this.group.visible) return false;
    const av = this.exp.avatar;
    for (const hand of ['left', 'right']) {
      const s = input[hand];
      if (!s || !s.present) continue;
      const side = this.map.avatarSideFor(hand);
      const hp = this.exp.root.worldToLocal(av.handPoint(side));
      const held = this.held[hand];
      if (s.triggerDown && !held) {
        let best = null, bestD = TRAINING.grabRadius;
        for (const c of this.cubes) {
          if (c.userData.state !== 'free' || !c.visible) continue;
          const d = c.position.distanceTo(hp);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (best) { best.userData.state = 'held'; this.held[hand] = best; this.grabs++; this._log(now, 'grab', { hand, cube: best.userData.idx }); }
      }
      if (held) {
        held.position.copy(hp);
        if (s.triggerUp || !s.trigger) this._release(now, hand, held);
      }
    }
    if (this.resetAt && now >= this.resetAt) this._layout(now);
    const left = Math.max(0, Math.ceil((this.endTime - now) / 1000));
    this.exp.setHudThrottled?.(`מגדלים: ${this.towers}   ·   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    return now >= this.endTime;
  }

  _release(now, hand, c) {
    delete this.held[hand];
    const s = TRAINING.cubeSize;
    const dx = c.position.x - this.padPos.x, dz = c.position.z - this.padPos.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz <= TRAINING.snapRadius && c.position.y >= this._towerTopY() - s * 0.25) {
      c.position.set(this.padPos.x, this._towerTopY() + s / 2, this.padPos.z);
      c.rotation.set(0, 0, 0);
      c.userData.state = 'stacked';
      this.tower.push(c);
      this._log(now, 'stack', { hand, cube: c.userData.idx, height: this.tower.length });
      if (this.tower.length === TRAINING.cubesPerTower) {
        this.towers++;
        this._log(now, 'tower', { towers: this.towers });
        this.resetAt = now + 900;
      }
    } else {
      // Fall to the table, clamped to the table edges.
      const P = this.exp.P, h = this.exp.constructor.TABLE_HALF ?? 0.46;
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
