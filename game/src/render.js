// All drawing for Sunfall Harbor: city, cars, people, particles, HUD,
// minimap and every screen. Canvas 2D only, no images, no external assets.
import { WORLD_W, WORLD_H, ROAD_W, COLS, ROWS } from './world.js';
import { currentMission, currentStep, currentObjective, daylight, MISSIONS } from './game.js';

const VIEW_W = 1280;
const VIEW_H = 720;

export function render(ctx, g) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const shake = g.particles.shakeOffset(g.time);
  const camX = g.camera.x - VIEW_W / 2 + shake.x;
  const camY = g.camera.y - VIEW_H / 2 + shake.y;
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));
  drawWorld(ctx, g);
  drawObjective(ctx, g);
  drawCars(ctx, g);
  drawPeds(ctx, g);
  drawEnemies(ctx, g);
  drawCops(ctx, g);
  drawPlayer(ctx, g);
  drawParticles(ctx, g);
  ctx.restore();
  drawLighting(ctx, g);
  if (g.mode === 'play' || g.mode === 'paused' || g.mode === 'brief') drawHud(ctx, g);
  if (g.mode === 'play' || g.mode === 'paused' || g.mode === 'brief') drawMinimap(ctx, g);
  if (g.mode === 'title') drawTitle(ctx, g);
  else if (g.mode === 'brief') drawBrief(ctx, g);
  else if (g.mode === 'paused') drawPaused(ctx, g);
  else if (g.mode === 'over') drawOver(ctx, g);
}

function drawWorld(ctx, g) {
  const w = g.world;
  const dl = daylight(g);
  // Ground: warm grass.
  ctx.fillStyle = '#a8b878';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Beach sand and sea on the east edge.
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(w.beach.x, w.beach.y, w.beach.w, w.beach.h);
  ctx.fillStyle = '#3a8ab8';
  ctx.fillRect(w.sea.x, w.sea.y, w.sea.w, w.sea.h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let y = 0; y < WORLD_H; y += 90) ctx.fillRect(w.sea.x, y, 4, 40);
  // Park.
  ctx.fillStyle = '#6aa858';
  ctx.fillRect(w.park.x, w.park.y, w.park.w, w.park.h);
  ctx.fillStyle = '#7ab868';
  ctx.beginPath();
  ctx.ellipse(w.park.x + w.park.w / 2, w.park.y + w.park.h / 2, w.park.w / 3, w.park.h / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Harbor concrete.
  ctx.fillStyle = '#9a9a92';
  ctx.fillRect(w.harbor.x, w.harbor.y, w.harbor.w, w.harbor.h);
  // Piers.
  ctx.fillStyle = '#8a6a4a';
  for (const pier of w.piers) ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  // Shipping containers.
  for (const c of w.containers) {
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(c.x, c.y + c.h - 5, c.w, 5);
  }
  // Roads.
  ctx.fillStyle = '#4a4a52';
  for (const cx of COLS) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const ry of ROWS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  // Road centre dashes.
  ctx.fillStyle = '#e8d878';
  for (const cx of COLS) {
    for (let y = 0; y < WORLD_H; y += 64) ctx.fillRect(cx - 3, y, 6, 34);
  }
  for (const ry of ROWS) {
    for (let x = 0; x < WORLD_W; x += 64) ctx.fillRect(x, ry - 3, 34, 6);
  }
  // Sidewalk edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  for (const cx of COLS) {
    ctx.beginPath(); ctx.moveTo(cx - ROAD_W / 2 - 4, 0); ctx.lineTo(cx - ROAD_W / 2 - 4, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + ROAD_W / 2 + 4, 0); ctx.lineTo(cx + ROAD_W / 2 + 4, WORLD_H); ctx.stroke();
  }
  for (const ry of ROWS) {
    ctx.beginPath(); ctx.moveTo(0, ry - ROAD_W / 2 - 4); ctx.lineTo(WORLD_W, ry - ROAD_W / 2 - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ry + ROAD_W / 2 + 4); ctx.lineTo(WORLD_W, ry + ROAD_W / 2 + 4); ctx.stroke();
  }
  // Buildings with long sunset shadows.
  const sunA = 0.9; // sun low in the west, shadows stretch east
  const shadowLen = 26 + (1 - dl) * 30;
  for (const b of w.buildings) {
    ctx.fillStyle = 'rgba(60,40,30,0.28)';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + shadowLen, b.y + shadowLen * 0.4);
    ctx.lineTo(b.x + b.w + shadowLen, b.y + b.h + shadowLen * 0.4);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows.
    ctx.fillStyle = 'rgba(255,240,180,0.85)';
    const colsN = Math.max(1, Math.floor(b.w / 34));
    const rowsN = Math.max(1, Math.floor(b.h / 30));
    for (let i = 0; i < colsN; i += 1) {
      for (let j = 0; j < rowsN; j += 1) {
        ctx.fillRect(b.x + 12 + i * ((b.w - 24) / colsN), b.y + 12 + j * ((b.h - 24) / rowsN), 10, 12);
      }
    }
  }
  // Trees.
  for (const t of w.trees) {
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath(); ctx.ellipse(t.x + 8, t.y + 6, t.r, t.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.shade;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  // Street lamps.
  ctx.fillStyle = '#3a3a42';
  for (const l of w.lamps) ctx.fillRect(l.x, l.y, 4, 16);
  // Home marker house.
  const home = w.places.home;
  ctx.fillStyle = '#d9a05a';
  ctx.fillRect(home.x - 40, home.y - 30, 80, 60);
  ctx.fillStyle = '#8a4a3a';
  ctx.beginPath();
  ctx.moveTo(home.x - 46, home.y - 28);
  ctx.lineTo(home.x, home.y - 58);
  ctx.lineTo(home.x + 46, home.y - 28);
  ctx.closePath();
  ctx.fill();
}

function drawObjective(ctx, g) {
  const obj = currentObjective(g);
  if (!obj || g.mode !== 'play') return;
  const pulse = 1 + Math.sin(g.time * 4) * 0.15;
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(obj.x, obj.y - 46);
  ctx.lineTo(obj.x - 12, obj.y - 22);
  ctx.lineTo(obj.x + 12, obj.y - 22);
  ctx.closePath();
  ctx.fill();
}

function drawCarShape(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.w / 2 + 5, -car.h / 2 + 6, car.w, car.h);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 8);
  ctx.fill();
  // Roof and windshield.
  ctx.fillStyle = 'rgba(20,30,50,0.85)';
  roundRect(ctx, -car.w / 2 + 8, -car.h / 2 + 4, car.w * 0.42, car.h - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,230,255,0.5)';
  ctx.fillRect(car.w / 2 - 14, -car.h / 2 + 4, 5, car.h - 8);
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
  ctx.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
  if (car.kind === 'police') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 2, 3);
    // Light bar.
    const blink = Math.sin(gTime * 10) > 0;
    ctx.fillStyle = blink ? '#ff3a3a' : '#3a7aff';
    ctx.fillRect(-6, -car.h / 2 - 2, 12, 4);
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    roundRect(ctx, -car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 10);
    ctx.stroke();
  }
  ctx.restore();
}
let gTime = 0;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCars(ctx, g) {
  gTime = g.time;
  for (const car of g.cars) {
    drawCarShape(ctx, car, g.player.car === car);
  }
}

