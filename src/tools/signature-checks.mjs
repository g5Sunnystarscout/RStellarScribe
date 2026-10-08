//------------------------------------------------------------------------------------
// signature-checks.mjs -- Part of RStellarisScribe
//
// Validates a mod's script against the game's own script documentation (effects.log /
// triggers.log / modifiers.log / scopes.log). This exists because every hard bug in the
// live tests was a *name or scope* mistake that the engine either logged far away from the
// cause or did not log at all:
//
//   * `every_ship`          - not an iterator at all (the real one is `every_owned_ship`)
//   * `has_technology`      - a country trigger, evaluated where the starbase was the scope
//   * `create_army`         - documented for planet/ship/colony, used from a fleet
//   * `modifier = { }`      - not a field of starbase buildings
//   * `<ns>_event = { }`    - not an event type; corrupts the whole event table
//   * `option = { effect = { } }` - no `effect` key exists inside an option
//   * `value = 100`         - `*_compare` triggers take the operator in the key (`value >= 100`)
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

import {
  CONTEXT_SCOPES,
  EFFECT_CONTEXT_KEYS,
  EVENT_ROOT_SCOPES,
  EFFECT_CONTROL_KEYS,
  SCOPE_SWITCHES,
  TRIGGER_CONTEXT_KEYS,
  loadGameSignatures,
} from '../lib/game-signatures.mjs';
import {
  optionalString,
  requireString,
  ToolError,
} from '../lib/generation.mjs';
import {
  STATIC_MODIFIER_PLUMBING,
  SCRIPT_VALUE_OPERATIONS,
  flattenScript,
  looksLikeScriptName,
  nearestModifierKeys,
  staticModifierAssignments,
} from '../lib/modifier-keys.mjs';
import { findTopLevelDefinitions, tokenize } from '../lib/paradox.mjs';
import { entityKindForPath, openWorkspace, readWorkspaceFile } from '../lib/workspace.mjs';

/**
 * Keys that are not script calls and must never be reported as unknown effects/triggers:
 * scope keywords (from / owner / root / this / prev...), logic operators, and the
 * parameter names that appear at statement level inside effect and trigger blocks.
 */
const SCRIPT_KEYWORDS = new Set([
  ...Object.keys(SCOPE_SWITCHES),
  'root',
  'this',
  'prev',
  'prevprev',
  'prevprevprev',
  'from',
  'fromfrom',
  'fromfromfrom',
  'save_event_target_as',
  'clear_saved_event_target',
  'event_target',
  'no_scope',
  'AND',
  'OR',
  'NOT',
  'NOR',
  'NAND',
  'value',
  'text',
  'mult',
  'scale',
  'base',
  'factor',
  'weight',
  'modifier',
  'desc',
  'description',
  'fail_text',
  'success_text',
  'years',
  'months',
  'days',
]);

/**
 * Statement-level scope-target references, written `<prefix>:<name>`:
 *
 *     event_target:geocentric_home_system = { move_system = { ... } }
 *
 * This is a *reference*, not a call: it names something saved earlier with
 * `save_event_target_as` / `save_global_event_target_as`, a value handed to the event
 * (`parameter:`), or a reference that is only meaningful inside a presentation block
 * (`hidden:`). Because it is neither an effect nor a trigger, looking it up in effects.log /
 * triggers.log can only ever produce a false positive - vanilla itself opens blocks this way
 * constantly (`common/scripted_effects/01_start_of_game_effects.txt:4814`,
 * `events/astral_rifts_1_events.txt:393`), and the engine's own documentation uses the form
 * (`effects.log`: `event_target:new_country = { set_player = event_target:old_country }`).
 *
 * A full scan of the installed 4.4.6 `common/` + `events/` .txt files finds exactly three
 * prefixes in this shape - `event_target:` (5430 uses), `parameter:` (272) and `hidden:` (113) -
 * and no other one, so the form is matched generically instead of by prefix. That also covers
 * `saved_event_target:`-style saved-scope references and the `<scope>:<name>` spelling.
 *
 * The name part may contain dots (`event_target:foo.solar_system`), because the engine resolves
 * it as a target path.
 */
