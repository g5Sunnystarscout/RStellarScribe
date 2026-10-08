//------------------------------------------------------------------------------------
// environment.mjs -- Part of RStellarScribe
//
// Environment discovery, debug-run planning and the debug-run session.
//
// RHoiScribe pairs a launch tool (through its Rchadow helper) with a validation tool
// that compares the mods the workspace needs against `dlc_load.json`. Stellaris has
// the same `dlc_load.json` contract, so the validation port is faithful.
//
// The launch side stays deliberately conservative: `plan_stellaris_debug_run` only
// prints the command line, and the one tool that does start a process
// (`run_stellaris_debug_session`) is the *test run* wrapper the user asked for - it
// launches, watches `logs/error.log` until the log goes quiet for 20 s, and then
// kills the process again so an automated loop cannot leave the game burning CPU.
// A human who needs to look at the screen opts out with `keep_running: true`.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { analyseMountability, discoverStellarisInstall, suggestedAsciiModRoot } from '../lib/paths.mjs';
import { parseDescriptor, WorkspaceError } from '../lib/workspace.mjs';
import { ERROR_LINE_MARKERS } from './validators.mjs';

const STEAM_LIBRARY_FILES = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
  'D:\\Steam\\steamapps\\libraryfolders.vdf',
  'D:\\SteamLibrary\\steamapps\\libraryfolders.vdf',
  'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf',
];

/**
 * Extra roots worth checking for a non-Steam or side-by-side copy. Paradox players
 * commonly keep a second, fully patched install outside Steam; a discovery routine
 * that only reads `libraryfolders.vdf` silently recommends the older one, which is
 * exactly how a mod ends up validated against the wrong game version.
 */
const EXTRA_INSTALL_ROOTS = [
  // Generic locations only. This list used to carry one machine's own trees
  // (`C:\ST-NEW\Stellaris`, `D:\Games\ST-NEW\Stellaris`), which find nothing on
  // anybody else's disk; the version check in readGameVersion is what actually
  // protects against validating a mod against the wrong build.
  'C:\\Stellaris',
  'D:\\Stellaris',
  'E:\\Stellaris',
  'F:\\Stellaris',
  'D:\\Games\\Stellaris',
  'E:\\Games\\Stellaris',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stellaris',
  'C:\\Program Files\\Steam\\steamapps\\common\\Stellaris',
  'E:\\SteamLibrary\\steamapps\\common\\Stellaris',
  'F:\\SteamLibrary\\steamapps\\common\\Stellaris',
];

/** Read a launcher-settings.json into the fields that matter for version checks. */
export function readGameVersion(gameRoot) {
  const settings = join(gameRoot, 'launcher-settings.json');
  if (!existsSync(settings)) return { raw: null, compatibility: null, version_file: null };
  try {
    const parsed = JSON.parse(readFileSync(settings, 'utf8').replace(/^\uFEFF/, ''));
    const raw = typeof parsed.version === 'string' ? parsed.version : null;
    // Older launchers omit `modsCompatibilityVersion` entirely (the 4.1.7 install does),
    // so fall back to the version string itself: "Lyra v4.1.7 (6486)" -> "4.1".
    const derived =
      typeof parsed.modsCompatibilityVersion === 'string'
        ? parsed.modsCompatibilityVersion
        : /v?(\d+\.\d+)/.exec(raw ?? parsed.rawVersion ?? '')?.[1] ?? null;
    return {
      raw,
      raw_version: typeof parsed.rawVersion === 'string' ? parsed.rawVersion : null,
      compatibility: derived,
      compatibility_source:
        typeof parsed.modsCompatibilityVersion === 'string'
          ? 'modsCompatibilityVersion'
          : derived
            ? 'derived from the version string'
            : null,
      version_file: settings,
    };
  } catch {
    return { raw: null, compatibility: null, version_file: settings };
  }
}

