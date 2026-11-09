import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9b79f');
scene.fog = new THREE.FogExp2('#a9b79f', 0.0065);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 260);
const clock = new THREE.Clock();
const mats = {};
const mat = (name, color, roughness = .92) => mats[name] ||= new THREE.MeshStandardMaterial({ color, roughness });
const world = new THREE.Group(); scene.add(world);
const enemies = [], pickups = [], tracers = [];
const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, health: 100, armor: 50, ammo: 30, reserve: 120, kills: 0, alive: true, moving: false, sprinting: false, firing: false, reloading: false, aim: false };
let active = false, paused = false, ended = false, elapsed = 0, zoneRadius = 49, zoneDamageClock = 0, gameTimer = 0, lastShot = 0, toastTimer = 0, hitTimer = 0, fireTimer = 0;
const keys = new Set(), moveInput = { x: 0, y: 0 }, lookInput = { x: 0, y: 0 };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

scene.add(new THREE.HemisphereLight('#e5edcf', '#58644d', 2.15));
const sun = new THREE.DirectionalLight('#fff0ce', 3.1); sun.position.set(-38, 55, 25); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -72; sun.shadow.camera.right = 72; sun.shadow.camera.top = 72; sun.shadow.camera.bottom = -72; sun.shadow.bias = -.00025; scene.add(sun);

// Softly rolling island floor and distant ridgelines.
const ground = new THREE.Mesh(new THREE.CircleGeometry(94, 64), mat('ground', '#7f8e68'));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.13; ground.receiveShadow = true; world.add(ground);
const patchColors = ['#89936e', '#778667', '#929775', '#707f60'];
for (let i = 0; i < 38; i++) {
  const a = i * 2.399, r = 5 + (i % 7) * 7;
  const patch = new THREE.Mesh(new THREE.CircleGeometry(2.4 + (i % 4) * .8, 9), mat(`patch${i}`, patchColors[i % patchColors.length]));
  patch.rotation.x = -Math.PI / 2; patch.rotation.z = a; patch.position.set(Math.cos(a) * r, -.105, Math.sin(a) * r); patch.receiveShadow = true; world.add(patch);
}
const outer = new THREE.Mesh(new THREE.CylinderGeometry(106, 112, 15, 64, 1, true), mat('earth', '#697760'));
outer.position.y = -7.5; world.add(outer);
// Water ring.
const water = new THREE.Mesh(new THREE.CircleGeometry(168, 64), new THREE.MeshStandardMaterial({ color: '#6f9c9b', roughness: .36, metalness: .12 }));
water.rotation.x = -Math.PI / 2; water.position.y = -8.1; world.add(water);

function box(parent, size, color, pos, rotation = 0, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color, color)); m.position.set(...pos); m.rotation.y = rotation; m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function addTree(x, z, scale = 1, pine = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); world.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.17, .27, 2.3, 6), mat('bark', '#62533d')); trunk.position.y = 1.05; trunk.castShadow = true; g.add(trunk);
  if (pine) {
    for (let j = 0; j < 3; j++) { const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05 - j * .12, 2.2, 7), mat(`pine${j}`, j % 2 ? '#405b43' : '#4b6848')); crown.position.y = 2.15 + j * .8; crown.castShadow = true; g.add(crown); }
  } else {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), mat('leaf', '#63764d')); crown.position.y = 3; crown.castShadow = true; crown.scale.y = .8; g.add(crown);
  }
  return g;
}
function addCabin(x, z, rot = 0, size = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; g.scale.setScalar(size); world.add(g);
  box(g, [5.4, 2.8, 4.7], '#b6a17b', [0, 1.45, 0], 0);
  box(g, [5.9, .28, 5.2], '#554b3b', [0, 2.86, 0], 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.3, 4), mat('roof', '#59624f')); roof.position.set(0, 4, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(1, .72, .9); roof.castShadow = true; g.add(roof);
  box(g, [.86, 1.65, .12], '#453f32', [0, .86, 2.4]);
  box(g, [.85, .72, .1], '#8eb0a4', [-1.7, 1.7, 2.4]); box(g, [.85, .72, .1], '#8eb0a4', [1.7, 1.7, 2.4]);
  return g;
}
// Central village and road.
const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 118), mat('road', '#777761')); road.rotation.x = -Math.PI / 2; road.position.set(0, -.07, 3); world.add(road);
const roadLine = new THREE.Mesh(new THREE.PlaneGeometry(.18, 110), mat('roadline', '#c4b987')); roadLine.rotation.x = -Math.PI / 2; roadLine.position.set(0, -.055, 3); world.add(roadLine);
addCabin(-13, -11, -.22, 1.05); addCabin(15, -17, .3, .92); addCabin(-17, 15, .16, .86); addCabin(17, 16, -.25, 1.02); addCabin(0, -31, .06, .82); addCabin(28, 1, .7, .8);
// Rocks, bushes, grass and trees around a playable clearing.
for (let i = 0; i < 60; i++) {
  const a = i * 2.4, r = 27 + (i % 6) * 3.4, x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(x) < 20 && Math.abs(z) < 34 && (i % 3 !== 0)) continue;
  if (i % 4 === 0) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + (i % 5) * .23, 0), mat(`rock${i}`, i % 2 ? '#777b67' : '#8c8a72')); rock.position.set(x, .35, z); rock.scale.set(1.2, .75, .9); rock.rotation.set(.2, a, .4); rock.castShadow = true; world.add(rock);
  } else addTree(x, z, .72 + (i % 5) * .13, i % 5 !== 0);
}
for (let i = 0; i < 22; i++) {
  const x = ((i * 19) % 46) - 23, z = ((i * 31) % 60) - 30;
  if (Math.abs(x) < 7 && Math.abs(z) < 8) continue;
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.55 + (i % 3) * .18, 1), mat(`bush${i}`, i % 2 ? '#536c46' : '#65794f')); bush.position.set(x, .45, z); bush.scale.y = .65; bush.castShadow = true; world.add(bush);
}

