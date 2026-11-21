// Sunfall Harbor core simulation. Pure game logic: no DOM, no canvas,
// no audio calls beyond the injected interface, so the same code runs in
// the browser and in the headless Node simulator.
import { Rng, streamFor } from './rng.js';
import {
  generateWorld, roadGraph, findPath, resolveBuildingCollision,
  clampToWorld, WORLD_W, WORLD_H, COLS, ROWS,
} from './world.js';
import { Particles } from './particles.js';

export const DT = 1 / 60;
export const TICK = DT;

const CAR_COLORS = ['#c95a3a', '#3a7ab8', '#4a9a5a', '#d9a03a', '#8a5ab8', '#e8e8e8', '#3a3a4a', '#7ab8c9'];

export const MISSIONS = [
  {
    id: 'package', name: 'The Package', contact: 'Danny Cole', reward: 400,
    brief: 'Danny Cole needs a package lifted off Pier 3 and brought to his garage. No questions, no detours. The harbor crews do not ask twice.',
    steps: [
      { type: 'goto', label: 'Pick up the package at Pier 3', key: 'harborPickup' },
      { type: 'timed', label: 'Deliver the package to Danny\'s Garage — beat the clock', key: 'garage', timeLimit: 150 },
    ],
  },
  {
    id: 'hotwheels', name: 'Hot Wheels', contact: 'Mara Voss', reward: 800,
    brief: 'Mara Voss wants the pink coupe parked uptown. Slip in on foot, take the keys, take the car, bring it to the Chop Shop, and do not scratch the paint. She pays for clean work.',
    steps: [
      { type: 'goto', label: 'Drive to the pink coupe uptown', key: 'pinkCoupe' },
      { type: 'walk', label: 'Slip in on foot and grab the coupe keys', key: 'pinkCoupe' },
      { type: 'steal', label: 'Steal the pink coupe', key: 'pinkCoupe', carId: 'pink' },
      { type: 'timed', label: 'Deliver the coupe to the Chop Shop — beat the clock', key: 'chopShop', carId: 'pink', timeLimit: 180 },
    ],
  },
  {
    id: 'showdown', name: 'Harbor Showdown', contact: 'Kane Dray', reward: 1500,
    brief: 'Kane Dray is done talking. Rico, Marco and Vince are waiting at the Harbor Yard with guns. Put them down, go dark until the heat cools off, and drive home.',
    steps: [
      { type: 'goto', label: 'Get to the Harbor Yard', key: 'showdown' },
      { type: 'kill', label: 'Take down Rico, Marco and Vince', key: 'showdown' },
      { type: 'hide', label: 'Stay out of sight until the heat cools off', key: 'showdown', hideNeed: 10 },
      { type: 'escape', label: 'Lose the heat and drive home', key: 'home' },
    ],
  },
];