const SCOPE_TARGET_STATEMENT = /^[A-Za-z_][A-Za-z0-9_]*:[A-Za-z0-9_.]+$/;

/**
 * Event type keywords, verified against 4.4.6's events/*.txt.
 *
 * The bare `event` type matters: it is what vanilla uses for game-start system spawning
 * (events/game_start.txt:1932 game_start.31, events/distant_stars_events_2.txt:16 distar.290),
 * and a hidden event of that type needs neither a title nor a description.
 */
const EVENT_TYPES = new Set([
  'event',
  'agreement_event',
  'astral_rift_event',
  'bypass_event',
  'country_event',
  'espionage_operation_event',
  'first_contact_event',
  'fleet_event',
  'leader_event',
  'observer_event',
  'planet_event',
  'pop_faction_event',
  'pop_group_event',
  'ship_event',
  'situation_event',
  'starbase_event',
  'system_event',
]);

/** Collect scripted effect/trigger names defined in a directory tree of .txt files. */
function collectScriptedNames(workspace, prefixes) {
  const names = new Set();
  for (const file of workspace.files) {
    if (!prefixes.some((prefix) => file.path.startsWith(prefix))) continue;
    if (!file.path.endsWith('.txt')) continue;
    let text;
    try {
      text = readFileSync(file.absolute, 'utf8');
    } catch {
      continue;
    }
    for (const definition of findTopLevelDefinitions(text)) names.add(definition.key);
  }
  return names;
}

/**
 * Walk a token stream, tracking a coarse scope and whether we are inside an effect, a trigger
 * or a plain data block. Only names used at statement level of an effect/trigger context are
 * checked, so database field assignments never produce noise.
 *
 * Scope handling, in order of precedence:
 *   - a fixed scope for the block kind (CONTEXT_SCOPES / SCOPE_SWITCHES when already in script)
 *   - the event's root scope for the event block itself (EVENT_ROOT_SCOPES)
 *   - the scope inferred from `is_scope_type = <scope>` earlier in the same definition, which is
 *     what makes it possible to judge a button effect's `effect = { }` block at all
 *   - nothing at all for a `<prefix>:<name>` scope target (`event_target:foo = { }`), whose
 *     scope is unknowable from the name, so it and its descendants stay unchecked
 * Anything still unknown stays unknown and is never reported, so the checker stays quiet
 * rather than producing noise.
 */