// Player operator, built from low-poly pieces.
function makeOperator(isPlayer = false) {
  const root = new THREE.Group();
  const skin = mat(isPlayer ? 'skinP' : 'skinE', isPlayer ? '#c99f78' : '#bd9876');
  const uniform = mat(isPlayer ? 'uniformP' : 'uniformE', isPlayer ? '#535d48' : '#665345');
  const dark = mat(isPlayer ? 'darkP' : 'darkE', isPlayer ? '#343b32' : '#393833');
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.78, 1.05, .43), uniform); torso.position.y = 1.55; torso.castShadow = true; root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.29, 10, 8), skin); head.position.y = 2.32; head.castShadow = true; root.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.32, 9, 6, 0, Math.PI * 2, 0, Math.PI * .55), dark); helmet.position.y = 2.42; root.add(helmet);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.55, .7, .27), dark); pack.position.set(0, 1.58, .34); root.add(pack);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.23, .79, .28), uniform); arm.position.set(side * .52, 1.58, -.02); arm.rotation.z = side * -.13; arm.castShadow = true; root.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.3, .76, .34), dark); leg.position.set(side * .22, .58, 0); leg.castShadow = true; root.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(.34, .18, .5), mat(isPlayer ? 'bootP' : 'bootE', '#262a25')); boot.position.set(side * .22, .12, -.07); root.add(boot);
  }
  // rifle points forward (-Z)
  const gun = new THREE.Group(); gun.position.set(.35, 1.58, -.4); root.add(gun);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.17, .15, .88), mat(isPlayer ? 'gunP' : 'gunE', '#292e2a')); body.position.z = -.27; gun.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .7, 6), mat('barrel', '#202622')); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .02, -.95); gun.add(barrel);
  return root;
}
const avatar = makeOperator(true); avatar.position.copy(player.pos); world.add(avatar);
const muzzle = new THREE.Object3D(); muzzle.position.set(.35, 1.65, -1.28); avatar.add(muzzle);