const ENEMY_NAMES = ['Rico', 'Marco', 'Vince'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createGame(seed, audio) {
  const rng = new Rng(seed);
  const world = generateWorld(seed);
  const graph = roadGraph();
  const particles = new Particles(seed);
  const g = {
    seed, rng, world, graph, particles,
    audio: audio || nullAudio(),
    time: 0,
    clockMinutes: 17 * 60 + 5, // 17:05, golden hour
    mode: 'title', // title | brief | play | paused | over
    missionIndex: 0,
    missionStep: 0,
    money: 0,
    best: 0,
    wanted: 0,
    hideTimer: 0,
    lastStarGain: -10,
    outcome: null, // 'win' | 'wasted' | 'busted'
    overTimer: 0,
    messages: [],
    banner: null,
    camera: { x: world.places.playerStart.x, y: world.places.playerStart.y },
    player: {
      x: world.places.playerStart.x, y: world.places.playerStart.y,
      angle: 0, hp: 100, ammo: 12, reserveAmmo: 48,
      onFoot: true, car: null, punchCd: 0, shootCd: 0, reloadT: 0,
      lastHurt: -10, walkPhase: 0, speed: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    copCars: [],
    enemies: [],
    stats: { shots: 0, hits: 0, carsStolen: 0, pedsHit: 0 },
    autopilot: null,
    shotMode: null,
  };
  spawnTraffic(g);
  spawnPeds(g);
  spawnParked(g);
  return g;
}

function nullAudio() {
  const noop = () => {};
  return {
    ensure: noop, setMuted: noop, setEngine: noop, shoot: noop, punch: noop,
    pickup: noop, siren: noop, crash: noop, skid: noop, missionComplete: noop, wasted: noop,
  };
}

function spawnParked(g) {
  const spots = g.world.parkedSpots.slice(0, 26);
  spots.forEach((s, i) => {
    g.cars.push({
      id: `parked-${i}`, x: s.x, y: s.y, angle: s.angle, speed: 0,
      color: s.color, kind: 'parked', w: 46, h: 22, steer: 0,
    });
  });
  // The pink coupe for mission 2, parked at its named spot.
  const p = g.world.places.pinkCoupe;
  g.cars.push({
    id: 'pink', x: p.x, y: p.y, angle: 0, speed: 0,
    color: '#ff7ab8', kind: 'pink', w: 48, h: 22, steer: 0,
  });
}

function spawnTraffic(g) {
  const trng = streamFor(g.seed, 'traffic');
  for (let i = 0; i < 14; i += 1) {
    const from = trng.int(0, g.graph.nodes.length - 1);
    const node = g.graph.nodes[from];
    const edge = g.graph.edges.find(([a]) => a === from);
    if (!edge) continue;
    g.cars.push({
      id: `traffic-${i}`, x: node.x, y: node.y, angle: 0, speed: 0,
      color: trng.pick(CAR_COLORS), kind: 'traffic', w: 46, h: 22,
      from: edge[0], to: edge[1], t: trng.next(), cruise: trng.range(130, 200), steer: 0,
    });
  }
}

function spawnPeds(g) {
  const prng = streamFor(g.seed, 'peds');
  for (let i = 0; i < 26; i += 1) {
    const from = prng.int(0, g.graph.nodes.length - 1);
    const edge = g.graph.edges.find(([a]) => a === from);
    if (!edge) continue;
    g.peds.push({
      id: `ped-${i}`, from: edge[0], to: edge[1], t: prng.next(),
      speed: prng.range(38, 62), color: prng.pick(['#e8d8a8', '#a8c9e8', '#e8a8a8', '#b8e8a8', '#d8b8e8', '#e8c9a8']),
      x: 0, y: 0, down: false, downT: 0, panic: 0,
    });
  }
}

// ---------- missions ----------

export function currentMission(g) {
  return MISSIONS[g.missionIndex] || null;
}
export function currentStep(g) {
  const m = currentMission(g);
  return m ? m.steps[g.missionStep] : null;
}
export function currentObjective(g) {
  const step = currentStep(g);
  if (!step) return null;
  if (step.type === 'kill') {
    const alive = g.enemies.filter((e) => e.hp > 0);
    if (alive.length) {
      const e = alive[0];
      return { x: e.x, y: e.y, label: step.label };
    }
    return { x: g.world.places.showdown.x, y: g.world.places.showdown.y, label: step.label };
  }
  const p = g.world.places[step.key];
  return p ? { x: p.x, y: p.y, label: step.label } : null;
}

export function startMission(g, index) {
  g.missionIndex = index;
  g.missionStep = 0;
  const m = MISSIONS[index];
  if (!m) return;
  g.banner = { title: m.name, sub: `${m.contact}  •  $${m.reward}`, t: 4 };
  g.mode = 'brief';
  g.briefTimer = 0;
  if (m.id === 'showdown') {
    g.player.hp = 100;
    spawnEnemies(g);
  }
}

function spawnEnemies(g) {
  const erng = streamFor(g.seed, 'enemies');
  const c = g.world.places.showdown;
  g.cops = []; // the police hold the cordon during the shootout
  ENEMY_NAMES.forEach((name, i) => {
    g.enemies.push({
      id: `enemy-${i}`, name, x: c.x - 90 + i * 90 + erng.range(-20, 20),
      y: c.y - 60 + erng.range(-30, 30), hp: 100, fireCd: erng.range(0.5, 1.5),
      angle: 0, walkPhase: 0,
    });
  });
}

function completeStep(g) {
  const m = currentMission(g);
  const step = currentStep(g);
  g.missionStep += 1;
  g.audio.pickup();
  addMessage(g, step.type === 'goto' && g.missionStep >= m.steps.length ? 'Delivered.' : 'Objective complete.');
  if (g.missionStep >= m.steps.length) completeMission(g);
}

function completeMission(g) {
  const m = currentMission(g);
  g.money += m.reward;
  g.audio.missionComplete();
  g.particles.floater(g.player.x, g.player.y - 40, `+$${m.reward}`, '#7ae87a');
  addMessage(g, `${m.name} complete. $${m.reward} earned.`);
  if (g.missionIndex + 1 >= MISSIONS.length) {
    winGame(g);
    return;
  }
  startMission(g, g.missionIndex + 1);
}

export function winGame(g) {
  g.mode = 'over';
  g.outcome = 'win';
  g.overTimer = 0;
  if (g.money > g.best) g.best = g.money;
}
export function loseGame(g, outcome) {
  if (g.mode === 'over') return;
  g.mode = 'over';
  g.outcome = outcome;
  g.overTimer = 0;
  g.audio.wasted();
}

export function addMessage(g, text) {
  g.messages.push({ text, t: 0 });
  if (g.messages.length > 5) g.messages.shift();
}

export function addWanted(g, n) {
  g.wanted = clamp(g.wanted + n, 0, 5);
  g.hideTimer = 0;
}

// ---------- main update ----------

export function update(g, input, dt) {
  g.time += dt;
  g.clockMinutes += dt * 0.25; // a game minute every 4 seconds
  g.particles.update(dt);
  for (const m of g.messages) m.t += dt;
  g.messages = g.messages.filter((m) => m.t < 5);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.mode === 'brief') {
    g.briefTimer += dt;
    if (g.briefTimer > 0.2 && input.wasPressed('Enter')) { g.mode = 'play'; }
    if (g.briefTimer > 0.2 && input.mousePressed) { g.mode = 'play'; }
    updateCamera(g, dt);
    return;
  }
  if (g.mode === 'play' && (input.wasPressed('p') || input.wasPressed('Escape'))) { g.mode = 'paused'; return; }
  if (g.mode === 'paused' && (input.wasPressed('p') || input.wasPressed('Escape'))) { g.mode = 'play'; return; }
  if (g.mode !== 'play') {
    if (g.mode === 'over') g.overTimer += dt;
    updateCamera(g, dt);
    return;
  }
  if (input.wasPressed('m')) {
    g.audio.ensure();
    g.audio.setMuted(!g.audio.muted);
    addMessage(g, g.audio.muted ? 'Sound muted.' : 'Sound on.');
  }

  const p = g.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const need = 12 - p.ammo;
      const take = Math.min(need, p.reserveAmmo);
      p.ammo += take; p.reserveAmmo -= take;
    }
  }
  // Slow health regen after 5 s without damage.
  if (g.time - p.lastHurt > 5 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 2 * dt);

  if (p.onFoot) updateOnFoot(g, input, dt);
  else updateDriving(g, input, dt);

  updateTraffic(g, dt);
  updatePeds(g, dt);
  updatePolice(g, dt);
  updateEnemies(g, dt);
  updateMissions(g, dt);
  updateCamera(g, dt);
  updateEngineSound(g);
}

function updateEngineSound(g) {
  if (!g.audio.setEngine) return;
  const p = g.player;
  if (!p.onFoot && p.car) g.audio.setEngine(Math.abs(p.car.speed) / 540, true);
  else g.audio.setEngine(0, false);
}

function updateOnFoot(g, input, dt) {
  const p = g.player;
  const mv = input.moveVector();
  const run = input.down('Shift');
  const speed = run ? 320 : 200;
  p.speed = (mv.x !== 0 || mv.y !== 0) ? speed : 0;
  if (mv.x !== 0 || mv.y !== 0) {
    p.angle = Math.atan2(mv.y, mv.x);
    p.walkPhase += dt * 10;
  }
  let nx = p.x + mv.x * speed * dt;
  let ny = p.y + mv.y * speed * dt;
  const c = clampToWorld(nx, ny, 24);
  nx = c.x; ny = c.y;
  if (nx > 3480) nx = 3480; // the sea stops pedestrians too
  const hit = resolveBuildingCollision(g.world, nx, ny, 16);
  p.x = hit.x; p.y = hit.y;

  // Enter a car.
  if (input.wasPressed('e')) {
    const car = nearestCar(g, p.x, p.y, 78);
    if (car) enterCar(g, car);
  }
  // Punch.
  if (input.wasPressed(' ') && p.punchCd <= 0) {
    p.punchCd = 0.45;
    g.audio.punch();
    punchHit(g);
  }
  // Shoot toward the mouse.
  if ((input.mousePressed || input.mouseDown) && p.shootCd <= 0 && p.reloadT <= 0) {
    if (p.ammo > 0) shoot(g, input);
    else if (p.reserveAmmo > 0) startReload(g);
  }
  if (input.wasPressed('r')) startReload(g);
}

