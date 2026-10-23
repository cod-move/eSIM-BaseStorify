#!/usr/bin/env node
/**
 * Keeps `src/contracts` an exact copy of the API's contract.
 *
 * The contract (the zod schemas of every request and response) is written in
 * the Storify web app, in its `contracts/` folder. The mobile app needs the
 * same files to build on its own, so it carries a copy, and this script is the
 * only thing that writes that copy.
 *
 *   pnpm contracts:sync     copy the contract from the web app
 *   pnpm contracts:check    fail if the copy was edited here, or is out of date
 *
 * The web app is looked for next to this project (`../Storify-main-app`). Set
 * STORIFY_MAIN_APP_DIR to point somewhere else: in the environment, or in
 * `.env.local` (not read when the environment already has it). It is the one
 * setting that makes `contracts:check` compare with the web app, so a developer
 * keeps it in `.env.local` once.
 *
 * `src/contracts/manifest.json` records where the copy came from and a hash of
 * its files. The hash also names the app's stored cache, so a new contract
 * starts with an empty one.
 *
 * While the web app has no `contracts/` folder yet, `src/contracts` holds a
 * draft written here. `--stamp-draft` re-hashes it after an edit; it refuses to
 * run once the copy comes from the web app.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'contracts');
const manifestPath = join(target, 'manifest.json');

/** Where the web app is: the environment first, then `.env.local`, then next to this project. */
function mainAppDir() {
  const fromEnvironment = process.env.STORIFY_MAIN_APP_DIR?.trim();
  if (fromEnvironment) return fromEnvironment;
  const envFile = join(root, '.env.local');
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).STORIFY_MAIN_APP_DIR?.trim()
    : undefined;
  return fromFile || '../Storify-main-app';
}

const mainApp = resolve(root, mainAppDir());
const source = join(mainApp, 'contracts');

const mode = process.argv[2] ?? '--sync';

/** Contract files only: the manifest, snapshots and tests are not part of the copy. */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
    )
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((file) => !file.includes('__snapshot__'))
    .sort();
}

function hashOf(dir) {
  const hash = createHash('sha256');
  for (const file of listFiles(dir)) {
    // Line endings differ between a Windows and a Unix checkout of the same commit.
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex').slice(0, 16);
}

function readManifest() {
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
}

function writeManifest(from) {
  const manifest = { source: from, hash: hashOf(target), files: listFiles(target).length };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function fail(message) {
  console.error(`contracts: ${message}`);
  process.exit(1);
}

if (mode === '--sync') {
  if (!existsSync(source)) {
    fail(
      `no contract found at ${source}.\n` +
        'Set STORIFY_MAIN_APP_DIR (in .env.local) to the folder of the Storify web app.'
    );
  }

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', mainApp, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // Not a git checkout (a release zip, for example): the hash still identifies the copy.
  }

  rmSync(target, { recursive: true, force: true });
  for (const file of listFiles(source)) {
    cpSync(join(source, file), join(target, file), { recursive: true });
  }
  const manifest = writeManifest(`storify-main-app@${commit}`);
  console.log(
    `contracts: copied ${manifest.files} files from ${manifest.source} (${manifest.hash})`
  );
} else if (mode === '--check') {
  const manifest = readManifest();
  if (!manifest) fail('src/contracts/manifest.json is missing. Run `pnpm contracts:sync`.');

  if (hashOf(target) !== manifest.hash) {
    fail(
      manifest.source === 'draft'
        ? 'the draft in src/contracts changed. Run `node scripts/contracts-sync.mjs --stamp-draft`.'
        : 'src/contracts was edited by hand. Change the contract in the web app, then run `pnpm contracts:sync`.'
    );
  }

  if (existsSync(source) && hashOf(source) !== manifest.hash) {
    fail(`src/contracts is behind ${source}. Run \`pnpm contracts:sync\`.`);
  }

  const compared = existsSync(source)
    ? `matches the web app (${mainApp})`
    : 'unchanged (web app contract not found here, not compared)';
  console.log(`contracts: ${manifest.source}, ${manifest.files} files, ${compared}`);
} else if (mode === '--stamp-draft') {
  const manifest = readManifest();
  if (manifest && manifest.source !== 'draft') {
    fail(`src/contracts is a copy of ${manifest.source}, not a draft: it is not edited here.`);
  }
  const stamped = writeManifest('draft');
  console.log(`contracts: draft stamped (${stamped.files} files, ${stamped.hash})`);
} else {
  fail(`unknown option ${mode}. Use --sync, --check or --stamp-draft.`);
}
