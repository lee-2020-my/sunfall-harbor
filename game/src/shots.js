// Deterministic screenshot states for ?shot=. Each one builds a fixed,
// seeded scene, steps it forward a fixed number of ticks, and renders it
// twice before the caller sets window.__shotReady. No wall-clock input.
import { createGame, startMission, update, DT } from './game.js';
import { render } from './render.js';

function stepGame(g, input, ticks) {
  for (let i = 0; i < ticks; i += 1) update(g, input, DT);
}

function playInput() {
  return {
    keys: new Set(), pressed: new Set(),
    down() { return false; },
    wasPressed() { return false; },
    moveVector() { return { x: 0, y: 0 }; },
    mouseX: 640, mouseY: 360, mouseDown: false, mousePressed: false,
    endTick() {},
  };
}

function enterInput() {
  const input = playInput();
  input.wasPressed = (k) => k === 'Enter';
  return input;
}

// Start screen.
export function shotStart(g) {
  g.mode = 'title';
  g.time = 12;
  g.camera.x = g.world.places.playerStart.x;
  g.camera.y = g.world.places.playerStart.y;
}

// Mid-mission driving on the avenues.
export function shotPlay(g) {
  startMission(g, 0);
  g.briefTimer = 1;
  stepGame(g, enterInput(), 2);
  // Put the player in a car on the main avenue, mid-delivery.
  const car = g.cars.find((c) => c.kind === 'parked');
  car.x = 1700; car.y = 950; car.angle = 0; car.speed = 300;
  g.player.onFoot = false;
  g.player.car = car;
  car.kind = 'driven';
  g.player.x = car.x; g.player.y = car.y;
  g.player.angle = 0;
  g.missionStep = 1;
  g.money = 400;
  g.camera.x = car.x;
  g.camera.y = car.y;
  stepGame(g, playInput(), 30);
  g.banner = null; // the mission bar already names the job; keep the street clear
  g.mode = 'play';
}

// The cover: pink coupe fleeing with two cop cars on its tail, 3 stars.
export function shotChase(g) {
  startMission(g, 1);
  g.briefTimer = 1;
  stepGame(g, enterInput(), 2);
  const pink = g.cars.find((c) => c.id === 'pink');
  pink.x = 1700; pink.y = 1600; pink.angle = 0; pink.speed = 420;
  g.player.onFoot = false;
  g.player.car = pink;
  pink.kind = 'driven';
  pink.stolen = true;
  g.player.x = pink.x; g.player.y = pink.y;
  g.player.angle = 0;
  g.missionStep = 1;
  g.wanted = 3;
  g.money = 400;
  // Two cop cars close behind.
  const mkCop = (dx, dy) => {
    const car = {
      id: `cop-shot-${dx}`, x: pink.x + dx, y: pink.y + dy,
      angle: 0, speed: 400, color: '#2a2a3a', kind: 'police', w: 48, h: 22, steer: 0,
    };
    g.copCars.push(car);
    g.cars.push(car);
    return car;
  };
  mkCop(-140, -52);
  mkCop(-190, 56);
  mkCop(-260, -8);
  g.camera.x = pink.x + 60;
  g.camera.y = pink.y;
  stepGame(g, playInput(), 12);
  g.banner = null; // the mission bar already names the job; keep the chase clear
  g.mode = 'play';
}

// Victory screen.
export function shotEnd(g) {
  g.money = 2700;
  g.best = 2700;
  g.stats = { shots: 41, hits: 29, carsStolen: 3, pedsHit: 0 };
  g.missionIndex = 3;
  g.mode = 'over';
  g.outcome = 'win';
  g.overTimer = 2;
  g.time = 30;
  g.camera.x = g.world.places.home.x;
  g.camera.y = g.world.places.home.y;
}

export const SHOTS = { start: shotStart, play: shotPlay, chase: shotChase, end: shotEnd };

// Build a shot scene, render it twice, and flag readiness.
export function applyShot(ctx, g, name) {
  const fn = SHOTS[name];
  if (!fn) return false;
  fn(g);
  render(ctx, g);
  render(ctx, g);
  return true;
}

export { createGame };