/** Environment overrides, so an undiscoverable install can be pinned once. */
export function pinnedGameRoot() {
  const value = process.env.RSTELLARISCRIBE_GAME_ROOT;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function pinnedDocumentsRoot() {
  const value = process.env.RSTELLARISCRIBE_DOCUMENTS_ROOT;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * discover_stellaris_environment
 *
 * Reports only paths that exist. Steam libraries are read from
 * `libraryfolders.vdf` instead of guessing drive letters.
 */
export function discoverStellarisEnvironment(args = {}) {
  const discovered = discoverStellarisInstall();

  const libraryRoots = new Set();
  for (const vdf of STEAM_LIBRARY_FILES) {
    if (!existsSync(vdf)) continue;
    try {
      const text = readFileSync(vdf, 'utf8');
      for (const match of text.matchAll(/"path"\s*"([^"]+)"/g)) {
        libraryRoots.add(match[1].replace(/\\\\/g, '\\'));
      }
    } catch {
      // unreadable library file: the explicit `game_root` argument still works
    }
  }

  const gameRoots = [...discovered.game];
  for (const library of libraryRoots) {
    const candidate = join(library, 'steamapps', 'common', 'Stellaris');
    if (existsSync(join(candidate, 'common'))) gameRoots.push(candidate);
  }
  for (const candidate of EXTRA_INSTALL_ROOTS) {
    if (existsSync(join(candidate, 'stellaris.exe'))) gameRoots.push(candidate);
  }
  const pinned = pinnedGameRoot();
  if (pinned) gameRoots.unshift(pinned);
  if (typeof args.game_root === 'string' && args.game_root.trim() !== '') {
    gameRoots.unshift(args.game_root.trim());
  }

  const games = [...new Set(gameRoots)].map((root) => {
    const executable = join(root, 'stellaris.exe');
    const version = readGameVersion(root);
    const dlcDirectory = join(root, 'dlc');
    return {
      game_root: root,
      exists: existsSync(root),
      has_vanilla_common: existsSync(join(root, 'common')),
      has_localisation: existsSync(join(root, 'localisation')),
      executable: existsSync(executable) ? executable : null,
      version: version.raw,
      mods_compatibility_version: version.compatibility,
      dlc_folders: existsSync(dlcDirectory) ? readdirSync(dlcDirectory).length : 0,
    };
  });

  const documentsRoots = [...discovered.documents];
  const pinnedDocs = pinnedDocumentsRoot();
  if (pinnedDocs) documentsRoots.unshift(pinnedDocs);
  if (typeof args.documents_root === 'string' && args.documents_root.trim() !== '') {
    documentsRoots.unshift(args.documents_root.trim());
  }

  const documents = [...new Set(documentsRoots)].map((root) => ({
    documents_root: root,
    exists: existsSync(root),
    logs: existsSync(join(root, 'logs')) ? join(root, 'logs') : null,
    mod_directory: existsSync(join(root, 'mod')) ? join(root, 'mod') : null,
    dlc_load_json: existsSync(join(root, 'dlc_load.json')) ? join(root, 'dlc_load.json') : null,
    settings: existsSync(join(root, 'settings.txt')) ? join(root, 'settings.txt') : null,
  }));

  const installed = games.filter((game) => game.executable && game.has_vanilla_common);
  // Rank by compatibility version so a fully patched side-by-side install outranks an
  // older Steam copy, but never present the ranking as authoritative.
  const ranked = [...installed].sort((a, b) =>
    compareVersions(b.mods_compatibility_version, a.mods_compatibility_version),
  );
  const bestGame = ranked[0] ?? games[0] ?? null;
  const ambiguous = installed.length > 1;
  const bestDocuments = documents.find((entry) => entry.dlc_load_json) ?? documents[0] ?? null;

  return {
    found: Boolean(bestGame && bestDocuments),
    ambiguous,
    pinned_game_root: pinned,
    steam_libraries: [...libraryRoots],
    games,
    documents,
    recommended: {
      game_root: bestGame?.game_root ?? null,
      documents_root: bestDocuments?.documents_root ?? null,
      logs: bestDocuments?.logs ?? null,
      mod_directory: bestDocuments?.mod_directory ?? null,
    },
    notes: [
      ...discovered.notes,
      'Steam library folders are read from `libraryfolders.vdf`, and a few conventional non-Steam roots are probed as well.',
      ambiguous
        ? `MORE THAN ONE INSTALL WAS FOUND (${installed.length}). The recommendation is only "highest compatibility version", not a statement about which copy you actually play. Confirm the version above, and pass \`game_root\` explicitly (or set RSTELLARISCRIBE_GAME_ROOT) before trusting any version-sensitive result.`
        : 'The game version is read from `launcher-settings.json`; a null version means the launcher has not written it yet.',
      'A mod folder and its logs live in the shared documents directory, so both installs see the same mods. Only the vanilla files differ.',
    ],
  };
}

/** Compare "4.4" style compatibility versions; missing values sort last. */
function compareVersions(left, right) {
  const parse = (value) => String(value ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * plan_stellaris_debug_run
 *
 * Computes the mod set the workspace needs, compares it with `dlc_load.json`,
 * and prints the command line to run. It never launches the game.
 */
export function planStellarisDebugRun(args = {}) {
  const gameRoot = resolveGameRoot(args);
  const documentsRoot = resolveDocumentsRoot(args);
  const workspaceModPath = requirePath(args.workspace_mod_path, 'workspace_mod_path');
  const state = inspectDebugState({ gameRoot, documentsRoot, workspaceModPath, args });

  return {
    ...state,
    command_line: gameRoot
      ? `"${join(gameRoot, 'stellaris.exe')}" -debug_mode -logall -debugtooltip`
      : null,
    messages: [
      'This tool never starts the game. Run the printed command line yourself, then call `classify_error_log` on the newest `error.log` - or hand the whole loop to `run_stellaris_debug_session`, which launches, watches the log and stops the game again.',
      'Launch the executable directly, never through the Paradox launcher: the launcher rewrites `dlc_load.json` from its own cache and can silently drop the mod set you just validated.',
      '`-debug_mode` writes the detailed log; `-logall` stops the log from dropping repeated identical messages; `-debugtooltip` reveals identifiers in the interface.',
      'Only one copy of a mod may be enabled: a local folder and a Steam Workshop subscription with the same name make the game refuse to load it.',
      'DURABILITY WARNING: `dlc_load.json` is owned by the launcher. Editing it directly works for a launch, but the next time the launcher rewrites the playset your manual entry disappears. Enable a local mod in the launcher interface for a permanent playset.',
      'Write `dlc_load.json` as UTF-8 WITHOUT a BOM: a BOM makes the game fail to parse it and load no mods at all. Localisation `.yml` files are the opposite and need the BOM.',
    ],
  };
}

/** validate_stellaris_debug_run */
export function validateStellarisDebugRun(args = {}) {
  const gameRoot = resolveGameRoot(args);
  const documentsRoot = resolveDocumentsRoot(args);
  const workspaceModPath = requirePath(args.workspace_mod_path, 'workspace_mod_path');
  const state = inspectDebugState({ gameRoot, documentsRoot, workspaceModPath, args });

  const verdict =
    state.missing_from_enabled_mods.length === 0 &&
    state.enabled_but_not_required.length === 0 &&
    state.mount_warnings.length === 0
      ? 'green'
      : 'mismatch';

  const messages = [
    verdict === 'green'
      ? 'The enabled mod set matches exactly what the workspace needs.'
      : 'The enabled mod set does not match. The game loads a different set than the one you are editing, so a test run proves nothing about your files.',
    'Stellaris stores enabled mods in `dlc_load.json` as `mod/<file>.mod` entries; the launcher rewrites this file whenever it changes the playset.',
  ];
  for (const problem of state.mount_warnings) {
    messages.push(
      `MOUNT BLOCKER (${problem.code}): ${problem.message} Fix: ${problem.fix} Suggested location: ${suggestedAsciiModRoot(
        workspaceModPath.split(/[\\/]/).pop(),
      )}`,
    );
  }
  if (state.mount_warnings.length > 0) {
    messages.push(
      'This is why a mod can be listed as enabled, produce no errors, and still have no effect in game.',
    );
  }

  return {
    ...state,
    verdict,
    messages,
  };
}

function inspectDebugState({ gameRoot, documentsRoot, workspaceModPath, args }) {
  const required = new Map();
  const descriptorPath = join(workspaceModPath, 'descriptor.mod');
  if (!existsSync(descriptorPath)) {
    throw new WorkspaceError(`\`${workspaceModPath}\` has no descriptor.mod, so it is not a mod root`);
  }
  const descriptor = parseDescriptor(readFileSync(descriptorPath, 'utf8'));
  const ownName = descriptor.fields.name ?? null;
  if (ownName) required.set(ownName, 'workspace_descriptor');
  for (const dependency of descriptor.blocks.dependencies ?? []) {
    required.set(dependency, 'workspace_dependency');
  }
  for (const dependency of Array.isArray(args.dependencies) ? args.dependencies : []) {
    required.set(dependency, 'requested_dependency');
  }

  const enabled = [];
  const dlcLoadJson = documentsRoot ? join(documentsRoot, 'dlc_load.json') : null;
  if (dlcLoadJson && existsSync(dlcLoadJson)) {
    try {
      const parsed = JSON.parse(readFileSync(dlcLoadJson, 'utf8'));
      for (const entry of parsed.enabled_mods ?? []) {
        const modFile = join(documentsRoot, entry.replace(/\//g, '\\'));
        let name = null;
        if (existsSync(modFile)) {
          try {
            name = parseDescriptor(readFileSync(modFile, 'utf8')).fields.name ?? null;
          } catch {
            name = null;
          }
        }
        enabled.push({ entry, name, exists: existsSync(modFile) });
      }
    } catch (thrown) {
      throw new WorkspaceError(`failed to read ${dlcLoadJson}: ${thrown.message}`);
    }
  }

  const enabledNames = new Set(enabled.map((entry) => entry.name).filter(Boolean));
  const missing = [...required.entries()]
    .filter(([name]) => !enabledNames.has(name))
    .map(([name, reason]) => ({ name, reason }));
  const extra = [...enabledNames].filter((name) => !required.has(name));

  const logs = documentsRoot ? join(documentsRoot, 'logs') : null;
  const logFiles = [];
  if (logs && existsSync(logs)) {
    for (const entry of readdirSync(logs)) {
      const full = join(logs, entry);
      try {
        if (statSync(full).isFile()) logFiles.push({ name: entry, modified: statSync(full).mtime.toISOString() });
      } catch {
        // ignore unreadable log entries
      }
    }
    logFiles.sort((a, b) => (a.modified < b.modified ? 1 : -1));
  }

  return {
    game_root: gameRoot,
    documents_root: documentsRoot,
    workspace_mod_path: workspaceModPath,
    workspace_mod_name: ownName,
    mount_warnings: analyseMountability(workspaceModPath),
    required_mods: [...required.entries()].map(([name, reason]) => ({ name, reason })),
    enabled_mods: enabled,
    missing_from_enabled_mods: missing,
    enabled_but_not_required: extra,
    logs_directory: logs,
    newest_logs: logFiles.slice(0, 8),
  };
}

function resolveGameRoot(args) {
  if (typeof args.game_root === 'string' && args.game_root.trim() !== '') {
    const root = args.game_root.trim();
    if (!existsSync(join(root, 'stellaris.exe'))) {
      throw new WorkspaceError(`\`${root}\` has no stellaris.exe`);
    }
    return root;
  }
  const pinned = pinnedGameRoot();
  if (pinned) {
    if (!existsSync(join(pinned, 'stellaris.exe'))) {
      throw new WorkspaceError(
        `RSTELLARISCRIBE_GAME_ROOT points at \`${pinned}\`, which has no stellaris.exe`,
      );
    }
    return pinned;
  }
  const discovered = discoverStellarisEnvironment({});
  const installed = discovered.games.filter((game) => game.executable && game.has_vanilla_common);
  if (installed.length === 0) {
    throw new WorkspaceError(
      'no Stellaris install was found; pass `game_root` explicitly (the folder containing stellaris.exe) or set RSTELLARISCRIBE_GAME_ROOT',
    );
  }
  if (installed.length > 1) {
    const versions = installed
      .map((game) => `${game.game_root} (${game.mods_compatibility_version ?? 'version unknown'})`)
      .join('; ');
    throw new WorkspaceError(
      `more than one Stellaris install was found, so the game version is ambiguous: ${versions}.\n` +
        'Pass `game_root` explicitly, or set RSTELLARISCRIBE_GAME_ROOT once, so version-sensitive checks use the copy you actually play.',
    );
  }
  return installed[0].game_root;
}

function resolveDocumentsRoot(args) {
  if (typeof args.documents_root === 'string' && args.documents_root.trim() !== '') {
    const root = args.documents_root.trim();
    if (!existsSync(root)) throw new WorkspaceError(`\`${root}\` does not exist`);
    return root;
  }
  const discovered = discoverStellarisEnvironment({});
  const found = discovered.documents.find((entry) => entry.exists);
  if (!found) {
    throw new WorkspaceError(
      'the Stellaris user data folder was not found; pass `documents_root` explicitly',
    );
  }
  return found.documents_root;
}

/**
 * Resolve the install a *test run* should use.
 *
 * `resolveGameRoot` deliberately refuses to guess between two installed copies of the
 * game, because a version-sensitive answer must not be based on a guess. Launching is a
 * different question: the copy to start is the newest fully installed one, and the
 * earlier Steam copy is only ever a fallback. This still honours `game_root` and
 * `RSTELLARISCRIBE_GAME_ROOT` first, so nothing here overrides an explicit pin - it only
 * replaces an outright refusal to run.
 */
function resolveLaunchGameRoot(args) {
  if (typeof args.game_root === 'string' && args.game_root.trim() !== '') {
    return requireGameExecutable(args.game_root.trim());
  }
  const pinned = pinnedGameRoot();
  if (pinned) return requireGameExecutable(pinned);
  const discovered = discoverStellarisEnvironment({});
  const installed = discovered.games
    .filter((game) => game.executable && game.has_vanilla_common)
    .sort((a, b) => compareVersions(b.mods_compatibility_version, a.mods_compatibility_version));
  if (installed.length === 0) {
    throw new WorkspaceError(
      'no Stellaris install was found; pass `game_root` explicitly (the folder containing stellaris.exe) or set RSTELLARISCRIBE_GAME_ROOT',
    );
  }
  return installed[0].game_root;
}

function requireGameExecutable(root) {
  if (!existsSync(join(root, 'stellaris.exe'))) {
    throw new WorkspaceError(`\`${root}\` has no stellaris.exe`);
  }
  return root;
}

function requirePath(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WorkspaceError(`\`${field}\` is required`);
  }
  const resolved = value.trim();
  if (!existsSync(resolved)) throw new WorkspaceError(`\`${resolved}\` does not exist`);
  return resolved;
}

// ====================================================================================
// The debug-run session: launch, watch the log settle, stop the process
// ====================================================================================
//
// The contract the user asked for: "if nothing new within 20 s, the test is over".
// Everything below is built around one pure decision - `isLogSettled` - so the
// judgement can be asserted without ever starting a game.

/** Default quiet window: no new bytes in `logs/error.log` for this long means done. */
export const DEFAULT_SETTLE_MS = 20_000;
export const DEFAULT_POLL_MS = 2_000;
export const DEFAULT_MAX_WAIT_MS = 900_000;
/** The engine keeps writing after the last script error, so wait a little past "quiet". */
export const DEFAULT_GRACE_MS = 5_000;

/** `true` when the flag was supplied as `true` (or the string "true"). */
function isTrue(value) {
  return value === true || value === 'true';
}

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

/**
 * Take a snapshot of the log file. A missing file is a legitimate snapshot: the game
 * may not have created `error.log` yet on the very first run.
 */
export function snapshotLogFile(logPath) {
  try {
    const stat = statSync(logPath);
    return { at: Date.now(), size: stat.size, mtime: stat.mtimeMs };
  } catch {
    return { at: Date.now(), size: null, mtime: null };
  }
}

/** Identity of a snapshot: size *and* mtime, so a same-size rewrite still counts as a change. */
function snapshotSignature(snapshot) {
  if (!snapshot || snapshot.size === null || snapshot.size === undefined) return 'missing';
  return `${snapshot.size}:${snapshot.mtime}`;
}

/**
 * PURE. Did the log stop changing?
 *
 * `history` is the list of snapshots taken so far (oldest first). `lastChangeAt` is the
 * moment of the *last observed growth*, while `now` is the moment being judged - both
 * explicit, so a test can move time without sleeping. `quietMs` is the quiet window.
 *
 * Rules that matter in practice:
 *   * fewer than two samples cannot prove "nothing new" yet;
 *   * a signature change against the previous sample is growth, and growth resets the
 *     clock to `now` (it is the freshest evidence we have);
 *   * `settled` is only ever true 20 s (or `quietMs`) after that last growth.
 */
export function isLogSettled(history, quietMs, now, lastChangeAt = null) {
  const samples = Array.isArray(history) ? history : [];
  if (samples.length < 2) return { settled: false, reason: 'not_enough_samples', quiet_for_ms: 0 };
  const current = samples[samples.length - 1];
  const previous = samples[samples.length - 2];
  const changed = snapshotSignature(current) !== snapshotSignature(previous);
  const quietSince = changed ? now : lastChangeAt ?? current?.at ?? now;
  const quietFor = Math.max(0, now - quietSince);
  if (changed) return { settled: false, reason: 'log_grew', quiet_for_ms: 0 };
  if (quietFor >= quietMs) return { settled: true, reason: 'quiet_window_elapsed', quiet_for_ms: quietFor };
  return { settled: false, reason: 'quiet_window_pending', quiet_for_ms: quietFor };
}

/**
 * PURE. Append a snapshot and report the last observed growth.
 *
 * The clock starts at `startedAt`, not at the first sample: a game that takes longer
 * than the quiet window to reach its error log would otherwise be declared "settled"
 * the instant its first log line appeared.
 */
export function extendLogHistory(history, snapshot, quietMs, startedAt = snapshot?.at ?? Date.now()) {
  const samples = [...(Array.isArray(history) ? history : []), snapshot];
  if (samples.length < 2) {
    return { history: samples, last_change_at: startedAt, grew: false };
  }
  const previous = samples[samples.length - 2];
  const grew = snapshotSignature(samples[samples.length - 1]) !== snapshotSignature(previous);
  return {
    history: samples,
    last_change_at: grew ? snapshot.at : startedAt,
    grew,
  };
}

/**
 * PURE. Should polling stop?
 *
 * `keep_running` deliberately does NOT keep the loop alive: the caller asked for the
 * *process* to survive a human glance, not for the tool call to block forever. The flag
 * only reaches `decideProcessCleanup`.
 */
export function decideRunCompletion({ settled, keepRunning, elapsedMs, maxWaitMs }) {
  if (settled) return { stop_polling: true, reason: keepRunning ? 'log_settled_keeping_process' : 'log_settled' };
  if (elapsedMs >= maxWaitMs) return { stop_polling: true, reason: 'max_wait_elapsed' };
  return { stop_polling: false, reason: 'waiting_for_log_to_settle' };
}

/**
 * PURE. Should the process be killed, and should we tell the caller about a survivor?
 *
 * Ported verbatim into the selftest: `keep_running: true` must suppress the kill.
 */
export function decideProcessCleanup({ keepRunning, runCreatedProcess, logSettled }) {
  if (keepRunning) {
    return {
      stop: false,
      left_running: true,
      reason: 'keep_running_requested',
      message: 'keep_running is set, so the game was left running for a visual check.',
    };
  }
  if (!runCreatedProcess) {
    return {
      stop: false,
      left_running: true,
      reason: 'attached_to_existing_process',
      message:
        'this run attached to a game process that was already running, so it was NOT killed; stop it yourself when you are done',
    };
  }
  if (!logSettled) {
    return {
      stop: false,
      left_running: true,
      reason: 'no_settle_evidence',
      message:
        'the log never settled within the wait budget, so the process was left running rather than killed blindly',
    };
  }
  return {
    stop: true,
    left_running: false,
    reason: 'log_settled',
    message: 'the log settled, so the game process was terminated with Stop-Process -Force.',
  };
}

/**
 * Parse an error log into the lines an agent should look at, and separate the ones the
 * changed mod plausibly caused. `hints` are filesystem paths (mod root, enabled mod
 * folders); a line naming one of them is attributed to the workspace.
 */
export function extractErrorLines(logPath, { limit = 40, hints = [] } = {}) {
  if (!logPath) return { available: false, log_path: null, error_lines: [], mod_lines: [] };
  let text;
  try {
    text = readFileSync(logPath, 'utf8');
  } catch {
    return { available: false, log_path: logPath, error_lines: [], mod_lines: [] };
  }
  const normalizedHints = (Array.isArray(hints) ? hints : [])
    .filter((hint) => typeof hint === 'string' && hint.trim() !== '')
    .map((hint) => hint.replace(/\\/g, '/').toLowerCase());

  const errorLines = [];
  const modLines = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') return;
    const lower = line.toLowerCase();
    if (!ERROR_LINE_MARKERS.some((marker) => lower.includes(marker))) return;
    const normalized = line.replace(/\\/g, '/');
    if (errorLines.length < limit) errorLines.push({ line: index + 1, message: normalized });
    if (normalizedHints.some((hint) => normalized.toLowerCase().includes(hint)) && modLines.length < limit) {
      modLines.push({ line: index + 1, message: normalized });
    }
  });
  return { available: true, log_path: logPath, error_lines: errorLines, mod_lines: modLines };
}

/** PURE. Human/machine summary of a finished run. */
export function summariseDebugRun({ startedAt, now, logPath, settled, history, errorLines, cleanup }) {
  const elapsedSeconds = Math.max(0, Math.round(((now ?? Date.now()) - startedAt) / 1000));
  const logErrors = errorLines?.error_lines ?? [];
  const modErrors = errorLines?.mod_lines ?? [];
  return {
    elapsed_seconds: elapsedSeconds,
    log_settled: Boolean(settled),
    log_path: logPath ?? null,
    log_samples: Array.isArray(history) ? history.length : 0,
    error_line_count: logErrors.length,
    mod_error_count: modErrors.length,
    errors: logErrors,
    mod_errors: modErrors,
    mod_errors_summary: modErrors.length === 0 ? 'none' : modErrors.map((entry) => entry.message).join('\n'),
    process_stopped: Boolean(cleanup?.stop),
    process_left_running: Boolean(cleanup?.left_running),
    cleanup_reason: cleanup?.reason ?? null,
  };
}

/** PowerShell one-liner answer to "is a Stellaris process alive?". */
export function buildProcessQueryCommand() {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '"@(Get-Process -Name stellaris -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) -join \',\'"',
  ];
}

/** PowerShell one-liner that force-stops the game, used instead of piped stdio. */
export function buildProcessStopCommand() {
  return ['-NoProfile', '-NonInteractive', '-Command', 'Stop-Process -Name stellaris -Force -ErrorAction SilentlyContinue'];
}

/**
 * Run a PowerShell snippet and try to capture its stdout.
 *
 * Piped stdio is refused outright in some confined Windows modes, and then capturing is
 * impossible from Node here; in that case the snippet is re-run with every channel
 * ignored, so the *effect* still happens and the caller is told that the answer could
 * not be read (`captured: false`) instead of being handed a made-up one.
 */
function runPowerShellCaptured(args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let child;
    try {
      child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (thrown) {
      runPowerShell(args, timeoutMs).then((fallback) =>
        finish({ ok: fallback.ok, captured: false, stdout: '', stderr: '', code: fallback.code ?? null }),
      );
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      finish({ ok: false, captured: true, stdout, stderr: `${stderr}\ntimed out`, code: null });
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      runPowerShell(args, timeoutMs).then((fallback) =>
        finish({
          ok: fallback.ok,
          captured: false,
          stdout: '',
          stderr: fallback.error ?? '',
          code: fallback.code ?? null,
        }),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: true, captured: true, stdout, stderr, code });
    });
  });
}