function walkScript(tokens, options) {
  const { findings, file, signatures, customNames, initialKind = 'data' } = options;
  const stack = [{ kind: initialKind, scope: 'unknown' }];
  const definition = { scope: 'unknown' };

  const current = () => stack[stack.length - 1];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'brace' && token.value === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // `key = value` or `key = { ... }`
    if (token.type === 'word' || token.type === 'string') {
      const next = tokens[index + 1];
      if (!next || next.type !== 'operator' || next.value !== '=') continue;
      const key = token.value;
      const valueToken = tokens[index + 2];
      const block = valueToken && valueToken.type === 'brace' && valueToken.value === '{';

      const parent = current();
      const atTopLevel = stack.length === 1;

      // A definition's scope hint applies to its sibling effect/allow blocks.
      if (key === 'is_scope_type' && !block && valueToken && valueToken.type === 'word') {
        definition.scope = valueToken.value;
      }

      // Inside an option, `effect = { }` is the classic event trap.
      if (key === 'effect' && parent.option) {
        findings.push({
          severity: 'error',
          code: 'event-option-effect-wrapper',
          file,
          line: token.line,
          message:
            '\`option = { effect = { ... } }\` is invalid: an option has no \`effect\` key (the engine tries to resolve a scripted effect called \`effect\` and reports "Corrupt Event Table Entry"). Write the effects inline, or use \`hidden_effect = { ... }\`.',
        });
      }

      // `*_compare` triggers take the comparison operator as part of the key.
      if (key.endsWith('_compare') && block) {
        let depth = 0;
        for (let scan = index + 2; scan < tokens.length; scan += 1) {
          const inner = tokens[scan];
          if (inner.type === 'brace') {
            depth += inner.value === '{' ? 1 : -1;
            if (depth === 0) break;
            continue;
          }
          if (inner.type === 'word' && inner.value === 'value') {
            const operator = tokens[scan + 1];
            if (operator && operator.type === 'operator' && operator.value === '=') {
              findings.push({
                severity: 'error',
                code: 'missing-comparison-operator',
                file,
                line: inner.line,
                message: `\`${key}\` needs the comparison operator inside the key name: \`value = N\` reads as equality, so a country with a larger stockpile fails the check. Use \`value >= N\` or \`value > N\` (vanilla: \`value > 2000\`).`,
              });
            }
          }
        }
      }

      // Statement-level script names inside an effect or trigger context. The definition name
      // itself sits at top level and is not a call, and a `<prefix>:<name>` scope target is a
      // reference rather than a call - see SCOPE_TARGET_STATEMENT.
      const scopeTarget = SCOPE_TARGET_STATEMENT.test(key);
      if (!atTopLevel && (parent.kind === 'effect' || parent.kind === 'trigger')) {
        const entry = scopeTarget ? null : signatures.lookup(key);
        if (!entry) {
          if (
            !scopeTarget &&
            !customNames.has(key) &&
            !EFFECT_CONTROL_KEYS.has(key) &&
            !TRIGGER_CONTEXT_KEYS.has(key) &&
            !SCRIPT_KEYWORDS.has(key)
          ) {
            findings.push({
              severity: parent.kind === 'effect' ? 'error' : 'warning',
              code: 'unknown-script-name',
              file,
              line: token.line,
              message: `\`${key}\` is not a documented ${parent.kind === 'effect' ? 'effect' : 'trigger'} in this install, and is not a scripted effect/trigger defined here or in the base game${key === 'every_ship' ? ' (the ship iterator is \`every_owned_ship\`; \`every_ship\` does not exist)' : ''}.`,
            });
          }
        } else {
          // A scope target's body is opaque: `parent.opaque` means the scope cannot be known
          // here, so the definition's `is_scope_type` hint must not be applied either.
          const scope = parent.opaque
            ? 'unknown'
            : parent.scope !== 'unknown'
              ? parent.scope
              : definition.scope;
          if (
            scope !== 'unknown' &&
            entry.scopes.length > 0 &&
            !entry.scopes.includes('all') &&
            !entry.scopes.includes(scope)
          ) {
            findings.push({
              severity: 'error',
              code: 'wrong-scope',
              file,
              line: token.line,
              message: `\`${key}\` is a ${entry.kind} for scope ${entry.scopes.join('/')}, but it is used where the scope is ${scope}.`,
            });
          }
        }
      }

      if (!block) {
        index += 2;
        continue;
      }

      // A new top-level definition starts with a clean scope hint.
      if (atTopLevel) definition.scope = 'unknown';

      // Descend into the block, deciding what kind of context it opens.
      const child = { kind: 'data', scope: parent.scope, opaque: parent.opaque === true };
      if (TRIGGER_CONTEXT_KEYS.has(key)) child.kind = 'trigger';
      else if (EFFECT_CONTEXT_KEYS.has(key)) child.kind = 'effect';
      else if (key === 'option') {
        child.kind = 'data';
        child.option = true;
      }
      if (scopeTarget) {
        // `event_target:foo = { ... }` opens the target's scope, which cannot be read off its
        // name: a target saved as `foo` may be a country, a system or a fleet. So the scope
        // stays `unknown` and the block is marked opaque, which suppresses scope checking
        // inside rather than guessing it wrong - guessing the enclosing event's scope is what
        // produced a false `wrong-scope` for the `distance` trigger in
        // `event_target:... = { every_neighbor_system_euclidean = { ... } }`.
        //
        // The block is also left as a `data` context, so its *contents* are not name-checked.
        // That is not a regression (before this form was recognised the block was a `data`
        // context too - it was only the reference itself that got reported), and re-entering it
        // as effect/trigger script was measured on the installed 4.4.6 tree: it added 150
        // findings, every one of them a scope keyword or scope path this checker does not model
        // (`last_added_deposit`, `observation_outpost_owner`, `root.owner`, `from.starbase`,
        // `capital_scope.solar_system`, ...) and not one genuine typo. Silence beats noise here.
        child.scope = 'unknown';
        child.opaque = true;
      } else if (CONTEXT_SCOPES[key]) child.scope = CONTEXT_SCOPES[key];
      else if (EVENT_ROOT_SCOPES[key]) child.scope = EVENT_ROOT_SCOPES[key];
      else if (parent.kind !== 'data' && SCOPE_SWITCHES[key]) child.scope = SCOPE_SWITCHES[key];
      // A block that establishes a real scope (owner, capital_scope, an iterator...) ends the
      // opacity again, so scope checking resumes inside it.
      if (child.scope !== 'unknown') child.opaque = false;
      // The definition's `is_scope_type` hint is a fallback for blocks whose scope we know
      // nothing about; it must not be pushed onto a scope target or its descendants, whose
      // scope is genuinely unknowable (a button effect on a fleet may well open
      // `event_target:some_country`).
      if (!child.opaque && child.scope === 'unknown' && definition.scope !== 'unknown') {
        child.scope = definition.scope;
      }
      stack.push(child);
      continue;
    }
  }
}

