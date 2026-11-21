// Static scene (room, table), avatar placement, stimulus cube, instruction panel and HUD.
import * as THREE from 'three';
import { GEOM, WORDS } from './config.js';
import { Avatar } from './avatar.js';

export class ExperimentScene {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); // scene frame: participant at origin facing -Z
    scene.add(this.root);
    this.tableY = 0.72;
    this.side = 'R';
    this.avatar = new Avatar();
    this.root.add(this.avatar.group);
    this._build();
  }

  async loadAvatar(spec) {
    await this.avatar.load(spec);
    this.setAvatarSide(this.side);
  }

  _build() {
    const s = this.scene;
    s.background = new THREE.Color(0x2b2e33);
    s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.3));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(1, 3, 2);
    s.add(dir);
    const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat(0x55585e));
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);
    const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b6f76, side: THREE.BackSide, roughness: 1 }));
    room.position.set(0, 1.5, -1.0);
    this.root.add(room);

    this.table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(GEOM.tableSize, 0.03, GEOM.tableSize), mat(0x8a6f52, 0.6));
    top.position.y = -0.015;
    this.table.add(top);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), mat(0x5c4a37));
      leg.position.set(x * (GEOM.tableSize / 2 - 0.05), -0.5, z * (GEOM.tableSize / 2 - 0.05));
      this.table.add(leg);
    }
    this.root.add(this.table);

    this.fixation = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.fixation.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), fm));
    this.fixation.add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), fm));
    this.fixation.visible = false;
    this.root.add(this.fixation);

    // Stimulus cube: the same word on all six faces.
    this.wordMats = {};
    for (const [k, w] of Object.entries(WORDS)) this.wordMats[k] = new THREE.MeshStandardMaterial({ map: wordTexture(w), roughness: 0.7 });
    this.stim = new THREE.Mesh(new THREE.BoxGeometry(GEOM.stimCube, GEOM.stimCube, GEOM.stimCube), this.wordMats.neutral);
    this.stim.visible = false;
    this.root.add(this.stim);

    // Instruction panel and HUD (canvas textures)
    this.panel = canvasPlane(1024, 512, 1.0, 0.5);
    this.root.add(this.panel.mesh);
    this.hud = canvasPlane(1024, 160, 0.6, 0.094);
    this.hud.mesh.visible = false;
    this.root.add(this.hud.mesh);

    this.setTableHeight(this.tableY);
  }

  get P() { return new THREE.Vector3(0, this.tableY, -GEOM.tableDist); }

  setTableHeight(y) {
    this.tableY = y;
    this.table.position.copy(this.P);
    this.fixation.position.set(0, y + GEOM.fixAboveTable, -GEOM.tableDist);
    this.panel.mesh.position.set(0, y + 0.6, -GEOM.tableDist - 0.35);
    this.hud.mesh.position.set(0, y + 0.42, -GEOM.tableDist - 0.45);
    this.setAvatarSide(this.side);
  }

  setAvatarSide(side) {
    this.side = side;
    const sx = side === 'R' ? 1 : -1;
    const g = this.avatar.group;
    // Avatar floor sits 0.72 m below the table top (standard table height).
    g.position.set(sx * GEOM.avatarOffset, this.tableY - 0.72, -GEOM.tableDist);
    g.rotation.y = side === 'R' ? -Math.PI / 2 : Math.PI / 2; // faces the table centre
    g.updateMatrixWorld(true);
  }

  // Stimulus position (scene frame) for 'near' / 'far' relative to the avatar.
  stimPosition(pos) {
    const sx = this.side === 'R' ? 1 : -1;
    const d = pos === 'near' ? GEOM.stimOffset : -GEOM.stimOffset;
    return new THREE.Vector3(sx * d, this.tableY + GEOM.stimLift + GEOM.stimCube / 2, -GEOM.tableDist);
  }

  showStim(pos, word) {
    this.stim.material = this.wordMats[word];
    this.stim.position.copy(this.stimPosition(pos));
    this.stim.visible = true;
  }
  hideStim() { this.stim.visible = false; }

  faceCamera(cameraWorldPos) {
    for (const m of [this.panel.mesh, this.hud.mesh]) {
      const p = this.root.worldToLocal(cameraWorldPos.clone());
      p.y = m.position.y;
      m.lookAt(this.root.localToWorld(p));
    }
  }

  setPanel(lines, visible = true) {
    drawLines(this.panel, lines, 60, 42);
    this.panel.mesh.visible = visible;
  }
  hidePanel() { this.panel.mesh.visible = false; }
  setHud(text) {
    drawLines(this.hud, [text], 76, 76);
    this.hud.mesh.visible = true;
  }
  hideHud() { this.hud.mesh.visible = false; this._hudText = null; }
  setHudThrottled(text) { if (text !== this._hudText) { this._hudText = text; this.setHud(text); } }

  calibrate(headPos, headQuat, tableBelowEye) {
    const e = new THREE.Euler().setFromQuaternion(headQuat, 'YXZ');
    this.root.position.set(headPos.x, 0, headPos.z);
    this.root.rotation.set(0, e.y, 0);
    this.root.updateMatrixWorld(true);
    this.eyeY = headPos.y;
    this.setTableHeight(headPos.y - tableBelowEye);
  }
}

function canvasPlane(w, h, mw, mh) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex }));
  return { canvas, tex, mesh };
}

function drawLines(p, lines, firstSize, size) {
  const c = p.canvas.getContext('2d');
  c.fillStyle = '#1e2126'; c.fillRect(0, 0, p.canvas.width, p.canvas.height);
  c.strokeStyle = '#8a8f99'; c.lineWidth = 6; c.strokeRect(3, 3, p.canvas.width - 6, p.canvas.height - 6);
  c.fillStyle = '#ffffff'; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const n = lines.length, step = Math.min(78, (p.canvas.height - 40) / n);
  lines.forEach((ln, i) => {
    c.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? firstSize : size}px Arial, sans-serif`;
    c.fillText(ln, p.canvas.width / 2, p.canvas.height / 2 + (i - (n - 1) / 2) * step);
  });
  p.tex.needsUpdate = true;
}

function wordTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#999'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 250);
  g.fillStyle = '#111'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 84px Arial, sans-serif';
  g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