// Spawn 12 rivals around the island, not directly in front of the player.
for (let i = 0; i < 12; i++) {
  const angle = i * Math.PI * 2 / 12 + .22, radius = 23 + (i % 4) * 5;
  const p = V3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  const model = makeOperator(false); model.position.copy(p); model.rotation.y = Math.random() * Math.PI * 2; world.add(model);
  enemies.push({ model, pos: p, hp: 100, alive: true, cooldown: 1.2 + Math.random() * 3, speed: 1.5 + Math.random() * .7, phase: Math.random() * 6, name: ['NOMAD','VIXEN','ROOK','MASON','ECHO','KITE','ASH','WOLF','NOVA','ATLAS','JUNO','FOX'][i] });
}
// Ammo and medkit crates.
function makeCrate(x, z, type = 'ammo') {
  const g = new THREE.Group(); g.position.set(x, .3, z); world.add(g);
  const color = type === 'med' ? '#739b68' : '#c99c4b';
  const crate = new THREE.Mesh(new THREE.BoxGeometry(.9, .62, .72), mat(`crate-${type}`, color)); crate.castShadow = true; g.add(crate);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.93, .12, .74), mat(`stripe-${type}`, '#343a2e')); stripe.position.y = .05; g.add(stripe);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .025, 20), new THREE.MeshBasicMaterial({ color: type === 'med' ? '#8df079' : '#ffd46d', transparent: true, opacity: .48 })); glow.position.y = -.25; g.add(glow);
  pickups.push({ group: g, pos: V3(x, 0, z), type, collected: false, bob: Math.random() * 6 });
}
makeCrate(4, -5); makeCrate(-7, 6, 'med'); makeCrate(18, 10); makeCrate(-20, -7, 'med'); makeCrate(5, 25);

const zoneRing = new THREE.Mesh(new THREE.TorusGeometry(zoneRadius, .13, 6, 140), new THREE.MeshBasicMaterial({ color: '#e7cc7e', transparent: true, opacity: .48 })); zoneRing.rotation.x = Math.PI / 2; zoneRing.position.y = .18; world.add(zoneRing);
const zoneFill = new THREE.Mesh(new THREE.CircleGeometry(zoneRadius, 96), new THREE.MeshBasicMaterial({ color: '#a5b886', transparent: true, opacity: .045, side: THREE.DoubleSide, depthWrite: false })); zoneFill.rotation.x = -Math.PI / 2; zoneFill.position.y = .02; world.add(zoneFill);

function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); toastTimer = 2.2; }
function setHud() {
  document.querySelector('#healthNum').textContent = Math.ceil(player.health);
  document.querySelector('#healthBar').style.width = `${Math.max(0, player.health)}%`;
  document.querySelector('#armorNum').textContent = Math.ceil(player.armor);
  document.querySelector('#armorBar').style.width = `${Math.max(0, player.armor * 2)}%`;
  document.querySelector('#ammo').textContent = player.ammo;
  document.querySelector('#reserve').textContent = player.reserve;
  document.querySelector('#killCount').textContent = player.kills;
  document.querySelector('#aliveCount').textContent = enemies.filter(e => e.alive).length + 1;
  const outside = player.pos.length() > zoneRadius;
  document.querySelector('#zoneWarning').classList.toggle('show', outside && active && !paused);
  document.querySelector('#objectiveTitle').textContent = player.kills >= 12 ? 'CLEAR THE ISLAND' : 'REACH THE SAFE ZONE';
  document.querySelector('#objectiveSub').textContent = player.kills >= 12 ? 'No hostiles remain' : `${Math.max(0, Math.floor(zoneRadius - player.pos.length()))}m to safety • ${enemies.filter(e => e.alive).length} hostiles`;
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0'), secs = String(Math.floor(elapsed % 60)).padStart(2, '0');
  document.querySelector('#matchClock').textContent = `${mins}:${secs}`;
  const next = Math.max(0, 120 - elapsed); document.querySelector('#zoneTimer').textContent = `ZONE ${String(Math.floor(next / 60)).padStart(2, '0')}:${String(Math.floor(next % 60)).padStart(2, '0')}`;
}
function endGame(win) {
  if (ended) return; ended = true; active = false;
  document.querySelector('#resultEyebrow').textContent = win ? 'ISLAND SECURED' : 'SIGNAL LOST';
  document.querySelector('#resultTitle').innerHTML = win ? 'CHICKEN<br><em>DINNER</em>' : 'MATCH<br><em>OVER</em>';
  document.querySelector('#resultCopy').textContent = win ? 'You own this island.' : 'The island claimed another operator.';
  document.querySelector('#resultKills').textContent = player.kills;
  document.querySelector('#resultTime').textContent = document.querySelector('#matchClock').textContent;
  document.querySelector('#resultOverlay').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function reload() {
  if (!active || player.reloading || player.ammo === 30 || player.reserve <= 0) return;
  player.reloading = true; toast('RELOADING');
  setTimeout(() => { if (!active && !paused) return; const n = Math.min(30 - player.ammo, player.reserve); player.ammo += n; player.reserve -= n; player.reloading = false; setHud(); }, 1150);
}
function makeTracer(from, to, color = '#f2ce76') {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 })); world.add(line); tracers.push({ line, life: .13 });
}
function fire() {
  if (!active || paused || ended || player.reloading || performance.now() - lastShot < 145) return;
  if (player.ammo <= 0) { reload(); return; }
  lastShot = performance.now(); player.ammo--; setHud();
  const direction = camera.getWorldDirection(V3());
  const origin = camera.position.clone();
  const target = enemies.filter(e => e.alive).map(e => ({ e, delta: e.pos.clone().add(V3(0, 1.25, 0)).sub(origin) })).map(o => ({ ...o, distance: o.delta.length(), angle: Math.acos(THREE.MathUtils.clamp(o.delta.normalize().dot(direction), -1, 1)) })).filter(o => o.distance < 57 && o.angle < (player.aim ? .13 : .09)).sort((a, b) => a.angle - b.angle)[0];
  let end = origin.clone().add(direction.clone().multiplyScalar(44));
  if (target) {
    end = target.e.pos.clone().add(V3(0, 1.25, 0));
    const damage = player.aim ? 48 : 38; target.e.hp -= damage;
    document.querySelector('#hitMarker').classList.add('show'); hitTimer = .18;
    if (target.e.hp <= 0) eliminate(target.e);
  }
  makeTracer(muzzle.getWorldPosition(V3()), end);
  if (player.ammo === 0) toast('MAGAZINE EMPTY — RELOAD');
}
function eliminate(enemy) {
  if (!enemy.alive) return; enemy.alive = false; enemy.model.visible = false; player.kills++;
  makeCrate(enemy.pos.x, enemy.pos.z, Math.random() < .35 ? 'med' : 'ammo');
  toast(`${enemy.name} ELIMINATED`); setHud();
  if (player.kills === 12) { document.querySelector('#objectiveTitle').textContent = 'ISLAND SECURED'; toast('ALL HOSTILES ELIMINATED'); setTimeout(() => endGame(true), 1700); }
}