export function validateStellarisScriptSignatures(args = {}) {
  const workspaceRoot = requireString(args.workspace_root ?? args.root, 'workspace_root');
  const signatures = loadGameSignatures({
    docsDir: optionalString(args.docs_dir),
    gameRoot: optionalString(args.game_root),
  });

  if (!signatures) {
    return {
      docs_found: false,
      checked_files: 0,
      findings: [],
      by_code: {},
      messages: [
        'The game\'s script documentation was not found. It is written to `logs/script_documentation/` in the user data folder the first time the game runs (effects.log, triggers.log, modifiers.log, scopes.log). Pass `docs_dir` to point at it directly.',
        'Without those logs this tool cannot tell a real effect from a typo, so nothing was checked.',
      ],
    };
  }

  const workspace = openWorkspace(workspaceRoot);
  const customNames = collectScriptedNames(workspace, [
    'common/scripted_effects/',
    'common/scripted_triggers/',
  ]);

  // Base-game scripted effects/triggers are callable too; index them when the game root is known.
  const gameRoot = optionalString(args.game_root);
  if (gameRoot) {
    try {
      const vanilla = openWorkspace(gameRoot);
      for (const name of collectScriptedNames(vanilla, [
        'common/scripted_effects/',
        'common/scripted_triggers/',
      ])) {
        customNames.add(name);
      }
    } catch {
      // A missing or unreadable game root just means fewer known names.
    }
  }

  const findings = [];
  let checkedFiles = 0;

  for (const file of workspace.files) {
    if (!file.path.endsWith('.txt')) continue;
    if (!file.path.startsWith('common/') && !file.path.startsWith('events/')) continue;
    let text;
    try {
      text = readWorkspaceFile(workspace, file.path).bytes.toString('utf8');
    } catch {
      continue;
    }
    checkedFiles += 1;
    const tokens = tokenize(text);

    // Event files: the top-level keyword must be a real event type.
    if (file.path.startsWith('events/')) {
      let depth = 0;
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type === 'brace') {
          depth += token.value === '{' ? 1 : -1;
          continue;
        }
        if (depth !== 0) continue;
        if (token.type !== 'word') continue;
        const next = tokens[index + 1];
        if (!next || next.value !== '=') continue;
        const open = tokens[index + 2];
        if (!open || open.value !== '{') continue;
        if (!EVENT_TYPES.has(token.value) && token.value !== 'namespace') {
          findings.push({
            severity: 'error',
            code: 'invalid-event-type',
            file: file.path,
            line: token.line,
            message: `\`${token.value} = { ... }\` is not an event type. A namespace is not a type: writing \`<namespace>_event\` makes the engine report "Corrupt Event Table Entry" once per token and register no event. Use one of: ${[...EVENT_TYPES].join(', ')}.`,
          });
        }
      }
    }

    // Scripted triggers/effects are trigger/effect script at their root, not data.
    const initialKind = file.path.startsWith('common/scripted_triggers/')
      ? 'trigger'
      : file.path.startsWith('common/scripted_effects/')
        ? 'effect'
        : 'data';
    walkScript(tokens, { findings, file: file.path, signatures, customNames, initialKind });
  }

  // ---------------------------------------------------------------- modifier keys (GAP-2, rule 1)
  //
  // A key in a `common/static_modifiers/` block that the engine does not define is a modifier that
  // silently does nothing: nothing is logged, nothing fails, the effect is simply absent. The
  // engine's own list is already loaded (`signatures.modifiers`, 48,555 keys in the verified 4.4.6
  // install), so every scalar assignment in such a file is checked against it.
  const modifierFindings = [];
  if (signatures.modifiers.size > 0) {
    for (const file of workspace.files) {
      if (!file.path.startsWith('common/static_modifiers/') || !file.path.endsWith('.txt')) continue;
      let text;
      try {
        text = readWorkspaceFile(workspace, file.path).bytes.toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (const assignment of staticModifierAssignments(text)) {
        if (signatures.modifiers.has(assignment.key)) continue;
        const suggestions = nearestModifierKeys(assignment.key, signatures.modifiers);
        modifierFindings.push({
          severity: 'warning',
          code: 'unknown-modifier-key',
          file: file.path,
          line: findLineOfKey(lines, assignment.key),
          key: assignment.key,
          message:
            `\`${assignment.key} = ${assignment.value}\` is not a modifier the engine defines (modifiers.log, ${signatures.stats.modifiers} keys). ` +
            'A key that does not exist is not an error the engine reports: the modifier silently does nothing. ' +
            (suggestions.length > 0
              ? `Nearest keys: ${suggestions.map((entry) => `\`${entry.key}\` (${entry.category ?? 'no category'})`).join(', ')}.`
              : 'No near match exists in the list.'),
        });
      }
    }
  }

  // ------------------------------------------------------------- script-value operands (GAP-2, rule 2)
  //
  // `add = <name>`, `value = <name>`, `mult = <name>` and the rest name a script value OR a
  // variable the script sets. `value = <script value>` as an OPERATION is the documented trap
  // ("unknown command 'value' ... always be 0"); a misspelled operand is the same silent-zero class
  // with no log at all. Only names that can plausibly BE a name are checked (not macros `$X$`, not
  // scope paths `owner.num_x`, not `value:`-qualified references), and the severity is a warning
  // because the set of legal names is genuinely open.
  const valueFindings = [];
  {
    const knownValues = new Set();
    const setVariables = new Set();
    for (const file of workspace.files) {
      if (!file.path.startsWith('common/') || !file.path.endsWith('.txt')) continue;
      let text;
      try {
        text = readWorkspaceFile(workspace, file.path).bytes.toString('utf8');
      } catch {
        continue;
      }
      if (file.path.startsWith('common/script_values/')) {
        for (const entry of flattenScript(text)) {
          if (entry.depth === 0 && entry.value === null) knownValues.add(entry.key);
        }
      }
      // Every name the script writes into a variable, so a script value that READS one is not
      // reported. `which = <name>` is the field of every variable operation.
      for (const match of text.matchAll(/\bwhich\s*=\s*"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) setVariables.add(match[1].toLowerCase());
      for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g)) setVariables.add(match[1].toLowerCase());
    }
    for (const file of workspace.files) {
      if (!file.path.startsWith('common/script_values/') || !file.path.endsWith('.txt')) continue;
      let text;
      try {
        text = readWorkspaceFile(workspace, file.path).bytes.toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (const entry of flattenScript(text)) {
        if (!SCRIPT_VALUE_OPERATIONS.has(entry.key) || entry.value === null) continue;
        if (!looksLikeScriptName(entry.value)) continue;
        const name = entry.value;
        if (knownValues.has(name) || setVariables.has(name)) continue;
        if (signatures.has(name)) continue;
        // `base`/`value` are the engine's own operation keywords, not names.
        if (SCRIPT_VALUE_OPERATIONS.has(name) || STATIC_MODIFIER_PLUMBING.has(name)) continue;
        valueFindings.push({
          severity: 'warning',
          code: 'unknown-script-value',
          file: file.path,
          line: findLineOfKey(lines, entry.key, entry.value),
          key: name,
          message:
            `\`${entry.key} = ${name}\` names no script value defined in this workspace and no variable the script sets, and it is not a ` +
            'documented effect or trigger. The engine evaluates an unknown name as 0 (and logs "unknown command" only for the ' +
            '`value = <name>` OPERATION form), so this is a silent zero. Spell a script value defined under `common/script_values/`, ' +
            'or read a variable with `add = <var> is_variable_set = <var>`.',
        });
      }
    }
  }
  findings.push(...modifierFindings, ...valueFindings);

  const byCode = {};
  for (const finding of findings) byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;

  const messages = [
    `Checked ${checkedFiles} script file(s) against ${signatures.stats.effects} documented effects and ${signatures.stats.triggers} documented triggers from ${signatures.docsDir}.`,
  ];
  if (findings.length === 0) {
    messages.push('No unknown script names, scope mismatches or known script traps were found.');
  } else {
    messages.push(
      `${findings.length} finding(s): ${Object.entries(byCode)
        .map(([code, count]) => `${code} x${count}`)
        .join(', ')}.`,
    );
  }

  return {
    docs_found: true,
    docs_dir: signatures.docsDir,
    checked_files: checkedFiles,
    signature_stats: signatures.stats,
    findings,
    by_code: byCode,
    error_count: findings.filter((finding) => finding.severity === 'error').length,
    messages,
  };
}

/** Entity kinds this checker is meaningful for; exported so tests can assert the wiring. */
export function supportsEntityKind(path) {
  return entityKindForPath(path) !== null;
}

/**
 * The 1-based line of an assignment in a file, for a finding that has to name file:line.
 *
 * The line is matched ANYWHERE in the text, not at the start: vanilla writes whole script values on
 * one line (`unga_nato_weight = { value = unga_nato_votes divide = unga_votes_total }`), so anchoring
 * at the start reports a null line for a real assignment. Measured on the mod's own
 * `zz_geocentric_unga_mech_values.txt:82`. `value`, when given, is required too, which is what
 * separates the several `add =` lines in one block. `seen` skips lines a previous finding claimed,
 * so two identical lines report two different lines. Returns null when the line cannot be found
 * rather than guessing - a wrong line number is worse than none.
 */
export function findLineOfKey(lines, key, value = null, seen = null) {
  const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wanted = new RegExp(`(?<![\\w@])${escape(key)}[ \\t]*=[ \\t]*${value === null ? '' : `${escape(value)}(?![\\w_])`}`);
  for (let index = 0; index < lines.length; index += 1) {
    if (seen?.has(index + 1)) continue;
    if (wanted.test(lines[index])) return index + 1;
  }
  return null;
}
