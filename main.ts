// Token Radar v5 — the entrypoint. Plain Node 22, no dependencies.
//
// It takes the sealed snapshot (/input/snapshot.json on the grader, or
// --input <file|directory> when run by hand), scores every pre-token
// protocol through lib/model.ts, and lays the result out in /output
// (or MAKEFUN_OUTPUT_DIR outside the grader): board.json, the dashboard
// data, the dashboard itself with a freshly generated METHOD.md, the
// screenshots, and dossier.json last, assembled with the vendored
// make.fun library so the scorer can rebuild it byte for byte.
//
// The run is deterministic: no clocks, no random numbers, keys in a
// fixed order everywhere, so two runs write identical bytes. The output
// directory is created but never removed — the grader mounts /output,
// and deleting a mount point would fail the run.
//
// One trap this file exists to avoid: the dashboard copy deliberately
// leaves METHOD.md behind. The file is generated a few lines later, and
// copying it first would land a read-only copy in the way — copyFileSync
// keeps the source file's mode, the grader mounts the repo read-only,
// and the later overwrite would die with EACCES. That exact failure
// rejected the v4 entry, so the copy skips METHOD.md and the generator
// writes it fresh.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, methodDocument, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** Caps the scorer enforces: the text cap shapes the dossier, the others refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read a `--name value` or `--name=value` flag, or fall back. */
function flag(name: string, fallback: string): string {
  const slot = process.argv.indexOf(`--${name}`);
  if (slot >= 0 && slot + 1 < process.argv.length) return process.argv[slot + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

const inputOpt = flag('input', '/input');
const snapshotPath = inputOpt.endsWith('.json') ? inputOpt : join(inputOpt, 'snapshot.json');
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/**
 * Pixel size from an image's own header, or null when the bytes are
 * neither a PNG nor a JPEG this reader can measure. PNG keeps its size
 * in the IHDR chunk; JPEG keeps it in the first frame header (SOF0 or
 * SOF2) met while walking the markers.
 */
function imageSize(bytes: Buffer, name: string): { width: number; height: number } | null {
  const isPng =
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const len = bytes.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + len;
  }
  process.stderr.write(`token radar: screenshots/${name}: no frame header found\n`);
  return null;
}

/** Copy a directory's regular files into `to`, leaving out dot-names and anything in `skip`. */
function copyFiles(from: string, to: string, skip: string[] = []): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.') || skip.includes(name)) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

if (!existsSync(snapshotPath)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

// METHOD.md comes from the snapshot and the board just scored, so it is
// written fresh beside the copied dashboard files and can never go stale.
// It is left out of the copy above for the reason the header gives.
const dashboardCopied = copyFiles(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'), ['METHOD.md']);
writeFileSync(join(outDir, 'dashboard', 'METHOD.md'), methodDocument(snapshot, radar, board));

const shotNames = copyFiles(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
for (const name of shotNames) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(
      `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`,
    );
    process.exit(1);
  }
  if (!/\.(png|jpg|jpeg)$/i.test(name)) {
    process.stderr.write(`token radar: screenshots/${name} is not a PNG or JPEG\n`);
    process.exit(1);
  }
  // Catch a screenshot the gate would refuse here, not at scoring: the
  // byte cap, and the size read from the image header itself (long side
  // at most 1440, short side at least 800).
  const shotBytes = readFileSync(join(outDir, 'screenshots', name));
  if (shotBytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(
      `token radar: screenshots/${name} is ${shotBytes.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} the gate allows\n`,
    );
    process.exit(1);
  }
  const dims = imageSize(shotBytes, name);
  if (dims === null) {
    process.stderr.write(`token radar: screenshots/${name}: could not read its dimensions\n`);
    process.exit(1);
  }
  const longSide = Math.max(dims.width, dims.height);
  const shortSide = Math.min(dims.width, dims.height);
  if (longSide > 1440 || shortSide < 800) {
    process.stderr.write(
      `token radar: screenshots/${name} is ${dims.width}x${dims.height}: the long side must be at most 1440 and the short side at least 800\n`,
    );
    process.exit(1);
  }
}

// The dossier goes last: the scorer rebuilds it from this /output and
// compares bytes, so what is written here must be exactly what the
// library builds from the same directory.
const dossier = buildDossier(outDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
const written = readFileSync(join(outDir, 'dossier.json'));
if (!Buffer.from(written).equals(Buffer.from(dossier))) {
  process.stderr.write('token radar: dossier.json on disk is not the dossier just built\n');
  process.exit(1);
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${new Set([...dashboardCopied, 'METHOD.md']).size} files), ${join(outDir, 'screenshots')} (${shotNames.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
