// Sunfall Harbor city generation. Pure data, fully deterministic for a
// given seed: roads, blocks, buildings, park, beach, harbor and all the
// named places the missions use. No DOM, no rendering here.
import { Rng, streamFor } from './rng.js';

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_W = 120;

// Road centre lines. 5 columns x 4 rows of avenues and streets.
export const COLS = [300, 1000, 1700, 2400, 3100];
export const ROWS = [300, 950, 1600, 2250];

const BUILDING_PALETTE = [
  '#e8b48a', '#d99a6c', '#c98a7a', '#b7a06a', '#8fa3b8',
  '#a8b8a0', '#d9c08a', '#b98a9a', '#9a8ab8', '#c9a06a',
];
const ROOF_PALETTE = ['#7a5a48', '#5a6a7a', '#6a5a7a', '#4a5a6a', '#8a6a5a'];

export function generateWorld(seed) {
  const rng = new Rng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Park block: between column 1 and 2, row 1 and 2.
  const park = { x: COLS[1] + 90, y: ROWS[1] + 90, w: COLS[2] - COLS[1] - 180, h: ROWS[2] - ROWS[1] - 180 };
  // Harbor district: south-east corner, piers reach the sea on the east.
  const harbor = { x: 2850, y: 2050, w: 750, h: 550 };

  for (let ci = 0; ci < COLS.length - 1; ci += 1) {
    for (let rj = 0; rj < ROWS.length - 1; rj += 1) {
      const bx = COLS[ci] + ROAD_W / 2 + 24;
      const by = ROWS[rj] + ROAD_W / 2 + 24;
      const bw = COLS[ci + 1] - COLS[ci] - ROAD_W - 48;
      const bh = ROWS[rj + 1] - ROWS[rj] - ROAD_W - 48;
      const isPark = ci === 1 && rj === 1;
      const isHarbor = ci === 3 && rj === 2;
      if (isPark) {
        for (let t = 0; t < 26; t += 1) {
          trees.push({
            x: bx + rng.range(30, bw - 30), y: by + rng.range(30, bh - 30),
            r: rng.range(14, 26), shade: rng.pick(['#5a8a4a', '#6a9a52', '#4a7a42']),
          });
        }
        continue;
      }
      if (isHarbor) continue; // docks and warehouses are placed below
      // The home block (top-left) holds only the player's house and
      // Danny's Garage, with trees: no random buildings may block the
      // driveway to either.
      if (ci === 0 && rj === 0) {
        for (let t = 0; t < 8; t += 1) {
          trees.push({
            x: bx + rng.range(30, bw - 30), y: by + rng.range(30, bh - 30),
            r: rng.range(12, 20), shade: rng.pick(['#5a8a4a', '#6a9a52']),
          });
        }
        continue;
      }
      const count = rng.int(2, 4);
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(120, Math.min(260, bw - 40));
        const h = rng.range(110, Math.min(220, bh - 40));
        const x = bx + rng.range(10, Math.max(11, bw - w - 10));
        const y = by + rng.range(10, Math.max(11, bh - h - 10));
        const b = { x, y, w, h, height: rng.range(26, 90), color: rng.pick(BUILDING_PALETTE), roof: rng.pick(ROOF_PALETTE) };
        // Keep the driveway to Home and Danny's Garage clear so a car can
        // always reach them.
        const clearOf = (px, py, r) => {
          const cx = Math.max(b.x, Math.min(px, b.x + b.w));
          const cy = Math.max(b.y, Math.min(py, b.y + b.h));
          return Math.hypot(px - cx, py - cy) >= r;
        };
        if (!clearOf(620, 560, 220) || !clearOf(620, 430, 160)) continue;
        let overlap = false;
        for (const o of buildings) {
          if (b.x < o.x + o.w + 18 && b.x + b.w + 18 > o.x && b.y < o.y + o.h + 18 && b.y + b.h + 18 > o.y) { overlap = true; break; }
        }
        if (!overlap) buildings.push(b);
      }
      for (let t = 0; t < rng.int(1, 3); t += 1) {
        trees.push({
          x: bx + rng.range(20, bw - 20), y: by + rng.range(20, bh - 20),
          r: rng.range(12, 20), shade: rng.pick(['#5a8a4a', '#6a9a52']),
        });
      }
    }
  }

  // Harbor warehouses and piers. The yard between them stays open so a
  // car can drive from the avenue straight to Pier 3 and the showdown.
  const warehouses = [
    { x: 2860, y: 2060, w: 150, h: 100, height: 60, color: '#b8a06a', roof: '#5a6a7a' },
    { x: 3180, y: 2380, w: 180, h: 130, height: 48, color: '#c98a7a', roof: '#7a5a48' },
    { x: 2860, y: 2400, w: 160, h: 120, height: 55, color: '#8fa3b8', roof: '#4a5a6a' },
  ];
  for (const w of warehouses) buildings.push(w);
  const piers = [
    { x: 3380, y: 2140, w: 160, h: 26 },
    { x: 3380, y: 2300, w: 160, h: 26 },
    { x: 3380, y: 2460, w: 160, h: 26 },
  ];
  const containers = [];
  const contColors = ['#c95a3a', '#3a7ab8', '#4a9a5a', '#d9a03a', '#8a5ab8'];
  for (let i = 0; i < 14; i += 1) {
    containers.push({
      x: 2920 + (i % 7) * 52, y: 2540 + Math.floor(i / 7) * 34,
      w: 44, h: 26, color: contColors[i % contColors.length],
    });
  }

  // Boats moored at the piers and out in the roads, cranes over the yard,
  // beach umbrellas, roadside bushes and grass texture patches — all
  // seeded, so the same seed always builds the same harbor. They draw
  // from their own stream so the main rng sequence (buildings, parked
  // spots) stays exactly as v1 built it.
  const drng = streamFor(seed, 'harbor-detail');
  const ships = [
    { x: 3510, y: 300, w: 78, h: 26, color: '#e8e0d0', mast: true },
    { x: 3512, y: 1500, w: 96, h: 30, color: '#c95a3a', mast: true },
    { x: 3440, y: 2180, w: 64, h: 22, color: '#3a7ab8', mast: false },
    { x: 3520, y: 2350, w: 70, h: 24, color: '#4a9a5a', mast: true },
  ];
  const cranes = [
    { x: 2960, y: 2140, h: 150 },
    { x: 3180, y: 2520, h: 130 },
  ];
  const umbrellas = [];
  for (let y = 180; y < WORLD_H - 100; y += 320) {
    umbrellas.push({
      x: 3410, y: y + drng.range(-40, 40),
      color: drng.pick(['#ff5a5a', '#ffd94a', '#3a7ab8', '#ff7ab8']),
    });
  }
  const bushes = [];
  for (const cx of COLS) {
    for (let y = 200; y < WORLD_H - 100; y += 330) {
      bushes.push({ x: cx + ROAD_W / 2 + 44, y: y + drng.range(-30, 30), r: drng.range(9, 15) });
    }
  }
  for (const ry of ROWS) {
    for (let x = 200; x < WORLD_W - 100; x += 380) {
      bushes.push({ x: x + drng.range(-30, 30), y: ry + ROAD_W / 2 + 44, r: drng.range(9, 15) });
    }
  }
  const grassPatches = [];
  for (let i = 0; i < 70; i += 1) {
    grassPatches.push({
      x: drng.range(40, WORLD_W - 40), y: drng.range(40, WORLD_H - 40),
      r: drng.range(22, 64),
      shade: drng.pick(['#9ab86a', '#b8c078', '#c9b878', '#8aa85e', '#c2a868']),
    });
  }

  // Beach strip on the east edge, sea beyond it.
  const beach = { x: 3360, y: 0, w: 130, h: WORLD_H };
  const sea = { x: 3490, y: 0, w: 110, h: WORLD_H };

  // Street lamps along every road, deterministic positions.
  for (const cx of COLS) {
    for (let y = 80; y < WORLD_H; y += 260) lamps.push({ x: cx + ROAD_W / 2 - 8, y });
  }
  for (const ry of ROWS) {
    for (let x = 80; x < WORLD_W; x += 260) lamps.push({ x, y: ry + ROAD_W / 2 - 8 });
  }

  // Named places the story uses. All sit on or beside a road.
  const places = {
    home: { x: 620, y: 560, label: 'Home' },
    garage: { x: 620, y: 430, label: 'Danny\'s Garage' },
    harborPickup: { x: 3300, y: 2220, label: 'Pier 3' },
    pinkCoupe: { x: 2470, y: 1010, label: 'Pink Coupe' },
    chopShop: { x: 2620, y: 1980, label: 'Chop Shop' },
    showdown: { x: 3200, y: 2220, label: 'Harbor Yard' },
    playerStart: { x: 1000, y: 1150 },
  };

  return {
    seed, buildings, trees, lamps, park, harbor, warehouses, piers,
    containers, beach, sea, places, ships, cranes, umbrellas, bushes,
    grassPatches,
    // Parked cars: fixed spots along the roads, shuffled by seed.
    parkedSpots: buildParkedSpots(rng),
  };
}

