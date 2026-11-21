// Training game: blast cubes with the avatar's controller rays.
// A few cubes sit on the middle/far part of the table, at a distance from the avatar. Point an avatar ray
// at a cube (it lights up) and pull the trigger: the cube bursts and a new one appears elsewhere.
import * as THREE from 'three';
import { TRAINING } from './config.js';

const COLORS = [0xe4572e, 0x3a86ff, 0xf3a712, 0x8cb369, 0xa8329c, 0x2ec4b6];

export class BlastGame {
  constructor(exp, map) {
    this.exp = exp;
    this.map = map;
    this.group = new THREE.Group();
    this.group.visible = false;
    exp.root.add(this.group);
    const s = TRAINING.cubeSize;
    this.cubes = [];
    for (let i = 0; i < TRAINING.activeCubes; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: COLORS[i % COLORS.length], roughness: 0.45 }));
      m.userData = { idx: i, alive: false, spawnT: 0 };
      this.cubes.push(m);
      this.group.add(m);
    }
    this.fragGeo = new THREE.BoxGeometry(1, 1, 1);
    this.frags = [];
    this.flashes = [];
    this.raycaster = new THREE.Raycaster();
    this.events = [];
    this.rng = Math.random;
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
    this.hits = 0; this.shots = 0;
    this.group.visible = true;
    this.map.showRays = true;
    for (const c of this.cubes) c.userData.alive = false;
    for (const c of this.cubes) this._spawn(c, now);
    this._log(now, 'start', { seconds });
  }

  stop(now) {
    this.group.visible = false;
    this.map.showRays = false;
    for (const fr of this.frags) this.group.remove(fr.mesh);
    for (const fl of this.flashes) this.group.remove(fl.mesh);
    this.frags = []; this.flashes = [];
    this._log(now, 'stop', { hits: this.hits, shots: this.shots });
    this.exp.hideHud();
  }

  // New random position on the table, at a distance from the avatar, not on top of another cube.
  _spawn(c, now) {
    const { f, r, sc } = this._frame();
    const P = this.exp.P, half = 0.42, s = TRAINING.cubeSize;
    const [fwMin, fwMax] = TRAINING.spawnForward, latMax = TRAINING.spawnLateral;
    let p = null;
    for (let k = 0; k < 40 && !p; k++) {
      const fw = fwMin + this.rng() * (fwMax - fwMin), lat = (this.rng() * 2 - 1) * latMax;
      const q = new THREE.Vector3(sc.x, 0, sc.z).addScaledVector(f, fw).addScaledVector(r, lat);
      if (Math.abs(q.x - P.x) > half || Math.abs(q.z - P.z) > half) continue;
      if (this.cubes.some((o) => o !== c && o.userData.alive && Math.hypot(o.position.x - q.x, o.position.z - q.z) < 0.16)) continue;
      p = q;
    }
    if (!p) p = new THREE.Vector3(P.x, 0, P.z);
    c.position.set(p.x, this.exp.tableY + s / 2, p.z);
    c.rotation.set(0, this.rng() * Math.PI, 0);
    c.visible = true;
    c.userData.alive = true;
    c.userData.spawnT = now;
    c.userData.respawnAt = null;
    c.material.emissive.setHex(0x000000);
    this._log(now, 'spawn', { cube: c.userData.idx, x: +p.x.toFixed(3), z: +p.z.toFixed(3) });
  }

  _burst(c, now) {
    const s = TRAINING.cubeSize, color = c.material.color.getHex();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.fragGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }));
      m.scale.setScalar(s * (0.18 + this.rng() * 0.22));
      m.position.copy(c.position).add(new THREE.Vector3((this.rng() - 0.5) * s, (this.rng() - 0.5) * s, (this.rng() - 0.5) * s));
      const v = new THREE.Vector3(this.rng() - 0.5, 0.6 + this.rng() * 0.8, this.rng() - 0.5).normalize().multiplyScalar(0.6 + this.rng() * 0.9);
      const spin = new THREE.Vector3(this.rng() * 12 - 6, this.rng() * 12 - 6, this.rng() * 12 - 6);
      this.group.add(m);
      this.frags.push({ mesh: m, v, spin, t0: now });
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.8 }));
    flash.position.copy(c.position);
    flash.scale.setScalar(s * 0.5);
    this.group.add(flash);
    this.flashes.push({ mesh: flash, t0: now });
  }

  _animate(now, dt) {
    const sec = dt / 1000, floorY = this.exp.tableY;
    this.frags = this.frags.filter((fr) => {
      const age = now - fr.t0;
      if (age > 900) { this.group.remove(fr.mesh); fr.mesh.material.dispose(); return false; }
      fr.v.y -= 3.0 * sec;
      fr.mesh.position.addScaledVector(fr.v, sec);
      if (fr.mesh.position.y < floorY + 0.005) { fr.mesh.position.y = floorY + 0.005; fr.v.multiplyScalar(0.4); fr.v.y = Math.abs(fr.v.y) * 0.3; }
      fr.mesh.rotation.x += fr.spin.x * sec; fr.mesh.rotation.y += fr.spin.y * sec; fr.mesh.rotation.z += fr.spin.z * sec;
      fr.mesh.material.opacity = Math.max(0, 1 - age / 900);
      return true;
    });
    this.flashes = this.flashes.filter((fl) => {
      const age = now - fl.t0;
      if (age > 250) { this.group.remove(fl.mesh); return false; }
      fl.mesh.scale.setScalar(TRAINING.cubeSize * (0.5 + age / 120));
      fl.mesh.material.opacity = 0.8 * (1 - age / 250);
      return true;
    });
  }

  update(now, input) {
    if (!this.group.visible) return false;
    const dt = this._lastT ? Math.min(now - this._lastT, 50) : 16; this._lastT = now;
    const root = this.exp.root;
    const rootQinv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const alive = this.cubes.filter((c) => c.userData.alive);
    for (const c of alive) c.material.emissive.setHex(0x000000);

    for (const hand of ['left', 'right']) {
      const s = input[hand], ray = this.map.rays[hand];
      if (!s || !s.present || !ray) continue;
      const o = root.worldToLocal(ray.origin.clone());
      const d = ray.dir.clone().applyQuaternion(rootQinv).normalize();
      this.raycaster.set(o, d);
      const hit = this.raycaster.intersectObjects(alive.filter((c) => c.userData.alive), false)[0];
      if (hit) {
        hit.object.material.emissive.setHex(0x444444);
        this.map.setRayEnd(ray.side, root.localToWorld(hit.point.clone()), true);
      } else {
        const th = this._tableHit(o, d);
        this.map.setRayEnd(ray.side, th ? root.localToWorld(th) : ray.origin.clone().addScaledVector(ray.dir, 1.5), !!th);
      }
      if (s.triggerDown) {
        this.shots++;
        if (hit) {
          const c = hit.object;
          c.userData.alive = false;
          c.visible = false;
          c.userData.respawnAt = now + TRAINING.respawnMs;
          this.hits++;
          this._burst(c, now);
          this._log(now, 'hit', { hand, cube: c.userData.idx, timeToHitMs: Math.round(now - c.userData.spawnT) });
        } else {
          this._log(now, 'miss', { hand });
        }
      }
    }
    for (const c of this.cubes) if (!c.userData.alive && c.userData.respawnAt && now >= c.userData.respawnAt) this._spawn(c, now);
    this._animate(now, dt);
    const left = Math.max(0, Math.ceil((this.endTime - now) / 1000));
    this.exp.setHudThrottled(`פיצוצים: ${this.hits}   ·   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    return now >= this.endTime;
  }

  _tableHit(o, d) {
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (this.exp.tableY - o.y) / d.y;
    if (t <= 0 || t > 3) return null;
    const p = o.clone().addScaledVector(d, t), P = this.exp.P;
    return Math.abs(p.x - P.x) <= 0.5 && Math.abs(p.z - P.z) <= 0.5 ? p : null;
  }

  _log(now, event, data) {
    this.events.push({ tMs: Math.round(now), label: this.label, event, data: JSON.stringify(data) });
  }
}