function drawMap() {
  const c = document.querySelector('#minimap'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 180, 180); ctx.fillStyle = '#637457'; ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = '#80906a'; ctx.beginPath(); ctx.arc(90, 90, 87, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9b879'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(90, 90, zoneRadius / 94 * 87, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#9b9474'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(90, 4); ctx.lineTo(90, 176); ctx.stroke();
  for (const p of [[62,61],[117,43],[54,115],[119,116],[90,30],[142,91]]) { ctx.fillStyle = '#d1c49a'; ctx.fillRect(p[0]-4,p[1]-3,8,6); }
  for (const e of enemies) if (e.alive) { const x = 90 + e.pos.x / 94 * 87, y = 90 + e.pos.z / 94 * 87; ctx.fillStyle = '#e28b70'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
  for (const p of pickups) if (!p.collected) { const x=90+p.pos.x/94*87,y=90+p.pos.z/94*87; ctx.fillStyle=p.type==='med'?'#9ee18c':'#f3d37e';ctx.fillRect(x-1.5,y-1.5,3,3); }
  const px = 90 + player.pos.x / 94 * 87, py = 90 + player.pos.z / 94 * 87;
  ctx.save(); ctx.translate(px, py); ctx.rotate(player.yaw); ctx.fillStyle = '#f9f4d8'; ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(4,4); ctx.lineTo(0,2); ctx.lineTo(-4,4); ctx.closePath(); ctx.fill(); ctx.restore();
}
function update(dt) {
  if (!active || paused || ended) return;
  elapsed += dt; gameTimer += dt;
  if (elapsed > 120) { zoneRadius = Math.max(18, 49 - (elapsed - 120) * .15); zoneRing.geometry.dispose(); zoneRing.geometry = new THREE.TorusGeometry(zoneRadius, .13, 6, 140); zoneFill.geometry.dispose(); zoneFill.geometry = new THREE.CircleGeometry(zoneRadius, 96); drawMap(); }
  const forward = V3(Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const right = V3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
  let mx = moveInput.x, my = moveInput.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
  const running = player.sprinting || keys.has('ShiftLeft') || keys.has('ShiftRight'); const speed = running ? 9.2 : 5.8;
  player.pos.addScaledVector(right, mx * speed * dt); player.pos.addScaledVector(forward, -my * speed * dt);
  const radius = player.pos.length(); if (radius > 86) player.pos.setLength(86);
  player.moving = length > .05; avatar.position.copy(player.pos); if (player.moving) avatar.rotation.y = Math.atan2(-forward.x, -forward.z) + Math.atan2(mx, -my) * .62;
  const cameraDistance = player.aim ? 4.2 : 7.3;
  const desired = player.pos.clone().add(V3(-Math.sin(player.yaw) * cameraDistance, player.aim ? 3.2 : 4.7, Math.cos(player.yaw) * cameraDistance));
  camera.position.lerp(desired, 1 - Math.exp(-5 * dt)); const lookAt = player.pos.clone().add(V3(Math.sin(player.yaw) * 7, player.aim ? 1.7 : 1.6, -Math.cos(player.yaw) * 7)); camera.lookAt(lookAt);
  const now = performance.now(); if (player.firing && now - fireTimer > 155) { fireTimer = now; fire(); }
  for (const e of enemies) {
    if (!e.alive) continue;
    e.phase += dt; const toPlayer = player.pos.clone().sub(e.pos); const dist = toPlayer.length();
    if (dist > 8) { toPlayer.normalize(); e.pos.addScaledVector(toPlayer, e.speed * dt); }
    else if (dist < 4.5) { toPlayer.normalize(); e.pos.addScaledVector(toPlayer, -e.speed * .45 * dt); }
    e.model.position.copy(e.pos); if (dist > .2) e.model.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
    e.model.position.y = Math.abs(Math.sin(e.phase * 5)) * .035;
    e.cooldown -= dt;
    if (dist < 34 && e.cooldown <= 0) {
      e.cooldown = 2.1 + Math.random() * 2.2;
      const hit = dist < 12 ? .62 : dist < 22 ? .39 : .22;
      if (Math.random() < hit) {
        const damage = 5 + Math.random() * 7; const absorbed = Math.min(player.armor, damage * .55); player.armor -= absorbed; player.health -= damage - absorbed;
        makeTracer(e.pos.clone().add(V3(0,1.5,0)), player.pos.clone().add(V3(0,1,0)), '#e79c72'); setHud();
        if (player.health <= 0) { player.health = 0; setHud(); endGame(false); }
      } else makeTracer(e.pos.clone().add(V3(0,1.5,0)), player.pos.clone().add(V3((Math.random()-.5)*3,1,Math.random()*3)), '#d99b69');
    }
  }
  for (const p of pickups) {
    if (p.collected) continue; p.group.position.y = .3 + Math.sin(elapsed * 2 + p.bob) * .09;
    if (p.pos.distanceTo(player.pos) < 2.2) {
      p.collected = true; p.group.visible = false;
      if (p.type === 'med') { player.health = Math.min(100, player.health + 35); player.armor = Math.min(100, player.armor + 10); toast('MED KIT • +35 VITALS'); }
      else { player.reserve += 30; player.ammo = Math.min(30, player.ammo + 10); toast('AMMO PICKED UP • +30'); }
      setHud();
    }
  }
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; t.line.material.opacity = Math.max(0, t.life / .13); if (t.life <= 0) { world.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); } }
  if (player.pos.length() > zoneRadius) { zoneDamageClock += dt; if (zoneDamageClock > 1) { zoneDamageClock = 0; player.health -= 4; setHud(); if (player.health <= 0) endGame(false); } } else zoneDamageClock = 0;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.querySelector('#toast').classList.remove('show'); }
  if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) document.querySelector('#hitMarker').classList.remove('show'); }
  setHud(); drawMap();
}
function render() { requestAnimationFrame(render); const dt = Math.min(clock.getDelta(), .05); update(dt); renderer.render(scene, camera); }
render();