function buildParkedSpots(rng) {
  const spots = [];
  const palette = ['#c95a3a', '#3a7ab8', '#4a9a5a', '#d9a03a', '#8a5ab8', '#e8e8e8', '#3a3a4a', '#7ab8c9'];
  // Along the east side of each column road and the south side of each row road.
  for (const cx of COLS) {
    for (let y = 420; y < WORLD_H - 100; y += 330) {
      spots.push({ x: cx + ROAD_W / 2 + 26, y: y + rng.range(-40, 40), angle: Math.PI / 2, color: rng.pick(palette) });
    }
  }
  for (const ry of ROWS) {
    for (let x = 420; x < WORLD_W - 100; x += 380) {
      spots.push({ x: x + rng.range(-40, 40), y: ry + ROAD_W / 2 + 26, angle: 0, color: rng.pick(palette) });
    }
  }
  return rng.shuffle(spots);
}

// Road graph: intersections are nodes, edges run between neighbours.
export function roadGraph() {
  const nodes = [];
  const index = {};
  for (let j = 0; j < ROWS.length; j += 1) {
    for (let i = 0; i < COLS.length; i += 1) {
      index[`${i},${j}`] = nodes.length;
      nodes.push({ x: COLS[i], y: ROWS[j], i, j });
    }
  }
  const edges = [];
  const add = (a, b) => { edges.push([a, b]); edges.push([b, a]); };
  for (let j = 0; j < ROWS.length; j += 1) {
    for (let i = 0; i < COLS.length - 1; i += 1) add(index[`${i},${j}`], index[`${i + 1},${j}`]);
  }
  for (let i = 0; i < COLS.length; i += 1) {
    for (let j = 0; j < ROWS.length - 1; j += 1) add(index[`${i},${j}`], index[`${i},${j + 1}`]);
  }
  return { nodes, edges };
}

