// Builds the static scene (room, table, posts, avatar), the word plate and the instruction panel.
import * as THREE from 'three';
import { GEOM, WORDS } from './config.js';
import { makeAvatar } from './avatar.js';

export class ExperimentScene {
  constructor(scene) {
    this.scene = scene;
    // root: everything is placed in scene-frame coordinates under this group;
    // calibration moves/rotates it so the participant's head is the origin facing -Z.
    this.root = new THREE.Group();
    scene.add(this.root);
    this.tableY = 0.72;
    this._build();
  }

  _build() {
    const s = this.scene;
    s.background = new THREE.Color(0x2b2e33);
    s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(1, 3, 1);
    s.add(dir);

    const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

    // Room: floor + walls give depth cues around the table.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat(0x55585e));
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);
    const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b6f76, side: THREE.BackSide, roughness: 1 }));
    room.position.set(0, 1.5, -1.0);
    this.root.add(room);

    // Table (top only + 4 legs), centre P at z = -tableDist.
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

    // Posts A-D, always visible.
    const o = GEOM.postOffset;
    this.postLocal = { A: [o, 0], B: [-o, 0], C: [0, o], D: [0, -o] }; // [dx, dz] from P
    this.posts = new THREE.Group();
    for (const k of Object.keys(this.postLocal)) {
      const [dx, dz] = this.postLocal[k];
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, GEOM.postHeight, 20), mat(0xd9d9d9, 0.5));
      p.position.set(dx, GEOM.postHeight / 2, dz);
      this.posts.add(p);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 24), mat(0xbfbfbf, 0.5));
      cap.position.set(dx, GEOM.postHeight, dz);
      this.posts.add(cap);
    }
    this.table.add(this.posts);

    // Fixation cross above P.
    this.fixation = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.fixation.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), fm));
    this.fixation.add(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), fm));
    this.fixation.position.set(0, GEOM.fixAboveTable, 0);
    this.fixation.visible = false;
    this.table.add(this.fixation);

    // Word plate: one textured plane per stimulus, pre-rendered.
    this.wordTextures = {};
    for (const [k, w] of Object.entries(WORDS)) this.wordTextures[k] = textTexture(w);
    this.word = new THREE.Mesh(
      new THREE.PlaneGeometry(GEOM.wordWidth, GEOM.wordHeight),
      new THREE.MeshBasicMaterial({ map: this.wordTextures.neutral, transparent: false }),
    );
    this.word.visible = false;
    this.root.add(this.word);

    // Avatar (simple seated mannequin), placed by setAvatarSide().
    this.avatar = makeAvatar();
    this.root.add(this.avatar);

    // Instruction panel above the table.
    this.panelCanvas = document.createElement('canvas');
    this.panelCanvas.width = 1024; this.panelCanvas.height = 512;
    this.panelTex = new THREE.CanvasTexture(this.panelCanvas);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: this.panelTex }));
    this.root.add(this.panel);

    this.setTableHeight(this.tableY);
    this.setAvatarSide('R');
  }

  // Table centre P in scene-frame coordinates.
  get P() { return new THREE.Vector3(0, this.tableY, -GEOM.tableDist); }

  setTableHeight(y) {
    this.tableY = y;
    this.table.position.copy(this.P);
    this.panel.position.set(0, y + 0.55, -GEOM.tableDist - 0.3);
    this.setAvatarSide(this.side || 'R');
  }

  setAvatarSide(side) {
    this.side = side;
    const sx = side === 'R' ? 1 : -1;
    this.avatar.position.set(sx * GEOM.avatarOffset, this.tableY - 0.74, -GEOM.tableDist);
    // Mannequin faces +Z locally; rotate to face the table centre.
    this.avatar.rotation.y = side === 'R' ? -Math.PI / 2 : Math.PI / 2;
  }

  // Scene-frame position of the word above a post.
  wordPosition(pos) {
    const [dx, dz] = this.postLocal[pos];
    return new THREE.Vector3(dx, this.tableY + GEOM.postHeight + GEOM.wordAbovePost, -GEOM.tableDist + dz);
  }

  showWord(pos, wordKey) {
    this.word.material.map = this.wordTextures[wordKey];
    this.word.material.needsUpdate = true;
    this.word.position.copy(this.wordPosition(pos));
    this.word.visible = true;
  }
  hideWord() { this.word.visible = false; }

  // Billboard the word plate and panel toward the viewer.
  faceCamera(cameraWorldPos) {
    for (const m of [this.word, this.panel]) {
      const p = this.root.worldToLocal(cameraWorldPos.clone());
      p.y = m.position.y; // yaw only: plate stays upright
      m.lookAt(this.root.localToWorld(p));
    }
  }

  setPanel(lines, visible = true) {
    const c = this.panelCanvas.getContext('2d');
    c.fillStyle = '#1e2126'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.strokeStyle = '#8a8f99'; c.lineWidth = 6; c.strokeRect(3, 3, c.canvas.width - 6, c.canvas.height - 6);
    c.fillStyle = '#ffffff'; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      c.font = i === 0 ? 'bold 64px Arial, sans-serif' : '44px Arial, sans-serif';
      c.fillText(ln, c.canvas.width / 2, c.canvas.height / 2 + (i - (n - 1) / 2) * 80);
    });
    this.panelTex.needsUpdate = true;
    this.panel.visible = visible;
  }
  hidePanel() { this.panel.visible = false; }

  // Align the scene frame to the head: origin under/at the head, facing the head's yaw.
  calibrate(headPos, headQuat, tableBelowEye) {
    const e = new THREE.Euler().setFromQuaternion(headQuat, 'YXZ');
    this.root.position.set(headPos.x, 0, headPos.z);
    this.root.rotation.set(0, e.y, 0);
    this.setTableHeight(headPos.y - tableBelowEye);
  }
}

function textTexture(text) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 150px Arial, sans-serif';
  g.fillText(text, c.width / 2, c.height / 2 + 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
