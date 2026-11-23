// Token Radar v3 — entrypoint. Node 22, standard library only.
//
// Reads the sealed snapshot from /input/snapshot.json (or --input
// <snapshot.json|directory> for local runs), scores every pre-token
// protocol with lib/model.ts, and writes the ranked board to /output:
// board.json, the dashboard data beside the page (data.js), the dashboard
// itself with a generated METHOD.md, the screenshots, and dossier.json
// last, built with the vendored make.fun library so the scorer can
// rebuild it byte for byte.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// The output directory is never removed: the grader mounts /output, and
// deleting a mount point fails the run. This program only creates it
// (recursive mkdir) and writes files into it. Running it twice writes
// identical bytes both times: no timestamps, no randomness, fixed key
// order in every JSON object it writes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, methodDocument, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. Also accepts --name=value. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');

/**
 * Width and height out of an image's own header, or null when the bytes are
 * not a PNG or JPEG this reader understands. PNG: the IHDR chunk. JPEG: the
 * first frame header (SOF0/SOF2) found while walking the markers.
 */
function imageDimensions(
  bytes: Buffer,
  name: string,
): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
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
  return null;
}

if (!existsSync(inputFile)) {
  process.stderr.write(
    `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot and any name in `skip`. */
function copyFiles(from: string, to: string, skip: string[] = []): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    if (skip.includes(name)) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

// METHOD.md is generated fresh by the next line, so it is never copied:
// copyFileSync preserves the source's mode, and the grader mounts the repo
// read-only, so a copied METHOD.md is read-only and the generated write
// would throw EACCES and exit 1. That exact failure rejected the v4 entry.
const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'), ['METHOD.md']);
// METHOD.md is generated from the snapshot and the board it produces, and
// written beside the dashboard files, so the dossier carries the method
// the judge reads. It is generated, never hand-written: the same run that
// scores the board writes it, so it can never go stale.
writeFileSync(join(out, 'dashboard', 'METHOD.md'), methodDocument(snapshot, radar, board));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(
    `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
for (const name of shots) {
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
  // Fail fast on a screenshot the gate would refuse, instead of handing in
  // a board whose cover the scorer rejects: size cap, and dimensions read
  // from the image header itself (long side at most 1440, short side at
  // least 800), so a wrong-sized render is caught here, not at scoring.
  const shotBytes = readFileSync(join(out, 'screenshots', name));
  if (shotBytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(
      `token radar: screenshots/${name} is ${shotBytes.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} the gate allows\n`,
    );
    process.exit(1);
  }
  const dims = imageDimensions(shotBytes, name);
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

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(out, 'dossier.json'), dossier);
// Self-check: what was written must be exactly what the scorer rebuilds
// from this same directory, or the submission is refused on arrival.
const written = readFileSync(join(out, 'dossier.json'));
if (!Buffer.from(written).equals(Buffer.from(dossier))) {
  process.stderr.write('token radar: dossier.json on disk is not the dossier just built\n');
  process.exit(1);
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${new Set([...dash, 'METHOD.md']).size} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
