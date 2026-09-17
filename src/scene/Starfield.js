import * as THREE from 'three/webgpu';

function makeStarSprite() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function randomOnShell(radius) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * (0.6 + 0.4 * Math.random());
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

// Dense background dust: a single classic Points cloud with a uniform pixel
// size (WebGPU only rasterizes gl_PointSize-less points at 1px via the node
// pipeline, but the legacy PointsMaterial emulation path keeps size
// attenuation working across both backends, unlike a hand-rolled sizeNode).
function createDust(count, radius) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const warm = new THREE.Color('#ffe3c2');
  const cool = new THREE.Color('#cfe3ff');
  const white = new THREE.Color('#ffffff');
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const p = randomOnShell(radius);
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    const tint = Math.random();
    tmp.copy(white);
    if (tint < 0.15) tmp.copy(warm);
    else if (tint < 0.3) tmp.copy(cool);
    tmp.multiplyScalar(0.5 + Math.random() * 0.5);
    colors[i * 3 + 0] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.4,
    map: makeStarSprite(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// A handful of individually-billboarded hero stars for visual pop — cheap
// as real Sprite draw calls at this count, and size varies reliably on both
// WebGPU and WebGL since Sprite doesn't hit the Points-size restriction.
function createHeroStars(count, radius) {
  const group = new THREE.Group();
  const sprite = makeStarSprite();
  for (let i = 0; i < count; i++) {
    const p = randomOnShell(radius * 0.9);
    const tint = Math.random();
    const color = tint < 0.5 ? '#ffe9d0' : '#dbe9ff';
    const material = new THREE.SpriteMaterial({
      map: sprite,
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(material);
    s.position.set(p.x, p.y, p.z);
    const size = 2.2 + Math.random() * 3.5;
    s.scale.set(size, size, 1);
    group.add(s);
  }
  return group;
}

export function createStarfield(radius = 480) {
  const group = new THREE.Group();
  group.add(createDust(7000, radius));
  group.add(createHeroStars(45, radius));
  return group;
}
