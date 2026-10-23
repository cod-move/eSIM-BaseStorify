#!/usr/bin/env node
/**
 * Keeps `src/contracts` an exact copy of the business API's contract.
 *
 * The contract (the zod schemas of every request and response) is written in
 * the Storify web app, in `contracts/mobile/biz/v1/`. The business app needs
 * the same files to build on its own, so it carries a copy, and this script is
 * the only thing that writes that copy. Only that one folder is copied: the
 * shopper app's contract, beside it in the web app, is not this app's.
 *
 *   pnpm contracts:sync     copy the contract from the web app
 *   pnpm contracts:check    fail if the copy was edited here, or is out of date
 *
 * The web app is looked for next to this project (`../Storify-main-app`). Set
 * STORIFY_MAIN_APP_DIR to point somewhere else: in the environment, or in
 * `.env.local` (not read when the environment already has it).
 *
 * `src/contracts/manifest.json` records where the copy came from and a hash of
 * its files. The hash identifies the contract in a release checklist, and it
 * also names the app's stored cache, so a new contract starts with an empty one.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/** The contract's folder, the same below the web app's root and below `src/`. */
const CONTRACT = join('contracts', 'mobile', 'biz', 'v1');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = join(root, 'src', 'contracts');
const target = join(root, 'src', CONTRACT);
const manifestPath = join(contracts, 'manifest.json');

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
const source = join(mainApp, CONTRACT);

const mode = process.argv[2] ?? '--sync';

/** Contract files only: snapshots and tests are not part of the copy. */
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

function fail(message) {
  console.error(`contracts: ${message}`);
  process.exit(1);
}

if (mode === '--sync') {
  if (!existsSync(source)) {
    fail(
      `no business contract found at ${source}.\n` +
        'Set STORIFY_MAIN_APP_DIR (in .env.local) to a checkout of the web app that has it.'
    );
  }

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', mainApp, 'rev-parse', '--short=8', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // Not a git checkout (a release zip, for example): the hash still identifies the copy.
  }

  rmSync(contracts, { recursive: true, force: true });
  for (const file of listFiles(source)) {
    cpSync(join(source, file), join(target, file), { recursive: true });
  }
  const manifest = {
    source: `storify-main-app@${commit}`,
    hash: hashOf(target),
    files: listFiles(target).length,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `contracts: copied ${manifest.files} files from ${manifest.source} (${manifest.hash})`
  );
} else if (mode === '--check') {
  if (!existsSync(manifestPath))
    fail('src/contracts/manifest.json is missing. Run `pnpm contracts:sync`.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (hashOf(target) !== manifest.hash) {
    fail(
      'src/contracts was edited by hand. Change the contract in the web app, then run `pnpm contracts:sync`.'
    );
  }

  if (existsSync(source) && hashOf(source) !== manifest.hash) {
    fail(`src/contracts is behind ${source}. Run \`pnpm contracts:sync\`.`);
  }

  const compared = existsSync(source)
    ? `matches the web app (${mainApp})`
    : 'unchanged (no business contract in the web app here, not compared)';
  console.log(`contracts: ${manifest.source}, ${manifest.files} files, ${compared}`);
} else {
  fail(`unknown option ${mode}. Use --sync or --check.`);
}