function startReload(g) {
  const p = g.player;
  if (p.ammo >= 12 || p.reserveAmmo <= 0 || p.reloadT > 0) return;
  p.reloadT = 1.1;
  addMessage(g, 'Reloading...');
}

function punchHit(g) {
  const p = g.player;
  const px = p.x + Math.cos(p.angle) * 40;
  const py = p.y + Math.sin(p.angle) * 40;
  for (const e of g.enemies) {
    if (e.hp > 0 && dist(px, py, e.x, e.y) < 46) {
      e.hp -= 25;
      g.particles.blood(e.x, e.y);
      g.particles.floater(e.x, e.y - 30, '-25', '#ff9a9a');
      if (e.hp <= 0) addMessage(g, `${e.name} is down.`);
    }
  }
  for (const ped of g.peds) {
    if (!ped.down && dist(px, py, ped.x, ped.y) < 40) {
      knockPed(g, ped);
      addWanted(g, 1);
      addMessage(g, 'You hit a pedestrian. The cops noticed.');
    }
  }
}

function shoot(g, input) {
  const p = g.player;
  p.ammo -= 1;
  p.shootCd = 0.32;
  g.stats.shots += 1;
  const cam = g.camera;
  // Mouse position in world space: camera centres the 1280x720 view.
  const wx = cam.x - 640 + input.mouseX;
  const wy = cam.y - 360 + input.mouseY;
  const a = angleTo(p.x, p.y, wx, wy);
  p.angle = a;
  const mx = p.x + Math.cos(a) * 26;
  const my = p.y + Math.sin(a) * 26;
  g.particles.muzzle(mx, my, a);
  g.audio.shoot();
  g.particles.addShake(2);
  if (g.time - g.lastStarGain > 3) { addWanted(g, 1); g.lastStarGain = g.time; }
  // Hit the nearest enemy inside a narrow cone and within range.
  let best = null; let bestD = 430;
  for (const e of g.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    const da = Math.abs(angleDiff(a, angleTo(p.x, p.y, e.x, e.y)));
    if (d < bestD && da < 0.22) { best = e; bestD = d; }
  }
  if (best) {
    best.hp -= 34;
    g.stats.hits += 1;
    g.particles.blood(best.x, best.y);
    g.particles.floater(best.x, best.y - 30, '-34', '#ff9a9a');
    if (best.hp <= 0) addMessage(g, `${best.name} is down.`);
    return;
  }
  // Stray shots can clip a pedestrian.
  for (const ped of g.peds) {
    if (ped.down) continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    const da = Math.abs(angleDiff(a, angleTo(p.x, p.y, ped.x, ped.y)));
    if (d < 420 && da < 0.12) { knockPed(g, ped); addWanted(g, 1); break; }
  }
}

function knockPed(g, ped) {
  ped.down = true;
  ped.downT = 0;
  g.stats.pedsHit += 1;
  g.particles.blood(ped.x, ped.y);
}

