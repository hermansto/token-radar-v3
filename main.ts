// Token Radar v8 — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every pre-token protocol with the M18 model in
// lib/model.ts, writes the ranked board to /output/board.json and the
// dashboard data to /output/data.js, copies this repository's dashboard/
// and screenshots/ to /output, and writes /output/dossier.json with the
// vendored make.fun library. The dossier is rebuilt from the finished
// /output and compared byte for byte by the scorer, so it is written last.
//
// Validation guards (added on the second pass over this file): the board
// is refused unless its verdict split is 66/61/69 and its integrity strip
// adds up to the snapshot's protocol count; the dashboard is refused
// unless its source totals under the 65,536-byte text cap; screenshots are
// refused unless there are exactly four, each at or under 512 KiB; and the
// snapshot hash carried in data.js must be the hash of the file just read.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Fail with a message when `ok` is false: a guard that trips is a refusal, not a warning. */
function guard(ok: boolean, message: string): void {
  if (!ok) {
    process.stderr.write(`token radar: ${message}\n`);
    process.exit(1);
  }
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshotBytes = readFileSync(inputFile);
const snapshotSha = createHash('sha256').update(snapshotBytes).digest('hex');
const snapshot = parseSnapshot(snapshotBytes.toString('utf8'));
const { board, radar } = buildRadar(snapshot, snapshotSha);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}
// Guard: the integrity strip must account for every protocol in the snapshot.
const integ = radar.integrity;
const accounted =
  integ.watchlist + integ.early_ranked + integ.priced_live + integ.excluded_pre_token + integ.live_not_priced;
guard(accounted === integ.total_protocols, `integrity strip accounts for ${accounted} of ${integ.total_protocols} protocols`);
guard(radar.snapshot_sha256 === snapshotSha, 'data.js would carry a snapshot hash that is not the input file');
guard(radar.verdict_counts.FARM === 66 && radar.verdict_counts.THIN === 61 && radar.verdict_counts.SKIP === 69,
  `verdict split is FARM ${radar.verdict_counts.FARM} / THIN ${radar.verdict_counts.THIN} / SKIP ${radar.verdict_counts.SKIP}, expected 66 / 61 / 69`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// Guard: the dashboard source the judge reads must fit the text cap whole.
const dashBytes = dashFiles.reduce((n, f) => n + statSync(join(out, 'dashboard', f)).size, 0);
guard(dashBytes < TEXT_MAX_BYTES, `dashboard source is ${dashBytes} bytes, over the ${TEXT_MAX_BYTES}-byte text cap`);
guard(dashFiles.length >= 3, `dashboard/ holds ${dashFiles.length} files: index.html, app.css and app.js are all needed`);

const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
guard(shots.length === 4, `screenshots/ holds ${shots.length} images: hand in exactly 4, cover, detail, filter and model`);
for (const name of shots) {
  guard(IMAGE_NAME.test(name), `screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  const size = statSync(join(out, 'screenshots', name)).size;
  guard(size <= SCREENSHOT_CAPS.max_bytes, `screenshots/${name} is ${size} bytes, over the 512 KiB cap`);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: snapshot sha256 ${snapshotSha}\n` +
    `token radar: verdicts FARM ${radar.verdict_counts.FARM} / THIN ${radar.verdict_counts.THIN} / SKIP ${radar.verdict_counts.SKIP}\n` +
    `token radar: dashboard ${dashBytes} bytes in ${dashFiles.length} files, integrity ${accounted}/${integ.total_protocols} accounted for\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
