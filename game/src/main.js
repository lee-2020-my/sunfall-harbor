// Sunfall Harbor entry point: canvas setup, fixed-step loop, save data,
// menu keys and the deterministic ?shot= states.
import { createGame, update, startMission, winGame, DT } from './game.js';
import { render } from './render.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'sunfall-harbor-save-v1';

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return s;
  } catch {
    return null;
  }
}
function writeSave(g) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: g.money,
      missionIndex: Math.min(g.missionIndex, 2),
      best: g.best,
    }));
  } catch {
    // Storage unavailable (private mode, file://): the game still plays.
  }
}

function seedFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const s = Number(q.get('seed'));
  return Number.isFinite(s) && s !== 0 ? Math.floor(Math.abs(s)) : 1;
}

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const seed = seedFromUrl();
  const audio = new AudioEngine();
  const g = createGame(seed, audio);
  const input = new Input(canvas);
  const save = loadSave();
  if (save) {
    g.money = save.money || 0;
    g.best = save.best || 0;
    g.savedMission = save.missionIndex || 0;
  }

  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (shot) {
    // Deterministic screenshot state: build, render twice, flag ready.
    const ok = applyShot(ctx, g, shot);
    window.__shotReady = ok;
    return;
  }
  // Test hook: lets automated play-tests read live game state.
  window.__game = g;

  let last = performance.now();
  let acc = 0;
  let savedAt = -1;

  function frame(now) {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += elapsed;
    // Menu keys are handled once per rendered frame, not per tick.
    if (g.mode === 'title' && (input.wasPressed('Enter') || input.mousePressed)) {
      audio.ensure();
      const startAt = g.savedMission && g.savedMission > 0 ? g.savedMission : 0;
      startMission(g, startAt);
      g.briefTimer = 1;
    } else if (g.mode === 'over' && g.overTimer > 1 && input.wasPressed('Enter')) {
      const fresh = createGame(seed, audio);
      fresh.best = g.best;
      fresh.money = 0;
      Object.assign(g, fresh);
      g.mode = 'title';
    }
    while (acc >= DT) {
      update(g, input, DT);
      input.endTick();
      acc -= DT;
    }
    // Persist progress at mission boundaries and on victory.
    const key = `${g.missionIndex}:${g.mode}:${g.outcome || ''}`;
    if (key !== savedAt && (g.mode === 'brief' || g.mode === 'over')) {
      savedAt = key;
      writeSave(g);
    }
    render(ctx, g);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

document.addEventListener('DOMContentLoaded', boot);