// Breadth-first path over the road graph, returns node indices.
export function findPath(graph, fromX, fromY, toX, toY) {
  const nearest = (x, y) => {
    let best = 0; let bd = Infinity;
    graph.nodes.forEach((n, idx) => {
      const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bd) { bd = d; best = idx; }
    });
    return best;
  };
  const start = nearest(fromX, fromY);
  const goal = nearest(toX, toY);
  if (start === goal) return [start];
  const prev = new Array(graph.nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const [a, b] of graph.edges) {
      if (a === cur && prev[b] === -1) { prev[b] = cur; queue.push(b); }
    }
  }
  if (prev[goal] === -1) return [start];
  const path = [];
  let cur = goal;
  while (cur !== start) { path.unshift(cur); cur = prev[cur]; }
  path.unshift(start);
  return path;
}

// Circle vs building AABB: push the circle out, return corrected position.
export function resolveBuildingCollision(world, x, y, radius) {
  let nx = x; let ny = y;
  for (const b of world.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx; const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        ny = cy + (dy / d) * radius;
      } else {
        ny = b.y - radius;
      }
    }
  }
  return { x: nx, y: ny };
}

export function clampToWorld(x, y, margin) {
  return {
    x: Math.max(margin, Math.min(WORLD_W - margin, x)),
    y: Math.max(margin, Math.min(WORLD_H - margin, y)),
  };
}