/**
 * Run a PowerShell snippet with every stdio channel ignored and always resolve.
 * Used for the stop call, where the answer is not needed.
 */
function runPowerShell(args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('powershell.exe', args, {
        stdio: 'ignore',
        windowsHide: true,
        detached: false,
      });
    } catch (thrown) {
      resolve({ ok: false, error: thrown instanceof Error ? thrown.message : String(thrown) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }, timeoutMs);
    child.on('error', (thrown) => {
      clearTimeout(timer);
      resolve({ ok: false, error: thrown instanceof Error ? thrown.message : String(thrown) });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: true, code });
    });
  });
}

/** PURE. Turn PowerShell's `1,2` answer into a number list. */
export function parseProcessIds(stdout) {
  if (typeof stdout !== 'string') return [];
  return stdout
    .split(/[\s,]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * PURE. Classify a `Stop-Process -Name stellaris -Force` exit.
 *
 * The stop call runs with `-ErrorAction SilentlyContinue`, so "no such process" and
 * "stopped it" are not distinguishable from the exit code alone; the caller pairs this
 * with a follow-up process query.
 */
export function interpretStopResult({ ok, code }) {
  if (!ok) return { stopped: false, reason: 'stop_command_failed' };
  if (code === 0) return { stopped: true, reason: 'stop_command_succeeded' };
  return { stopped: false, reason: `stop_command_exit_${code}` };
}

/** Launch the game detached, with the log-writing flags the debug workflow needs. */
function launchGameProcess(executable, gameRoot, args) {
  const executableArgs = ['-debug_mode'];
  if (!isTrue(args.no_logall)) executableArgs.push('-logall');
  if (isTrue(args.debugtooltip)) executableArgs.push('-debugtooltip');
  const child = spawn(executable, executableArgs, {
    cwd: gameRoot,
    detached: true,
    windowsHide: true,
    // `ignore` rather than `pipe`: this harness refuses piped stdio in some confined
    // Windows modes, and the game's console output is not needed anyway.
    stdio: 'ignore',
  });
  child.unref();
  return { pid: child.pid ?? null, args: executableArgs };
}

/**
 * run_stellaris_debug_session
 *
 * The full test loop: launch, poll `logs/error.log` until it has not changed for
 * `settle_ms` (default 20 s), then `Stop-Process -Force` and report what the log said.
 * `keep_running: true` (alias `awaiting_visual_check`) suppresses the kill so a human
 * can look at the screen.
 */
export async function runStellarisDebugSession(args = {}) {
  const gameRoot = resolveLaunchGameRoot(args);
  const documentsRoot = resolveDocumentsRoot(args);
  const workspaceModPath = args.workspace_mod_path ? requirePath(args.workspace_mod_path, 'workspace_mod_path') : null;
  const state = workspaceModPath
    ? inspectDebugState({ gameRoot, documentsRoot, workspaceModPath, args })
    : { workspace_mod_name: null, mount_warnings: [], enabled_mods: [], required_mods: [] };

  const settleMs = clampNumber(args.settle_ms, DEFAULT_SETTLE_MS, 1_000, 600_000);
  const pollMs = clampNumber(args.poll_ms, DEFAULT_POLL_MS, 50, 60_000);
  const maxWaitMs = clampNumber(args.max_wait_ms, DEFAULT_MAX_WAIT_MS, 5_000, 3_600_000);
  const graceMs = clampNumber(args.grace_ms, DEFAULT_GRACE_MS, 0, 60_000);
  const keepRunning = isTrue(args.keep_running) || isTrue(args.awaiting_visual_check);
  const skipLaunch = isTrue(args.skip_launch) || isTrue(args.run_started);
  const logPath = join(documentsRoot, 'logs', 'error.log');
  const executable = join(gameRoot, 'stellaris.exe');

  const startedAt = Date.now();
  let launch = { pid: null, args: null, skipped: true };
  let stoppedExisting = [];
  let attachment = null;
  if (!skipLaunch) {
    const existing = await listGameProcessIds();
    if (existing.length > 0) {
      stoppedExisting = existing;
      await runPowerShell(buildProcessStopCommand());
      await sleep(pollMs);
      attachment = 'stopped a stale stellaris process before launching';
    } else {
      attachment = 'no stellaris process was reported running before the launch';
    }
    let launched;
    try {
      launched = launchGameProcess(executable, gameRoot, args);
    } catch (thrown) {
      throw new WorkspaceError(
        `could not start \`${executable}\`: ${thrown instanceof Error ? thrown.message : String(thrown)}. ` +
          'Start it yourself and call this tool with `run_started: true` to attach to the running game.',
      );
    }
    launch = { ...launched, skipped: false };
  }

  const hints = workspaceModPath ? [workspaceModPath] : [];

  let history = [snapshotLogFile(logPath)];
  let lastChangeAt = startedAt;
  let settled = false;
  let settleReason = 'not_enough_samples';
  let quietForMs = 0;
  let stopPolling = false;
  let completionReason = 'waiting_for_log_to_settle';
  const pollStartedAt = Date.now();

  while (!stopPolling) {
    await sleep(pollMs);
    const extended = extendLogHistory(history, snapshotLogFile(logPath), settleMs, lastChangeAt);
    history = extended.history;
    lastChangeAt = extended.last_change_at;
    const verdict = isLogSettled(history, settleMs, Date.now(), lastChangeAt);
    settled = verdict.settled;
    settleReason = verdict.reason;
    quietForMs = verdict.quiet_for_ms;
    const completion = decideRunCompletion({
      settled,
      keepRunning,
      elapsedMs: Date.now() - pollStartedAt,
      maxWaitMs,
    });
    stopPolling = completion.stop_polling;
    completionReason = completion.reason;
  }

  if (settled && graceMs > 0) await sleep(graceMs);

  const cleanup = decideProcessCleanup({ keepRunning, runCreatedProcess: !skipLaunch, logSettled: settled });
  let processQueryAfter = [];
  if (cleanup.stop) {
    const stopResult = await runPowerShell(buildProcessStopCommand());
    cleanup.stop_result = interpretStopResult(stopResult);
    processQueryAfter = await listGameProcessIds();
    cleanup.still_running_ids = processQueryAfter;
    cleanup.reason = processQueryAfter.length === 0 ? 'log_settled_process_stopped' : 'log_settled_stop_not_confirmed';
  }

  const errorLines = extractErrorLines(logPath, { hints });
  const summary = summariseDebugRun({
    startedAt,
    now: Date.now(),
    logPath,
    settled,
    history,
    errorLines,
    cleanup,
  });

  return {
    ...summary,
    game_root: gameRoot,
    documents_root: documentsRoot,
    workspace_mod_path: workspaceModPath,
    workspace_mod_name: state.workspace_mod_name ?? null,
    command_line: `Start-Process -FilePath '${executable}' -ArgumentList '-debug_mode' -WorkingDirectory '${gameRoot}'`,
    launched: !skipLaunch,
    launched_pid: launch.pid,
    launch_arguments: launch.args,
    launch_note: attachment,
    terminated_before_launch: stoppedExisting,
    settle_ms: settleMs,
    poll_ms: pollMs,
    max_wait_ms: maxWaitMs,
    grace_ms: graceMs,
    settle_reason: settleReason,
    quiet_for_ms: quietForMs,
    completion_reason: completionReason,
    keep_running: keepRunning,
    still_running_ids: processQueryAfter,
    log_history: history.map((sample) => ({ at_ms: sample.at, size: sample.size, mtime: sample.mtime })),
    mount_warnings: state.mount_warnings ?? [],
    log_freshness_hint: errorLines.available
      ? 'error.log lines are filtered by the same markers classify_error_log uses; call classify_error_log for category counts.'
      : 'error.log does not exist yet, so this run produced no parseable log. The game may not have reached the main menu.',
    messages: [
      `Test-run rule: the run counts as finished as soon as \`error.log\` has not changed for ${settleMs} ms.`,
      cleanup.message,
      keepRunning
        ? 'The process was left running on purpose. Stop it yourself with: Stop-Process -Name stellaris -Force'
        : 'Nothing is left burning CPU. Re-run without `keep_running` for another automated pass.',
      'Read `mod_errors` first: those lines name your mod (or its enabled mod files) and are the only ones a test run proves about your edit.',
    ],
  };
}

/**
 * wait_for_stellaris_log_settle
 *
 * The polling half of `run_stellaris_debug_session`, split out for the case where the
 * game is already running: wait for the log to go quiet, optionally kill it, never
 * launch anything. `keep_running: true` leaves the process alone.
 */
export async function waitForStellarisLogSettle(args = {}) {
  const documentsRoot = resolveDocumentsRoot(args);
  const settleMs = clampNumber(args.settle_ms, DEFAULT_SETTLE_MS, 1_000, 600_000);
  const pollMs = clampNumber(args.poll_ms, DEFAULT_POLL_MS, 50, 60_000);
  const maxWaitMs = clampNumber(args.max_wait_ms, DEFAULT_MAX_WAIT_MS, 5_000, 3_600_000);
  const keepRunning = isTrue(args.keep_running) || isTrue(args.awaiting_visual_check);
  const logPath = join(documentsRoot, 'logs', 'error.log');
  const startedAt = Date.now();

  let history = [snapshotLogFile(logPath)];
  let lastChangeAt = startedAt;
  let settled = false;
  let settleReason = 'not_enough_samples';
  let quietForMs = 0;
  let stopPolling = false;
  let completionReason = 'waiting_for_log_to_settle';

  while (!stopPolling) {
    await sleep(pollMs);
    const extended = extendLogHistory(history, snapshotLogFile(logPath), settleMs, lastChangeAt);
    history = extended.history;
    lastChangeAt = extended.last_change_at;
    const verdict = isLogSettled(history, settleMs, Date.now(), lastChangeAt);
    settled = verdict.settled;
    settleReason = verdict.reason;
    quietForMs = verdict.quiet_for_ms;
    const completion = decideRunCompletion({
      settled,
      keepRunning,
      elapsedMs: Date.now() - startedAt,
      maxWaitMs,
    });
    stopPolling = completion.stop_polling;
    completionReason = completion.reason;
  }

  const cleanup = decideProcessCleanup({ keepRunning, runCreatedProcess: false, logSettled: settled });
  cleanup.stop = false;
  cleanup.left_running = true;
  const running = await listGameProcessIds();

  return {
    ...summariseDebugRun({ startedAt, now: Date.now(), logPath, settled, history, errorLines: null, cleanup }),
    documents_root: documentsRoot,
    settle_ms: settleMs,
    poll_ms: pollMs,
    settle_reason: settleReason,
    quiet_for_ms: quietForMs,
    completion_reason: completionReason,
    keep_running: keepRunning,
    running_ids: running,
    log_history: history.map((sample) => ({ at_ms: sample.at, size: sample.size, mtime: sample.mtime })),
    messages: [
      'This tool never launches or kills anything: it only watches the log of a game you already started.',
      keepRunning
        ? 'keep_running is set, so the process was not touched.'
        : 'No process was killed. If you want the kill, use `run_stellaris_debug_session`, which owns the process it started.',
    ],
  };
}

/** Ask PowerShell for live `stellaris` process ids. */
async function listGameProcessIds() {
  const result = await runPowerShellCaptured(buildProcessQueryCommand());
  return parseProcessIds(result.stdout ?? '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