function nearestCar(g, x, y, maxD) {
  let best = null; let bd = maxD;
  for (const c of g.cars) {
    if (c.kind === 'traffic' || c.kind === 'police') continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(g, car) {
  const p = g.player;
  p.onFoot = false;
  p.car = car;
  car.kind = car.kind === 'pink' ? 'pink' : 'driven';
  if (car.kind === 'driven' && car.stolen !== true) {
    car.stolen = true;
    g.stats.carsStolen += 1;
    addWanted(g, 1);
    addMessage(g, 'Car stolen. The heat is on.');
    g.audio.siren();
  }
  if (car.id === 'pink' && car.stolen !== true) {
    car.stolen = true;
    g.stats.carsStolen += 1;
    addWanted(g, 1);
    addMessage(g, 'You took the pink coupe.');
  }
  p.x = car.x; p.y = car.y;
}

function exitCar(g) {
  const p = g.player;
  const car = p.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  g.lastCar = car;
  p.onFoot = true;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  const hit = resolveBuildingCollision(g.world, p.x, p.y, 16);
  p.x = hit.x; p.y = hit.y;
}

function updateDriving(g, input, dt) {
  const p = g.player;
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const fwd = input.down('w') || input.down('ArrowUp');
  const back = input.down('s') || input.down('ArrowDown');
  const left = input.down('a') || input.down('ArrowLeft');
  const right = input.down('d') || input.down('ArrowRight');
  const maxSpeed = car.kind === 'police' ? 500 : 540;
  if (fwd) car.speed += 300 * dt;
  if (back) car.speed -= car.speed > 20 ? 460 * dt : 200 * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * 140 * dt;
  if (Math.abs(car.speed) < 6 && !fwd && !back) car.speed = 0;
  car.speed = clamp(car.speed, -160, maxSpeed);
  const steerDir = car.speed >= 0 ? 1 : -1;
  // A car can creep-turn at low speed (a three-point turn); it only
  // spins in place when it is truly stopped.
  const steerAmt = Math.abs(car.speed) > 5 ? 2.4 * dt * steerDir * clamp(Math.abs(car.speed) / 120, 0.15, 1) : 0;
  if (left) car.angle -= steerAmt;
  if (right) car.angle += steerAmt;
  // Keep the heading wrapped so it never winds up over a long drive.
  if (car.angle > Math.PI || car.angle < -Math.PI) car.angle = Math.atan2(Math.sin(car.angle), Math.cos(car.angle));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const c = clampToWorld(car.x, car.y, 30);
  if (c.x !== car.x || c.y !== car.y) { car.speed *= 0.4; car.x = c.x; car.y = c.y; }
  // The sea stops cars: the beach is drivable, the water is not.
  if (car.x > 3480) { car.x = 3480; car.speed *= 0.5; }
  const hit = resolveBuildingCollision(g.world, car.x, car.y, 24);
  if (hit.x !== car.x || hit.y !== car.y) {
    if (Math.abs(car.speed) > 200) {
      g.particles.sparks(car.x, car.y);
      g.particles.addShake(5);
      g.audio.crash();
    }
    car.speed *= 0.55;
    car.x = hit.x; car.y = hit.y;
  }
  // Brake smoke, dust and skid marks when braking hard or sliding.
  if ((back && car.speed > 100) || (fwd && Math.abs(car.speed) > 380)) {
    g.particles.smoke(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 0, 0);
  }
  if (back && car.speed > 100) {
    const rx = car.x - Math.cos(car.angle) * 18;
    const ry = car.y - Math.sin(car.angle) * 18;
    g.particles.skid(rx, ry);
    if (!car.skidCd || car.skidCd <= 0) { g.audio.skid(); car.skidCd = 0.3; }
  }
  if (car.skidCd) car.skidCd -= dt;
  // Hitting a pedestrian.
  for (const ped of g.peds) {
    if (ped.down) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 120) {
      knockPed(g, ped);
      addWanted(g, 1);
      addMessage(g, 'You ran over a pedestrian.');
      g.particles.addShake(6);
      car.speed *= 0.7;
    }
  }
  // Bumping traffic cars slows both down. Police cars are excluded: they
  // interact through their own cooldown-gated ram, or a glued cop would
  // drain the player's speed to zero every single tick. The slowdown is
  // cooldown-gated for the same reason: a car stuck bumper-to-bumper
  // behind you must not pin you in place.
  for (const other of g.cars) {
    if (other === car || other.kind === 'parked' || other.kind === 'police') continue;
    const od = dist(car.x, car.y, other.x, other.y);
    if (od < 46 && od > 0.01) {
      const push = 46 - od;
      const a = angleTo(other.x, other.y, car.x, car.y);
      car.x += Math.cos(a) * push * 0.5;
      car.y += Math.sin(a) * push * 0.5;
      other.x -= Math.cos(a) * push * 0.5;
      other.y -= Math.sin(a) * push * 0.5;
      if (!car.bumpCd || car.bumpCd <= 0) {
        if (Math.abs(car.speed) > 200) { g.particles.sparks(car.x, car.y); g.audio.crash(); }
        car.speed *= 0.9;
        car.bumpCd = 0.5;
      }
    }
  }
  if (car.bumpCd) car.bumpCd -= dt;
  p.x = car.x; p.y = car.y;
  p.angle = car.angle;
  p.speed = Math.abs(car.speed);
  if (input.wasPressed('e')) exitCar(g);
}

// ---------- traffic ----------

function updateTraffic(g, dt) {
  for (const car of g.cars) {
    if (car.kind !== 'traffic') continue;
    const from = g.graph.nodes[car.from];
    const to = g.graph.nodes[car.to];
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    // Right-hand lane offset.
    const dx = (to.x - from.x) / len;
    const dy = (to.y - from.y) / len;
    const ox = -dy * 26;
    const oy = dx * 26;
    car.x = from.x + dx * len * car.t + ox;
    car.y = from.y + dy * len * car.t + oy;
    car.angle = Math.atan2(dy, dx);
    // Brake if a car is ahead in the same lane.
    let blocked = false;
    for (const other of g.cars) {
      if (other === car || other.kind === 'parked' || other.kind === 'pink') continue;
      const ahead = (other.x - car.x) * dx + (other.y - car.y) * dy;
      const side = Math.abs((other.x - car.x) * -dy + (other.y - car.y) * dx);
      if (ahead > 0 && ahead < 78 && side < 30) { blocked = true; break; }
    }
    // Brake for the player car crossing ahead too.
    const pc = g.player.car;
    if (pc && pc !== car) {
      const ahead = (pc.x - car.x) * dx + (pc.y - car.y) * dy;
      const side = Math.abs((pc.x - car.x) * -dy + (pc.y - car.y) * dx);
      if (ahead > 0 && ahead < 70 && side < 34) blocked = true;
    }
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -320 * dt, 200 * dt);
    car.t += (car.speed * dt) / len;
    if (car.t >= 1) {
      car.t = 0;
      car.from = car.to;
      const outs = g.graph.edges.filter(([a]) => a === car.to).map(([, b]) => b);
      const options = outs.filter((n) => n !== car.from);
      car.to = g.rng.pick(options.length ? options : outs);
    }
  }
}

// ---------- pedestrians ----------

function updatePeds(g, dt) {
  for (const ped of g.peds) {
    if (ped.down) {
      ped.downT += dt;
      if (ped.downT > 6) {
        ped.down = false;
        ped.downT = 0;
        const edge = g.graph.edges[g.rng.int(0, g.graph.edges.length - 1)];
        ped.from = edge[0]; ped.to = edge[1]; ped.t = g.rng.next();
      }
      continue;
    }
    // Panic: a fast car bearing down sends the pedestrian scurrying
    // further from the road.
    const pc = g.player.car;
    let panic = 0;
    if (pc && Math.abs(pc.speed) > 150 && dist(pc.x, pc.y, ped.x, ped.y) < 170) panic = 1;
    ped.panic = Math.max(panic, (ped.panic || 0) - dt * 0.7);
    const from = g.graph.nodes[ped.from];
    const to = g.graph.nodes[ped.to];
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) / len;
    const dy = (to.y - from.y) / len;
    // Sidewalk: just outside the road edge, further out while panicking.
    const off = 72 + (ped.panic || 0) * 46;
    const ox = -dy * off;
    const oy = dx * off;
    ped.x = from.x + dx * len * ped.t + ox;
    ped.y = from.y + dy * len * ped.t + oy;
    ped.t += ((ped.panic ? ped.speed * 2 : ped.speed) * dt) / len;
    if (ped.t >= 1) {
      ped.t = 0;
      ped.from = ped.to;
      const outs = g.graph.edges.filter(([a]) => a === ped.to).map(([, b]) => b);
      const options = outs.filter((n) => n !== ped.from);
      ped.to = g.rng.pick(options.length ? options : outs);
    }
  }
}

// ---------- police ----------