function startGame() {
  document.querySelector('#startOverlay').classList.add('hidden'); document.querySelector('#pauseOverlay').classList.add('hidden'); document.querySelector('#resultOverlay').classList.add('hidden');
  active = true; paused = false; ended = false; elapsed = 0; zoneRadius = 49; player.pos.set(0,0,0); player.yaw = 0; player.health = 100; player.armor = 50; player.ammo = 30; player.reserve = 120; player.kills = 0; player.reloading = false;
  avatar.position.copy(player.pos); enemies.forEach((e, i) => { const a = i * Math.PI * 2 / 12 + .22, r = 23 + (i % 4) * 5; e.pos.set(Math.sin(a)*r,0,Math.cos(a)*r); e.hp=100; e.alive=true; e.model.visible=true; e.cooldown=1+Math.random()*3; });
  pickups.forEach(p => { p.collected = false; p.group.visible = true; }); setHud(); drawMap(); toast('DROP COMPLETE • GOOD HUNT');
}
function pauseGame() { if (!active || ended) return; paused = true; player.firing = false; document.querySelector('#pauseOverlay').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
function resumeGame() { paused = false; document.querySelector('#pauseOverlay').classList.add('hidden'); }
document.querySelector('#startBtn').addEventListener('click', startGame);
document.querySelector('#pauseBtn').addEventListener('click', pauseGame);
document.querySelector('#resumeBtn').addEventListener('click', resumeGame);
document.querySelector('#restartBtn').addEventListener('click', startGame);
document.querySelector('#playAgainBtn').addEventListener('click', startGame);
document.querySelector('#reloadBtn').addEventListener('click', reload);
document.querySelector('#fireBtn').addEventListener('pointerdown', e => { e.preventDefault(); player.firing = true; fire(); });
for (const name of ['pointerup','pointercancel','pointerleave']) window.addEventListener(name, () => { player.firing = false; });
document.querySelector('#sprintBtn').addEventListener('pointerdown', e => { e.preventDefault(); player.sprinting = true; });
for (const ev of ['pointerup','pointercancel']) window.addEventListener(ev, () => player.sprinting = false);
document.querySelector('#aimBtn').addEventListener('pointerdown', e => { e.preventDefault(); player.aim = !player.aim; document.querySelector('#aimBtn').classList.toggle('active', player.aim); });
window.addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyR') reload(); if (e.code === 'Escape' && active && !paused) pauseGame(); else if (e.code === 'Escape' && paused) resumeGame(); if (e.code === 'Space') { e.preventDefault(); player.firing = true; fire(); } });
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') player.firing = false; });
// Drag anywhere on the right half to look; left half is reserved for movement.
const lookZone = document.querySelector('#lookZone');
let lookPointer = null, lastX = 0, lastY = 0;
lookZone.addEventListener('pointerdown', e => { if (!active) return; lookPointer=e.pointerId; lastX=e.clientX; lastY=e.clientY; lookZone.setPointerCapture(e.pointerId); });
lookZone.addEventListener('pointermove', e => { if (lookPointer !== e.pointerId) return; const dx=e.clientX-lastX; lastX=e.clientX; lastY=e.clientY; player.yaw -= dx*.008; });
lookZone.addEventListener('pointerup', e => { if (lookPointer===e.pointerId) lookPointer=null; });
// Desktop drag-to-look + click-to-fire.
let mouseDown = false, mouseStart = null, mouseMoved = false;
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && active && e.button === 0) { mouseDown=true; mouseMoved=false; mouseStart=[e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', e => { if (mouseDown && e.pointerType==='mouse') { const dx=e.movementX || (e.clientX-mouseStart[0]); if (Math.abs(dx)>2) mouseMoved=true; player.yaw -= dx*.006; mouseStart=[e.clientX,e.clientY]; } });
canvas.addEventListener('pointerup', e => { if (mouseDown && e.pointerType==='mouse') { if (!mouseMoved) fire(); mouseDown=false; } });
// Thumbstick with a normalized circular range.
const pad = document.querySelector('#movePad'), knob = pad.querySelector('.joy-knob'); let movePointer = null;
pad.addEventListener('pointerdown', e => { e.preventDefault(); movePointer=e.pointerId; pad.setPointerCapture(e.pointerId); updateStick(e); });
pad.addEventListener('pointermove', e => { if (movePointer===e.pointerId) updateStick(e); });
function updateStick(e) { const r=pad.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, max=r.width*.34; let dx=e.clientX-cx,dy=e.clientY-cy; const len=Math.hypot(dx,dy); if(len>max){dx*=max/len;dy*=max/len;} moveInput.x=dx/max; moveInput.y=dy/max; knob.style.transform=`translate(${dx}px,${dy}px)`; }
function resetStick(e) { if(movePointer===e.pointerId){movePointer=null;moveInput.x=0;moveInput.y=0;knob.style.transform='translate(0,0)';} }
pad.addEventListener('pointerup',resetStick); pad.addEventListener('pointercancel',resetStick);
window.addEventListener('resize', () => { camera.aspect=innerWidth/innerHeight; camera.fov=innerWidth<600?68:62; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); });
