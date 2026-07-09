#!/usr/bin/env node
/**
 * Vendor the tesseract.js worker + wasm core into `public/tesseract/` so OCR can
 * run fully offline (no CDN hit). Runs automatically before `build`/`dev` via the
 * npm `prebuild` / `predev` hooks.
 *
 * What it copies from node_modules:
 *   - tesseract.js/dist/worker.min.js                 -> public/tesseract/worker.min.js
 *   - tesseract.js-core/tesseract-core*.wasm.js (+ .wasm)
 *                                                     -> public/tesseract/
 *
 * The worker picks a core variant at runtime based on SIMD support
 * (tesseract-core[-relaxedsimd|-simd][-lstm].wasm.js), so we copy every variant.
 *
 * Language traineddata is NOT vendored here (it isn't shipped in node_modules).
 * Use `scripts/fetch-tesseract-lang.sh` to place it in public/tesseract/lang/.
 *
 * This script only touches local files — it performs no network access. It is a
 * no-op (with a warning) if the tesseract packages aren't installed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const nodeModules = join(root, 'node_modules');
const outDir = join(root, 'public', 'tesseract');

const workerSrc = join(nodeModules, 'tesseract.js', 'dist', 'worker.min.js');
const coreDir = join(nodeModules, 'tesseract.js-core');

if (!existsSync(workerSrc) || !existsSync(coreDir)) {
  console.warn(
    '[copy-tesseract-assets] tesseract.js / tesseract.js-core not found in node_modules — ' +
      'skipping vendoring. OCR will fall back to the CDN at runtime.',
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

let copied = 0;
const copy = (src, dest) => {
  copyFileSync(src, dest);
  copied += 1;
};

// 1. Worker script.
copy(workerSrc, join(outDir, 'worker.min.js'));

// 2. All wasm core variants (+ their .wasm.js loaders).
for (const name of readdirSync(coreDir)) {
  if (/^tesseract-core.*\.wasm(\.js)?$/.test(name)) {
    copy(join(coreDir, name), join(outDir, name));
  }
}

console.log(
  `[copy-tesseract-assets] Vendored ${copied} tesseract asset(s) into public/tesseract/.`,
);
