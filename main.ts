// Sunfall Harbor — entrypoint for the make.fun gta6-01 bounty.
//
// What this file does, in plain terms: it takes the finished game in
// game/ and the screenshots in screenshots/, copies both into the output
// directory the grader reads, and then asks make.fun's own library to
// write dossier.json from exactly those files. The dossier is the sealed
// record the judge reads, so it must be produced by the library, never
// by hand.
//
// Run it locally with MAKEFUN_OUTPUT_DIR=out node main.ts, or let the
// grader run it with /output. It needs nothing but the Node standard
// library, and it writes the same bytes every time it runs.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(new URL('./main.ts', import.meta.url)));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outDir, { recursive: true });
// Never delete outDir itself: in the grader /output is a mount point and
// removing it fails with EBUSY, which used to abort the whole run with
// exit code 1. Clear only the directory's contents instead, so a stale
// file from a previous build can never leak into the next dossier.
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
}));
console.log(`Sunfall Harbor entry written to ${outDir}`);