function drawPerson(ctx, x, y, angle, color, walkPhase, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(3, 5, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(angle);
  const bob = Math.sin(walkPhase) * 2;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath(); ctx.arc(6 + bob, 0, 5, 0, Math.PI * 2); ctx.fill();
  if (isPlayer) {
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawPeds(ctx, g) {
  for (const ped of g.peds) {
    if (ped.down) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    const from = g.graph.nodes[ped.from];
    const to = g.graph.nodes[ped.to];
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    drawPerson(ctx, ped.x, ped.y, a, ped.color, g.time * 6 + ped.id.length, false);
  }
}

function drawEnemies(ctx, g) {
  for (const e of g.enemies) {
    if (e.hp <= 0) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#5a2a2a';
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    drawPerson(ctx, e.x, e.y, e.angle, '#c93a3a', e.walkPhase, false);
    // Gun.
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -2, 14, 4);
    ctx.restore();
    // Health bar + name.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 26, e.y - 34, 52, 7);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(e.x - 25, e.y - 33, 50 * (e.hp / 100), 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(e.name, e.x, e.y - 40);
  }
}

function drawCops(ctx, g) {
  for (const cop of g.cops) {
    const a = Math.atan2(g.player.y - cop.y, g.player.x - cop.x);
    drawPerson(ctx, cop.x, cop.y, a, '#2a3a8a', g.time * 9, false);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', cop.x, cop.y - 20);
  }
}

function drawPlayer(ctx, g) {
  const p = g.player;
  if (!p.onFoot) return;
  drawPerson(ctx, p.x, p.y, p.angle, '#f2c14e', p.walkPhase, true);
  // Pistol in hand.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 12, 4);
  ctx.restore();
  // Reload indicator.
  if (p.reloadT > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RELOADING...', p.x, p.y - 28);
  }
}

function drawParticles(ctx, g) {
  for (const pt of g.particles.list) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of g.particles.floaters) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawLighting(ctx, g) {
  const dl = daylight(g);
  // Sunset wash that deepens as night falls.
  const warm = 0.10 + (1 - dl) * 0.16;
  ctx.fillStyle = `rgba(255,140,60,${warm.toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (dl < 0.85) {
    ctx.fillStyle = `rgba(10,10,40,${((0.85 - dl) * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // Low-health vignette.
  const p = g.player;
  if (p.hp < 35 && g.mode === 'play') {
    const a = 0.25 + Math.sin(g.time * 5) * 0.08;
    const grad = ctx.createRadialGradient(640, 360, 240, 640, 360, 640);
    grad.addColorStop(0, 'rgba(200,0,0,0)');
    grad.addColorStop(1, `rgba(200,0,0,${a.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawHud(ctx, g) {
  const p = g.player;
  // Top-left: health, money, ammo.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 14, 14, 250, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${g.money}`, 26, 40);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(26, 50, 180, 12);
  ctx.fillStyle = p.hp > 35 ? '#5ac95a' : '#ff5a5a';
  ctx.fillRect(26, 50, 180 * (p.hp / 100), 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.hp)}`, 212, 61);
  ctx.fillText(`Ammo ${p.ammo} / ${p.reserveAmmo}${p.reloadT > 0 ? '  reloading' : ''}`, 26, 88);
  // Top-right: wanted stars + clock.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, VIEW_W - 264, 14, 250, 56, 10);
  ctx.fill();
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'left';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < g.wanted ? '★' : '☆';
  ctx.fillStyle = g.wanted > 0 ? '#ffd94a' : '#bbbbbb';
  ctx.fillText(stars, VIEW_W - 252, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  const mins = Math.floor(g.clockMinutes) % 1440;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const speed = p.onFoot ? Math.round(p.speed * 0.09) : Math.round(Math.abs(p.car ? p.car.speed : 0) * 0.18);
  ctx.fillText(`${clock}   ${p.onFoot ? 'ON FOOT' : `${speed} km/h`}`, VIEW_W - 252, 60);
  // Mission banner.
  const m = currentMission(g);
  if (m && g.mode === 'play') {
    const step = currentStep(g);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 330, 14, 620, 52, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${m.name}  —  ${m.contact}`, 640, 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(step ? step.label : '', 640, 56);
  }
  // Big centre banner (mission start).
  if (g.banner) {
    ctx.globalAlpha = Math.min(1, g.banner.t);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 250, VIEW_W, 90);
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.banner.title, 640, 292);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText(g.banner.sub, 640, 322);
    ctx.globalAlpha = 1;
  }
  // Messages.
  ctx.textAlign = 'left';
  g.messages.forEach((msg, i) => {
    ctx.globalAlpha = Math.max(0, Math.min(1, 5 - msg.t));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const w = ctx.measureText(msg.text).width + 20;
    roundRect(ctx, 14, 560 - i * 28, w, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(msg.text, 24, 577 - i * 28);
  });
  ctx.globalAlpha = 1;
  // Off-screen objective arrow.
  const obj = currentObjective(g);
  if (obj && g.mode === 'play') {
    const sx = obj.x - g.camera.x + 640;
    const sy = obj.y - g.camera.y + 360;
    if (sx < 60 || sx > VIEW_W - 60 || sy < 60 || sy > VIEW_H - 60) {
      const cx = Math.max(60, Math.min(VIEW_W - 60, sx));
      const cy = Math.max(60, Math.min(VIEW_H - 60, sy));
      const a = Math.atan2(sy - 360, sx - 640);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // Controls hint.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD move · Shift run · E enter car · Space punch · Click shoot · R reload · P pause · M mute', VIEW_W - 16, VIEW_H - 12);
}

function drawMinimap(ctx, g) {
  const S = 0.055;
  const mw = WORLD_W * S;
  const mh = WORLD_H * S;
  const ox = VIEW_W - mw - 14;
  const oy = VIEW_H - mh - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, ox - 6, oy - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(S, S);
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = '#3a8ab8';
  ctx.fillRect(g.world.sea.x, 0, g.world.sea.w, WORLD_H);
  ctx.fillStyle = '#6aa858';
  ctx.fillRect(g.world.park.x, g.world.park.y, g.world.park.w, g.world.park.h);
  ctx.fillStyle = '#4a4a52';
  for (const cx of COLS) ctx.fillRect(cx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const ry of ROWS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.fillStyle = '#9a9a92';
  ctx.fillRect(g.world.harbor.x, g.world.harbor.y, g.world.harbor.w, g.world.harbor.h);
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const obj = currentObjective(g);
  if (obj && g.mode === 'play') dot(obj.x, obj.y, '#ffd94a', 46);
  for (const car of g.cars) {
    if (car.kind === 'police') dot(car.x, car.y, '#3a7aff', 34);
    else if (car.id === 'pink') dot(car.x, car.y, '#ff7ab8', 34);
    else if (car.kind === 'traffic') dot(car.x, car.y, '#cccccc', 22);
  }
  for (const e of g.enemies) if (e.hp > 0) dot(e.x, e.y, '#ff3a3a', 30);
  for (const cop of g.cops) dot(cop.x, cop.y, '#3a7aff', 26);
  dot(g.player.x, g.player.y, '#ffffff', 30);
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ox + g.player.x * S, oy + g.player.y * S, 6, 0, Math.PI * 2);
  ctx.stroke();
}

function overlay(ctx, alpha) {
  ctx.fillStyle = `rgba(8,10,24,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTitle(ctx, g) {
  overlay(ctx, 0.72);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SUNFALL HARBOR', 640, 210);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText('A sun-soaked open-world crime story', 640, 250);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#ffd94a';
  ctx.fillText('Steal cars. Outrun the law. Finish the job.', 640, 286);
  ctx.fillStyle = '#ffffff';
  ctx.font = '15px sans-serif';
  ctx.fillText('WASD / Arrows — move     Shift — run     E — enter / leave car', 640, 360);
  ctx.fillText('Space — punch     Mouse — shoot     R — reload     P — pause     M — mute', 640, 388);
  const blink = Math.sin(g.time * 3) > 0;
  if (blink) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('PRESS ENTER TO START', 640, 470);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '13px sans-serif';
  ctx.fillText('An original game. No affiliation with any commercial series.', 640, 560);
  if (g.best > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Best haul so far: $${g.best}`, 640, 520);
  }
}

function drawBrief(ctx, g) {
  overlay(ctx, 0.6);
  const m = currentMission(g);
  if (!m) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`MISSION ${g.missionIndex + 1} OF ${MISSIONS.length}: ${m.name}`, 640, 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px sans-serif';
  ctx.fillText(`${m.contact}  •  Reward $${m.reward}`, 640, 226);
  wrapText(ctx, m.brief, 640, 280, 760, 26);
  ctx.fillStyle = '#ffd94a';
  ctx.font = '16px sans-serif';
  m.steps.forEach((s, i) => ctx.fillText(`${i + 1}. ${s.label}`, 640, 380 + i * 28));
  const blink = Math.sin(g.time * 3) > 0;
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('PRESS ENTER TO BEGIN', 640, 500);
  }
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  ctx.font = '17px sans-serif';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, cx, yy);
}

function drawPaused(ctx, g) {
  overlay(ctx, 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', 640, 320);
  ctx.font = '18px sans-serif';
  ctx.fillText('Press P or Esc to keep playing', 640, 366);
  const m = currentMission(g);
  if (m) {
    ctx.fillStyle = '#ffd94a';
    ctx.fillText(`${m.name} — ${currentStep(g) ? currentStep(g).label : ''}`, 640, 410);
  }
}

function drawOver(ctx, g) {
  const win = g.outcome === 'win';
  overlay(ctx, win ? 0.55 : 0.72);
  ctx.textAlign = 'center';
  if (win) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('HARBOR LEGEND', 640, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('All three jobs done. Sunfall Harbor is yours.', 640, 292);
  } else if (g.outcome === 'wasted') {
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('WASTED', 640, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('The harbor keeps what it takes.', 640, 292);
  } else {
    ctx.fillStyle = '#7ab8ff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('BUSTED', 640, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('The cops finally caught up with you.', 640, 292);
  }
  ctx.font = '18px sans-serif';
  ctx.fillText(`Money earned: $${g.money}`, 640, 340);
  ctx.fillText(`Cars stolen: ${g.stats.carsStolen}   Shots: ${g.stats.shots}   Hits: ${g.stats.hits}`, 640, 372);
  const blink = Math.sin(g.time * 3) > 0;
  if (blink && g.overTimer > 1) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('PRESS ENTER TO PLAY AGAIN', 640, 450);
  }
}
