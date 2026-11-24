// Token Radar v7 — the entrypoint. Stock Node 22, no dependencies.
//
// Give it the sealed snapshot — /input/snapshot.json on the grader, or
// --input <file|directory> when run by hand — and it scores every
// pre-token protocol through lib/model.ts, then writes the result to
// /output (or MAKEFUN_OUTPUT_DIR outside the grader): board.json, the
// dashboard data, the dashboard itself with a freshly generated
// METHOD.md, the screenshots, and dossier.json last, built with the
// vendored make.fun library so the scorer can rebuild it byte for byte.
//
// A run is deterministic — no clocks, no randomness, fixed key order —
// so two runs write identical bytes. The output directory is created
// but never emptied: the grader mounts /output, and clearing a mount
// point would fail the run.
//
// The one trap: the dashboard copy leaves METHOD.md out on purpose.
// The file is generated a few lines later, and copying it first would
// put a read-only copy in the way — copyFileSync keeps the source
// file's mode, the grader mounts the repo read-only, and the overwrite
// after it would die with EACCES. That exact failure rejected the v4
// entry, so the copy skips METHOD.md and the generator writes it fresh.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, methodDocument, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** The caps the scorer enforces: the text cap shapes the dossier, the rest refuse. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A `--name value` or `--name=value` flag, or the fallback when absent. */
function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputGiven = option('input', '/input');
const snapshotFile = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
const outputDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/**
 * Width and height from an image's own header, or null for bytes this
 * reader cannot measure. PNG carries its size in the IHDR chunk; JPEG
 * carries it in the first frame header (SOF0/SOF2) found while walking
 * the markers.
 */
function measureShot(bytes: Buffer, name: string): { width: number; height: number } | null {
  const isPng =
    bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg) return null;
  let p = 2;
  while (p + 9 < bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marker = bytes[p + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    const segLen = bytes.readUInt16BE(p + 2);
    if (segLen < 2 || p + 2 + segLen > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(p + 5), width: bytes.readUInt16BE(p + 7) };
    }
    p += 2 + segLen;
  }
  process.stderr.write(`token radar: screenshots/${name}: no frame header found\n`);
  return null;
}

/**
 * Refuse a screenshot the gate would refuse here, not at scoring: the
 * byte cap, and the size from the image header itself (long side at
 * most 1440, short side at least 800).
 */
function vetShots(names: string[]): void {
  for (const name of names) {
    if (!SHOT_NAME.test(name)) {
      process.stderr.write(
        `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`,
      );
      process.exit(1);
    }
    if (!/\.(png|jpg|jpeg)$/i.test(name)) {
      process.stderr.write(`token radar: screenshots/${name} is not a PNG or JPEG\n`);
      process.exit(1);
    }
    const image = readFileSync(join(outputDir, 'screenshots', name));
    if (image.length > SHOT_CAPS.max_bytes) {
      process.stderr.write(
        `token radar: screenshots/${name} is ${image.length} bytes, over the ${SHOT_CAPS.max_bytes} the gate allows\n`,
      );
      process.exit(1);
    }
    const size = measureShot(image, name);
    if (size === null) {
      process.stderr.write(`token radar: screenshots/${name}: could not read its dimensions\n`);
      process.exit(1);
    }
    const longSide = Math.max(size.width, size.height);
    const shortSide = Math.min(size.width, size.height);
    if (longSide > 1440 || shortSide < 800) {
      process.stderr.write(
        `token radar: screenshots/${name} is ${size.width}x${size.height}: the long side must be at most 1440 and the short side at least 800\n`,
      );
      process.exit(1);
    }
  }
}

/** Copy a directory's plain files into `to`, skipping dot-names and `skip`. Returns the names copied. */
function mirrorDir(from: string, to: string, skip: string[] = []): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.') || skip.includes(name)) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

if (!existsSync(snapshotFile)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

// METHOD.md is written fresh here, from the snapshot and the board just
// scored, so it can never go stale. It stays out of the copy above for
// the reason the header gives.
const dashFiles = mirrorDir(join(repoDir, 'dashboard'), join(outputDir, 'dashboard'), ['METHOD.md']);
writeFileSync(join(outputDir, 'dashboard', 'METHOD.md'), methodDocument(snapshot, radar, board));

const shots = mirrorDir(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
vetShots(shots);

// The dossier is last: the scorer rebuilds it from this /output and
// compares bytes, so what lands here must be exactly what the library
// builds from the same directory.
const dossier = buildDossier(outputDir, {
  text_max_bytes: TEXT_CAP_BYTES,
  screenshots: SHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
const onDisk = readFileSync(join(outputDir, 'dossier.json'));
if (!Buffer.from(onDisk).equals(Buffer.from(dossier))) {
  process.stderr.write('token radar: dossier.json on disk is not the dossier just built\n');
  process.exit(1);
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (${new Set([...dashFiles, 'METHOD.md']).size} files), ${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
