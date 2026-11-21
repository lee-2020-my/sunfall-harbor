// Headless Sunfall Harbor playthrough. Runs the real game logic in Node
// (no browser, no canvas) with the autopilot driving: start, all three
// missions, victory. Usage: node scripts/simulate.mjs [seed ...]
// Exits 0 only when every listed seed ends in WIN.
import { createGame, update, autopilotInput, startMission, DT, currentMission } from '../game/src/game.js';

function runSeed(seed) {
  const g = createGame(seed, null);
  const maxTicks = 60 * 60 * 12; // 12 game-minutes of simulated play
  let ticks = 0;
  const enter = {
    keys: new Set(), pressed: new Set(['Enter']),
    down() { return false; },
    wasPressed(k) { return k === 'Enter'; },
    moveVector() { return { x: 0, y: 0 }; },
    mouseX: 640, mouseY: 360, mouseDown: false, mousePressed: false,
    endTick() { this.pressed.clear(); },
  };
  while (ticks < maxTicks) {
    let input;
    if (g.mode === 'title') {
      input = enter;
      update(g, input, DT);
      enter.pressed.clear();
      if (g.mode === 'title') {
        // Title screen: start mission 1.
        startMission(g, 0);
        g.briefTimer = 1;
      }
    } else if (g.mode === 'brief') {
      input = enter;
      enter.pressed.add('Enter');
      update(g, input, DT);
      enter.pressed.clear();
    } else if (g.mode === 'play') {
      input = autopilotInput(g);
      update(g, input, DT);
      input.endTick();
    } else if (g.mode === 'over') {
      break;
    } else if (g.mode === 'paused') {
      break;
    }
    ticks += 1;
    if (ticks % (60 * 30) === 0) {
      const m = currentMission(g);
      console.log(`  seed ${seed} t=${(ticks / 60).toFixed(0)}s mission=${m ? m.id : 'done'} step=${g.missionStep} hp=${Math.round(g.player.hp)} wanted=${g.wanted} money=$${g.money} pos=(${Math.round(g.player.x)},${Math.round(g.player.y)}) ${g.player.onFoot ? 'foot' : 'car'}`);
    }
  }
  const result = g.outcome === 'win' ? 'WIN' : (g.mode === 'over' ? g.outcome.toUpperCase() : 'TIMEOUT');
  console.log(`seed ${seed}: ${result} in ${(ticks / 60).toFixed(1)}s — money $${g.money}, hp ${Math.round(g.player.hp)}, wanted ${g.wanted}, shots ${g.stats.shots}, hits ${g.stats.hits}, cars stolen ${g.stats.carsStolen}`);
  return result === 'WIN';
}

const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (!seeds.length) seeds.push(1, 7, 42);
let ok = true;
for (const s of seeds) {
  if (!runSeed(s)) ok = false;
}
process.exit(ok ? 0 : 1);