function updatePolice(g, dt) {
  const p = g.player;
  // Spawn cop cars up to the wanted level.
  const wantCars = Math.min(g.wanted, 3);
  while (g.copCars.length < wantCars) {
    const a = g.rng.range(0, Math.PI * 2);
    const r = g.rng.range(500, 750);
    const x = clamp(p.x + Math.cos(a) * r, 120, WORLD_W - 120);
    const y = clamp(p.y + Math.sin(a) * r, 120, WORLD_H - 120);
    const car = {
      id: `cop-${g.time.toFixed(0)}-${g.copCars.length}`, x, y,
      angle: angleTo(x, y, p.x, p.y), speed: 0, color: '#2a2a3a',
      kind: 'police', w: 56, h: 26, steer: 0,
    };
    g.copCars.push(car);
    g.cars.push(car);
    g.audio.siren();
  }
  // Despawn when the heat is gone.
  if (g.wanted === 0) {
    for (const c of g.copCars) {
      const i = g.cars.indexOf(c);
      if (i >= 0) g.cars.splice(i, 1);
    }
    g.copCars = [];
    g.cops = [];
  }
  // Cop cars chase and ram. They follow the road network toward the
  // player (like any driver) and only switch to a direct ramming run
  // when close — a cop that steers straight through a warehouse wedges
  // itself on the corner and pins the player with it.
  for (let ci = g.copCars.length - 1; ci >= 0; ci -= 1) {
    const car = g.copCars[ci];
    // A cop that falls far behind loses the trail and gives up.
    if (dist(car.x, car.y, p.x, p.y) > 900) {
      const i = g.cars.indexOf(car);
      if (i >= 0) g.cars.splice(i, 1);
      g.copCars.splice(ci, 1);
      continue;
    }
    const d = dist(car.x, car.y, p.x, p.y);
    if (car.mode !== 'chase' && d < 220) car.mode = 'chase';
    if (car.mode === 'chase' && d > 320) { car.mode = 'route'; car.repathT = 0; }
    if (car.mode === 'chase') {
      const targetA = angleTo(car.x, car.y, p.x, p.y);
      const diff = angleDiff(car.angle, targetA);
      car.angle += clamp(diff, -2.8 * dt, 2.8 * dt);
      const wantSpeed = d > 260 ? 400 : 320;
      car.speed += clamp(wantSpeed - car.speed, -300 * dt, 260 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
    } else {
      // Route mode: follow the road graph to the player's neighbourhood.
      if (car.repathT === undefined) car.repathT = 0;
      car.repathT -= dt;
      if (!car.path || car.repathT <= 0) {
        car.path = findPath(g.graph, car.x, car.y, p.x, p.y);
        car.pathIdx = 0;
        car.repathT = 1.5;
      }
      const node = car.pathIdx < car.path.length ? g.graph.nodes[car.path[car.pathIdx]] : null;
      if (node) {
        if (dist(car.x, car.y, node.x, node.y) < 50) car.pathIdx += 1;
        else {
          const targetA = angleTo(car.x, car.y, node.x, node.y);
          const diff = angleDiff(car.angle, targetA);
          car.angle += clamp(diff, -2.8 * dt, 2.8 * dt);
          car.speed += clamp(380 - car.speed, -300 * dt, 260 * dt);
          car.x += Math.cos(car.angle) * car.speed * dt;
          car.y += Math.sin(car.angle) * car.speed * dt;
        }
      } else {
        car.speed = Math.max(0, car.speed - 200 * dt);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
      }
    }
    if (car.x > 3480) { car.x = 3480; car.speed *= 0.5; }
    const hit = resolveBuildingCollision(g.world, car.x, car.y, 24);
    if (hit.x !== car.x || hit.y !== car.y) { car.speed *= 0.5; car.x = hit.x; car.y = hit.y; }
    // Ram the player's car: one shove per cooldown window, then the cop
    // bounces back off the impact — a glued cop must not pin the player
    // against a wall.
    if (!p.onFoot && p.car && dist(car.x, car.y, p.car.x, p.car.y) < 50) {
      if (!car.ramCd || car.ramCd <= 0) {
        const a = angleTo(car.x, car.y, p.car.x, p.car.y);
        p.car.x += Math.cos(a) * 12;
        p.car.y += Math.sin(a) * 12;
        p.car.speed *= 0.9;
        g.particles.sparks(p.car.x, p.car.y);
        g.particles.addShake(4);
        g.audio.crash();
        car.ramCd = 3;
        car.speed *= -0.4;
      }
    }
    if (car.ramCd) car.ramCd -= dt;
  // On foot: a close cop car drops a foot cop, but never on top of you,
  // and at most one every few seconds. During a shootout the police hold
  // the cordon and do not move in on foot.
  if (g.copSpawnCd === undefined) g.copSpawnCd = 0;
  g.copSpawnCd -= dt;
  const stepNow = currentStep(g);
  if (p.onFoot && d < 170 && d > 90 && g.cops.length < 2 && g.copSpawnCd <= 0 && g.rng.chance(0.05) && !(stepNow && stepNow.type === 'kill')) {
    g.cops.push({ x: car.x, y: car.y, speed: 245 });
    g.copSpawnCd = 4;
  }
  }
  // Foot cops run the player down; a touch is an arrest. They give up
  // once the player is back in a car and far away. Cops obey walls too.
  for (let i = g.cops.length - 1; i >= 0; i -= 1) {
    const cop = g.cops[i];
    if (!p.onFoot && dist(cop.x, cop.y, p.x, p.y) > 500) { g.cops.splice(i, 1); continue; }
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.x += Math.cos(a) * cop.speed * dt;
    cop.y += Math.sin(a) * cop.speed * dt;
    const hit = resolveBuildingCollision(g.world, cop.x, cop.y, 14);
    cop.x = hit.x; cop.y = hit.y;
    // An arrest needs the officer to actually reach you on foot: a cop
    // touching your car cannot pull you out of it.
    if (p.onFoot && dist(cop.x, cop.y, p.x, p.y) < 30) {
      loseGame(g, 'busted');
      return;
    }
  }
  // Hiding: out of every cop's sight for 14 s drops one star.
  let nearest = Infinity;
  for (const car of g.copCars) nearest = Math.min(nearest, dist(car.x, car.y, p.x, p.y));
  for (const cop of g.cops) nearest = Math.min(nearest, dist(cop.x, cop.y, p.x, p.y));
  if (g.wanted > 0) {
    if (nearest > 560) {
      g.hideTimer += dt;
      if (g.hideTimer >= 14) {
        g.wanted -= 1;
        g.hideTimer = 0;
        addMessage(g, g.wanted > 0 ? `Heat dropping. ${g.wanted} star${g.wanted === 1 ? '' : 's'} left.` : 'You lost them. Heat is off.');
      }
    } else {
      g.hideTimer = 0;
    }
  }
}

function hurtPlayer(g, dmg) {
  const p = g.player;
  if (g.time - p.lastHurt < 0.4) return;
  p.hp -= dmg;
  p.lastHurt = g.time;
  g.particles.addShake(3);
  if (p.hp <= 0) { p.hp = 0; loseGame(g, 'wasted'); }
}

// ---------- enemies ----------

function updateEnemies(g, dt) {
  const p = g.player;
  for (const e of g.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    e.angle = angleTo(e.x, e.y, p.x, p.y);
    // Close in if far, hold ground and shoot if near.
    if (d > 300) {
      e.x += Math.cos(e.angle) * 90 * dt;
      e.y += Math.sin(e.angle) * 90 * dt;
      e.walkPhase += dt * 8;
    }
    e.fireCd -= dt;
    if (e.fireCd <= 0 && d < 460) {
      e.fireCd = 1.8;
      // Hit chance falls with distance.
      const chance = d < 180 ? 0.4 : d < 320 ? 0.28 : 0.16;
      const mx = p.x + Math.cos(e.angle) * 26;
      const my = p.y + Math.sin(e.angle) * 26;
      g.particles.muzzle(mx, my, e.angle);
      g.audio.shoot();
      if (g.rng.next() < chance) {
        hurtPlayer(g, 4);
        g.particles.blood(p.x, p.y);
      }
    }
  }
}

// ---------- mission progress ----------

function updateMissions(g, dt) {
  const step = currentStep(g);
  if (!step || g.mode !== 'play') return;
  const p = g.player;
  const stepKey = `${g.missionIndex}:${g.missionStep}`;
  // Timed delivery: a fresh deadline when the step starts. Missing it
  // costs heat, never the run — the job still pays.
  if (step.type === 'timed') {
    if (g.timedStepKey !== stepKey) {
      g.timedStepKey = stepKey;
      g.stepDeadline = g.time + (step.timeLimit || 120);
      g.stepTimedOut = false;
    }
    if (!g.stepTimedOut && g.time > g.stepDeadline) {
      g.stepTimedOut = true;
      addWanted(g, 2);
      addMessage(g, 'Too slow — the clock ran out and the heat is on. Finish it anyway.');
      g.audio.siren();
    }
    const t = g.world.places[step.key];
    const arrived = step.carId
      ? (!p.onFoot && p.car && p.car.id === step.carId && dist(p.x, p.y, t.x, t.y) < 90)
      : dist(p.x, p.y, t.x, t.y) < 90;
    if (arrived) {
      if (!g.stepTimedOut) {
        g.money += 100;
        g.particles.floater(p.x, p.y - 40, '+$100 on time', '#7ae87a');
        addMessage(g, 'On time. $100 speed bonus.');
      }
      completeStep(g);
    }
    return;
  }
  // On-foot pickup: reach the marker without a car.
  if (step.type === 'walk') {
    const t = g.world.places[step.key];
    if (p.onFoot && dist(p.x, p.y, t.x, t.y) < 90) completeStep(g);
    return;
  }
  // Lay low: bank seconds out of every cop's sight; being spotted only
  // pauses the count, it never resets it.
  if (step.type === 'hide') {
    if (g.wanted === 0) { completeStep(g); return; }
    if (g.hideStepKey !== stepKey) { g.hideStepKey = stepKey; g.hideProgress = 0; }
    let nearest = Infinity;
    for (const car of g.copCars) nearest = Math.min(nearest, dist(car.x, car.y, p.x, p.y));
    for (const cop of g.cops) nearest = Math.min(nearest, dist(cop.x, cop.y, p.x, p.y));
    if (nearest > 400) {
      g.hideProgress += dt;
      if (g.hideProgress >= (step.hideNeed || 10)) {
        addMessage(g, 'They lost your trail. Now get home.');
        completeStep(g);
      }
    }
    return;
  }
  if (step.type === 'goto' || step.type === 'escape') {
    const t = g.world.places[step.key];
    if (dist(p.x, p.y, t.x, t.y) < 80) {
      if (step.type === 'escape') {
        // Must have shaken the nearest cop to slip home.
        let nearest = Infinity;
        for (const car of g.copCars) nearest = Math.min(nearest, dist(car.x, car.y, p.x, p.y));
        for (const cop of g.cops) nearest = Math.min(nearest, dist(cop.x, cop.y, p.x, p.y));
        if (nearest > 60 || g.wanted === 0) completeStep(g);
      } else {
        completeStep(g);
      }
    }
  } else if (step.type === 'steal') {
    if (!p.onFoot && p.car && p.car.id === 'pink') completeStep(g);
  } else if (step.type === 'deliver') {
    const t = g.world.places[step.key];
    if (!p.onFoot && p.car && p.car.id === step.carId && dist(p.x, p.y, t.x, t.y) < 90) completeStep(g);
  } else if (step.type === 'kill') {
    if (g.enemies.length && g.enemies.every((e) => e.hp <= 0)) {
      addWanted(g, 3);
      addMessage(g, 'They are down. The whole harbor heard it — lose the heat!');
      completeStep(g);
    }
  }
}

// ---------- camera ----------

function updateCamera(g, dt) {
  const p = g.player;
  const tx = clamp(p.x, 640, WORLD_W - 640);
  const ty = clamp(p.y, 360, WORLD_H - 360);
  const k = 1 - Math.pow(0.001, dt);
  g.camera.x += (tx - g.camera.x) * k;
  g.camera.y += (ty - g.camera.y) * k;
}

// ---------- autopilot (headless testing only) ----------

export function autopilotInput(g) {
  const input = {
    keys: new Set(),
    down(k) { return this.keys.has(k); },
    wasPressed(k) { return this.pressed.has(k); },
    pressed: new Set(),
    moveVector() { return this.mv; },
    mv: { x: 0, y: 0 },
    mouseX: 640, mouseY: 360, mouseDown: false, mousePressed: false,
    endTick() { this.pressed.clear(); this.mousePressed = false; },
  };
  const p = g.player;
  const step = currentStep(g);
  if (!step || g.mode !== 'play') return input;
  // A foot cop closing in beats everything else: run first, fight later.
  // Prefer running to your own car so you can drive away from the arrest —
  // except on a walk step, where climbing back in just re-triggers the
  // exit and lets the cop close in during the dance.
  if (p.onFoot && g.cops.length) {
    let nearCop = null; let nearD = 170;
    for (const cop of g.cops) {
      const d = dist(p.x, p.y, cop.x, cop.y);
      if (d < nearD) { nearD = d; nearCop = cop; }
    }
    if (nearCop) {
      const car = g.lastCar;
      if (car && step.type !== 'walk' && dist(p.x, p.y, car.x, car.y) < 500) {
        // Run to the car only when the cop is not standing between you
        // and it — otherwise you run straight into the arrest.
        const aCar = angleTo(p.x, p.y, car.x, car.y);
        const aCop = angleTo(p.x, p.y, nearCop.x, nearCop.y);
        if (Math.abs(angleDiff(aCar, aCop)) > 1.0) {
          if (dist(p.x, p.y, car.x, car.y) < 60) { input.pressed.add('e'); return input; }
          input.mv = { x: Math.cos(aCar), y: Math.sin(aCar) };
          input.keys.add('Shift');
          return input;
        }
      }
      const a = angleTo(nearCop.x, nearCop.y, p.x, p.y);
      input.mv = { x: Math.cos(a), y: Math.sin(a) };
      input.keys.add('Shift');
      return input;
    }
  }
  // Hide step: outrun the nearest cop, then sit still and go dark.
  if (step.type === 'hide') {
    let nearest = Infinity;
    for (const c of g.copCars) nearest = Math.min(nearest, dist(p.x, p.y, c.x, c.y));
    for (const c of g.cops) nearest = Math.min(nearest, dist(p.x, p.y, c.x, c.y));
    if (nearest < 450) {
      // On foot, a car is the escape: run to the nearest one and take
      // it instead of trying to outrun the law on foot.
      if (p.onFoot) {
        const car = nearestCar(g, p.x, p.y, 500);
        if (car) {
          const d = dist(p.x, p.y, car.x, car.y);
          if (d < 60) { input.pressed.add('e'); return input; }
          const a = angleTo(p.x, p.y, car.x, car.y);
          input.mv = { x: Math.cos(a), y: Math.sin(a) };
          input.keys.add('Shift');
          return input;
        }
        let bx = 0; let by = 0; let bd = -1;
        for (const n of g.graph.nodes) {
          const d = dist(p.x, p.y, n.x, n.y);
          if (d > bd) { bd = d; bx = n.x; by = n.y; }
        }
        const a = angleTo(p.x, p.y, bx, by);
        input.mv = { x: Math.cos(a), y: Math.sin(a) };
        input.keys.add('Shift');
        return input;
      }
      // In a car: keep driving for one latched far corner until it is
      // reached. Re-picking the farthest node every tick made the car
      // swing back and forth and never open a gap.
      if (!g.hideTarget || dist(p.x, p.y, g.hideTarget.x, g.hideTarget.y) < 150) {
        let best = null; let bd = -1;
        for (const n of g.graph.nodes) {
          const d = dist(p.x, p.y, n.x, n.y);
          if (d > bd) { bd = d; best = n; }
        }
        if (best) g.hideTarget = { x: best.x, y: best.y };
      }
      if (g.hideTarget) {
        const wp = nextWaypoint(g, g.hideTarget.x, g.hideTarget.y);
        const desired = angleTo(p.x, p.y, wp.x, wp.y);
        const diff = angleDiff(p.car.angle, desired);
        // Slow down for the next corner or the car orbits the waypoint
        // at full speed and never reaches it.
        const dWp = dist(p.x, p.y, wp.x, wp.y);
        if (Math.abs(p.car.speed) > 300 && dWp < 260) input.keys.add('s');
        else input.keys.add('w');
        if (diff > 0.12) input.keys.add('d');
        else if (diff < -0.12) input.keys.add('a');
      }
      return input;
    }
    return input; // out of sight: stay put and let the timer bank
  }
  // Walk step: never in a car. Get out first, then walk the roads.
  if (step.type === 'walk' && !p.onFoot) {
    input.pressed.add('e');
    return input;
  }
  const obj = currentObjective(g);
  if (!obj) return input;

  // Mission 3 combat: fight on foot, aim at the nearest living enemy.
  const alive = g.enemies.filter((e) => e.hp > 0);
  if (step.type === 'kill' && alive.length) {
    let best = alive[0]; let bd = Infinity;
    for (const e of alive) { const d = dist(p.x, p.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    if (!p.onFoot) {
      // Park near the fight, then get out.
      if (bd < 320) { input.pressed.add('e'); return input; }
    } else {
      const d = dist(p.x, p.y, best.x, best.y);
      if (d > 320) {
        const a = angleTo(p.x, p.y, best.x, best.y);
        input.mv = { x: Math.cos(a), y: Math.sin(a) };
        input.keys.add('Shift');
      } else if (d < 60) {
        input.pressed.add(' ');
      } else {
        // Aim the mouse at the enemy in screen space, measured from the
        // camera (the camera clamps at the world edge, so the player is
        // not always at screen centre).
        input.mouseX = 640 + (best.x - g.camera.x);
        input.mouseY = 360 + (best.y - g.camera.y);
        if (p.ammo <= 0 && p.reserveAmmo > 0) input.pressed.add('r');
        else input.mousePressed = true;
        input.mouseDown = true;
      }
    }
    return input;
  }

  const target = obj;
  const dTarget = dist(p.x, p.y, target.x, target.y);
  const needCar = dTarget > 300 && step.type !== 'kill' && step.type !== 'walk';
  if (p.onFoot) {
    // Flee a foot cop that is closing in.
    let nearCop = null; let nearD = 170;
    for (const cop of g.cops) {
      const d = dist(p.x, p.y, cop.x, cop.y);
      if (d < nearD) { nearD = d; nearCop = cop; }
    }
    if (nearCop) {
      const a = angleTo(nearCop.x, nearCop.y, p.x, p.y);
      input.mv = { x: Math.cos(a), y: Math.sin(a) };
      input.keys.add('Shift');
      return input;
    }
    // Steal step: walk straight to the target car and take it — but only
    // press E once it is the nearest car, or you climb back into the car
    // you just got out of.
    if (step.type === 'steal') {
      const pink = g.cars.find((c) => c.id === step.carId);
      if (pink) {
        const d = dist(p.x, p.y, pink.x, pink.y);
        const other = nearestCar(g, p.x, p.y, 78);
        if (d < 60 && (!other || other.id === step.carId)) { input.pressed.add('e'); return input; }
        const a = angleTo(p.x, p.y, pink.x, pink.y);
        input.mv = { x: Math.cos(a), y: Math.sin(a) };
        input.keys.add('Shift');
        return input;
      }
    }
    if (needCar) {
      const car = nearestCar(g, p.x, p.y, 220);
      if (car) {
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < 60) { input.pressed.add('e'); return input; }
        const a = angleTo(p.x, p.y, car.x, car.y);
        input.mv = { x: Math.cos(a), y: Math.sin(a) };
        input.keys.add('Shift');
        return input;
      }
    }
    // Walk along the road graph to stay out of buildings.
    const wp = nextWaypoint(g, target.x, target.y);
    const a = angleTo(p.x, p.y, wp.x, wp.y);
    input.mv = { x: Math.cos(a), y: Math.sin(a) };
    input.keys.add('Shift');
    return input;
  }
  // Driving: steer along the road graph toward the target.
  // Escape step: with a cop on your tail, first shake them — drive to
  // the farthest corner of the city at full speed — and only turn for
  // home once the gap is wide.
  let effX = target.x; let effY = target.y;
  if (step.type === 'escape') {
    let nearCop = Infinity;
    for (const c of g.copCars) nearCop = Math.min(nearCop, dist(p.x, p.y, c.x, c.y));
    for (const c of g.cops) nearCop = Math.min(nearCop, dist(p.x, p.y, c.x, c.y));
    if (nearCop > 350) g.shakeTarget = null;
    // Only shake the tail while still far from home. Once the house is
    // close, drive straight for it — turning away every time a cop gets
    // near means never arriving at all.
    if (dTarget > 800 && nearCop < 200) {
      // Latch one far corner and hold it: re-picking every tick makes
      // the car swing back and forth instead of opening a gap.
      if (!g.shakeTarget || dist(p.x, p.y, g.shakeTarget.x, g.shakeTarget.y) < 150) {
        let best = null; let bd = -1;
        for (const n of g.graph.nodes) {
          const d = dist(p.x, p.y, n.x, n.y);
          if (d > bd) { bd = d; best = n; }
        }
        if (best) g.shakeTarget = { x: best.x, y: best.y };
      }
      if (g.shakeTarget) { effX = g.shakeTarget.x; effY = g.shakeTarget.y; }
    }
  }
  const wp = nextWaypoint(g, effX, effY);
  const desired = angleTo(p.x, p.y, wp.x, wp.y);
  const diff = angleDiff(p.car.angle, desired);
  const dWp = dist(p.x, p.y, wp.x, wp.y);
  const arrived = dTarget < 90;
  if (arrived && step.type === 'goto') {
    // A goto step completes by proximity; stay in the car.
    return input;
  }
  // Steal step: park beside the target car and get out to take it.
  if (step.type === 'steal' && dTarget < 140) {
    input.pressed.add('e');
    return input;
  }
  // Slow down for the next corner and while off the road, or the car
  // overshoots the turn and ends up mowing down pedestrians. On the
  // final escape run, keep the speed up through the front door.
  const onRoad = roadDistance(p.x, p.y) < 100;
  const wantSpeed = step.type === 'escape' && dTarget < 400 ? 400
    : dWp < 260 ? 260 : (Math.abs(diff) > 0.9 ? 260 : onRoad ? 520 : 200);
  const spd = Math.abs(p.car.speed);
  if (spd > wantSpeed + 20 && spd > 30) input.keys.add('s');
  else if (Math.abs(diff) < 1.2 || spd < 60) input.keys.add('w');
  if (diff > 0.12) input.keys.add('d');
  else if (diff < -0.12) input.keys.add('a');
  // Stuck recovery: reverse out.
  if (g.autopilotStuck === undefined) g.autopilotStuck = 0;
  if (Math.abs(p.car.speed) < 15 && input.keys.has('w')) g.autopilotStuck += DT;
  else g.autopilotStuck = 0;
  if (g.autopilotStuck > 2.5) {
    input.keys.delete('w');
    input.keys.add('s');
    if (diff > 0) input.keys.add('a'); else input.keys.add('d');
    if (g.autopilotStuck > 3.6) g.autopilotStuck = 0;
  }
  return input;
}

// Distance from a point to the nearest road centre line.
function roadDistance(x, y) {
  let best = Infinity;
  for (const cx of COLS) best = Math.min(best, Math.abs(x - cx));
  for (const ry of ROWS) best = Math.min(best, Math.abs(y - ry));
  return best;
}

function nextWaypoint(g, tx, ty) {
  const p = g.player;
  // Off the road network, head for the nearest point on a road first:
  // a straight line to the next node can cut straight through a block
  // and wedge the car on a building corner.
  if (roadDistance(p.x, p.y) > 110) {
    let best = null; let bd = Infinity;
    for (const cx of COLS) {
      const d = Math.abs(p.x - cx);
      if (d < bd) { bd = d; best = { x: cx, y: p.y }; }
    }
    for (const ry of ROWS) {
      const d = Math.abs(p.y - ry);
      if (d < bd) { bd = d; best = { x: p.x, y: ry }; }
    }
    if (best) {
      const c = clampToWorld(best.x, best.y, 30);
      return { x: c.x, y: c.y };
    }
  }
  const ap = g.autopilot;
  const curNode = ap && ap.idx < ap.path.length ? g.graph.nodes[ap.path[ap.idx]] : null;
  // Recompute only when the target changed or the car was knocked far off
  // its route. Recomputing every time the path runs out made the car
  // flip-flop between the last node and the target forever.
  if (!ap || ap.tx !== tx || ap.ty !== ty || (curNode && dist(p.x, p.y, curNode.x, curNode.y) > 800)) {
    const path = findPath(g.graph, p.x, p.y, tx, ty);
    g.autopilot = { tx, ty, path, idx: 0 };
  }
  const a = g.autopilot;
  while (a.idx < a.path.length) {
    const node = g.graph.nodes[a.path[a.idx]];
    if (dist(p.x, p.y, node.x, node.y) < 70) a.idx += 1;
    else return { x: node.x, y: node.y };
  }
  return { x: tx, y: ty };
}

// Daylight factor 0..1 from the in-game clock (17:00 sunset -> night).
export function daylight(g) {
  const m = g.clockMinutes % 1440;
  if (m < 17 * 60) return 1;
  if (m > 20 * 60) return 0.35;
  return 1 - ((m - 17 * 60) / 180) * 0.65;
}
