# Sunfall Harbor

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/lee-2020-my/sunfall-harbor/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/lee-2020-my/sunfall-harbor/reward.svg)](https://make.fun/c/gta6-01)

A sun-soaked open-world crime game in the spirit of GTA 6, built from scratch in plain Canvas 2D. No libraries, no network, no assets — every pixel is drawn in code and every sound is synthesized with WebAudio.

## The city

Sunfall Harbor is a 3600×2600 procedurally generated seaside city: a 5×4 avenue grid, a park, a beach and a working harbor with piers, warehouses and shipping containers. The same seed always builds the same city (`?seed=` changes it).

## Play

- **On foot:** WASD / arrows to walk, Shift to run, Space to punch, mouse to shoot the pistol, R to reload.
- **Driving:** E to steal a car and get in, W/S to accelerate and brake, A/D to steer. Parked and moving cars can both be taken — stealing raises your wanted level.
- **The law:** 0–5 wanted stars. Stealing cars, hitting pedestrians and shooting all raise the heat. Police cars chase and ram you; foot cops run you down and arrest you on touch. Break line of sight and stay hidden for 14 seconds to drop a star.
- **Traffic & pedestrians:** cars drive the lanes and brake for the car ahead; pedestrians keep to the sidewalks and scatter from a speeding car.
- **Missions:** three jobs from Danny Cole, Mara Voss and Kane Dray, with a story arc:
  1. **The Package** — lift a package off Pier 3, deliver it to Danny's Garage ($400).
  2. **Hot Wheels** — steal the pink coupe, deliver it to the Chop Shop ($800).
  3. **Harbor Showdown** — take down Rico, Marco and Vince at the Harbor Yard, then lose the heat and drive home ($1500).
- **Combat:** punches, a 12-round pistol, enemy health bars, slow health regen.
- **HUD:** health, money, ammo, wanted stars, mission banner, speed, in-game clock and a live minimap with an off-screen objective arrow.
- **Save:** money, mission progress and best haul persist in `localStorage`.
- **Sound:** synthesized engine hum that follows your speed, sirens, gunshots, pickups, mission jingles and a lazy bass loop. M mutes.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server. The game runs fully offline.

## Determinism

- Seeded RNG only — `game/` contains no `Math.random` and no network references.
- Fixed 1/60 s timestep with an accumulator, so the simulation does not depend on frame rate.
- `?shot=start|play|chase|end&seed=1` renders deterministic screenshot states.
- `node scripts/simulate.mjs` plays the whole story headlessly (start → three missions → victory) and must print WIN for seeds 1, 7 and 42.

## Entry

Built for the make.fun competition **gta6-01 "Make GTA 6"**. `main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `buildDossier`.
