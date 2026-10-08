//------------------------------------------------------------------------------------
// generators-content.mjs -- Part of RStellarScribe
//
// The content generators added after a live test against Stellaris 4.4.6. Every field
// name and every localisation key here was read out of the installed game's own files
// or its shipped README/documentation stubs, and each generator records where:
//
//   species classes   common/species_classes/*.txt, portrait_sets, portrait_categories
//   name lists        common/name_lists/README_NAME_LISTS.txt
//   tradition trees   common/tradition_categories/99_README_TRADITION_CATEGORIES.txt,
//                     common/traditions/99_README_TRADITIONS.txt
//   prescripted       prescripted_countries/00_top_countries.txt
//   ship sizes        common/ship_sizes/27_extreme_frontiers.txt
//   event chains      common/event_chains/00_event_chains.txt  (note: its comment about
//                     the localisation keys is WRONG; verified keys are <key>_title/_desc)
//   situations        common/situations/99_README_SITUATIONS.txt,
//                     common/situations/13_extreme_frontiers_situations.txt
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import {
  asciiKey,
  ENCODING_UTF8_BOM,
  escapeScriptString,
  finishGeneration,
  generatedFile,
  optionalString,
  requireArray,
  requireString,
  ToolError,
} from '../lib/generation.mjs';
import { localisationPathFor } from '../lib/paths.mjs';
import { checkScriptStructure } from '../lib/paradox.mjs';
import {
  SCRIPT_HEADER,
  assertLanguage,
  block,
  blockBody,
  blockFromLines,
  localisationPlan,
  quoteList,
  requireDefinitionKey,
} from './generators.mjs';

// ------------------------------------------------------------------------------------
// small shared pieces
// ------------------------------------------------------------------------------------

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolError(`\`${field}\` is required and must be an object`);
  }
  return value;
}

/**
 * Keys that vanilla writes in either case. Species classes use upper case (`MAM`,
 * `ART`, `LITHOID`) as do name-list root keys (`MAM1`, `HUMAN1`), while most other
 * databases are lower case. Only the ASCII shape is enforced here.
 */
function requireAnyCaseKey(value, field) {
  const key = requireString(value, field);
  if (!/^[A-Za-z0-9_.]+$/.test(key)) {
    throw new ToolError(
      `\`${field}\` must be an ASCII key (letters, digits, underscore, dot); received \`${key}\``,
    );
  }
  return key;
}

function optionalArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalBoolean(value, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

/** `key = value` for a scalar, skipping undefined. */
function assignment(name, value, depth = 1) {
  if (value === undefined || value === null) return null;
  const indent = '\t'.repeat(depth);
  if (typeof value === 'boolean') return `${indent}${name} = ${value ? 'yes' : 'no'}`;
  if (typeof value === 'number') return `${indent}${name} = ${value}`;
  return `${indent}${name} = ${value}`;
}

/** A `{ "a" "b" }` list block on one line. */
function inlineListBlock(name, values, depth = 1, quoted = true) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const indent = '\t'.repeat(depth);
  const body = quoted ? quoteList(values) : values.join(' ');
  return `${indent}${name} = { ${body} }`;
}

/** A multi-line string list block, one entry per line, as vanilla writes name pools. */
function multiLineListBlock(name, values, depth = 1, quoted = true) {
  const entries = optionalArray(values).filter((value) => String(value).trim() !== '');
  if (entries.length === 0) return null;
  const indent = '\t'.repeat(depth);
  const body = entries
    .map((value) => `${indent}\t${quoted ? `"${escapeScriptString(value)}"` : value}`)
    .join('\n');
  return `${indent}${name} = {\n${body}\n${indent}}`;
}

/** `my_counter_key` -> `My Counter Key`, for a default player-facing label. */
function humaniseKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function joinLines(lines) {
  return lines.filter((line) => line !== null && line !== undefined && line !== '').join('\n');
}

// ------------------------------------------------------------------------------------
// generate_species_class_batch
// ------------------------------------------------------------------------------------

export function generateSpeciesClassBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const classes = requireArray(args.classes, 'classes');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const classBlocks = [];
  const traitBlocks = [];
  const setIdOf = new Map();
  const localisationEntries = [];

  for (const [index, entry] of classes.entries()) {
    const spec = requireObject(entry, `classes[${index}]`);
    const key = requireAnyCaseKey(spec.key ?? spec.id, `classes[${index}].key`);
    const title = requireString(spec.title, `classes[${index}].title`);
    const archetype = optionalString(spec.archetype) ?? 'BIOLOGICAL';

    // A class may either point at an existing trait or declare one inline.
    let grantedTrait = optionalString(spec.trait_key);
    if (!grantedTrait) {
      const trait = requireObject(spec.trait ?? {}, `classes[${index}].trait`);
      grantedTrait = requireDefinitionKey(
        trait.key ?? `trait_${key.toLowerCase()}`,
        `classes[${index}].trait.key`,
      );
      traitBlocks.push(
        joinLines([
          `${grantedTrait} = {`,
          '\tcost = 0',
          '',
          '\tsorting_priority = 20',
          '',
          '\tinitial = yes',
          '\trandomized = no',
          '\tspecies_potential_add = {',
          '\t\talways = no',
          '\t}',
          '\tspecies_possible_remove = {',
          '\t\talways = no',
          '\t}',
          '\tspecies_possible_merge_add = {',
          '\t\talways = no',
          '\t}',
          '\timmortal_leaders = no',
          '',
          `\tallowed_archetypes = { ${optionalArray(trait.allowed_archetypes).length > 0 ? trait.allowed_archetypes.join(' ') : archetype} }`,
          `\ttags = { ${optionalArray(trait.tags).length > 0 ? trait.tags.join(' ') : 'organic positive special'} }`,
          '\tai_weight = {',
          '\t\tweight = 0',
          '\t}',
          '',
          `\ticon = "${escapeScriptString(optionalString(trait.icon) ?? 'gfx/interface/icons/traits/trait_lithoid.dds')}"`,
          '',
          block('modifier', trait.modifier, 1),
          '}',
        ]),
      );
      if (withLocalisation) {
        localisationEntries.push({ key: grantedTrait, value: optionalString(trait.title) ?? title });
        localisationEntries.push({
          key: `${grantedTrait}_desc`,
          value: requireString(trait.description ?? trait.desc, `classes[${index}].trait.description`),
        });
      }
    }

    const randomWeightBlock = joinLines([
      '\trandom_weight = {',
      `\t\tbase = ${Number(spec.random_weight ?? 0)}`,
      '\t}',
    ]);

    classBlocks.push(
      joinLines([
        `${key} = {`,
        `\tarchetype = ${archetype}`,
        '',
        spec.possible
          ? block('possible', spec.possible, 1)
          : joinLines([
              '\tpossible = {',
              '\t\tauthority = {',
              '\t\t\tNOT = {',
              '\t\t\t\tvalue = auth_machine_intelligence',
              '\t\t\t\ttext = SPECIES_CLASS_MUST_NOT_USE_MACHINE_INTELLIGENCE',
              '\t\t\t}',
              '\t\t}',
              '\t}',
            ]),
        '',
        `\ttrait = "${grantedTrait}"`,
        '',
        `\tgraphical_culture = ${optionalString(spec.graphical_culture) ?? 'arthropoid_01'}`,
        // `randomized` (default yes in the game) decides whether the engine generates random
        // species of this class, such as pre-FTL civilisations. Those need a name list whose
        // `category` equals this class ENGLISH display name; without one the engine logs
        // "Failed to get a random class namelist in create_species effect" every time.
        `\trandomized = ${spec.randomized === undefined ? 'no' : spec.randomized}`,
        `\tmove_pop_sound_effect = "${escapeScriptString(optionalString(spec.move_pop_sound_effect) ?? 'moving_pop_confirmation')}"`,
        '',
        randomWeightBlock,
        '',
        '\tresources = {}',
        '}',
      ]),
    );

    // Portrait wiring. In the installed game a species class gets its portraits from
    // common/portrait_sets/, and the empire-creator tab comes from portrait_categories.
    const setName = `${key}_portraits`;
    setIdOf.set(key, setName);
    const portraits = optionalArray(spec.portraits);
    if (portraits.length === 0) {
      throw new ToolError(
        `classes[${index}].portraits is empty. A species class with no portrait set is not selectable in the empire creator.`,
      );
    }
    const conditional = spec.conditional_portraits;
    const setLines = [`${setName} = {`, `\tspecies_class = ${key}`, ''];
    setLines.push(multiLineListBlock('portraits', portraits, 1));
    if (conditional && (conditional.trigger || optionalArray(conditional.portraits).length > 0)) {
      setLines.push(
        '',
        '\tconditional_portraits = {',
        blockBody('randomizable', conditional.trigger ?? 'always = yes', 2)
          ? `\t\trandomizable = {\n${blockBody('randomizable', conditional.trigger ?? 'always = yes', 3)}\n\t\t}`
          : '\t\trandomizable = { always = yes }',
        blockBody('playable', conditional.trigger ?? 'always = yes', 2)
          ? `\t\tplayable = {\n${blockBody('playable', conditional.trigger ?? 'always = yes', 3)}\n\t\t}`
          : '\t\tplayable = { always = yes }',
        multiLineListBlock('portraits', optionalArray(conditional.portraits), 2),
        '\t}',
      );
    }
    setLines.push('}');

    if (withLocalisation) {
      // Species-class display names are looked up by the class key, and vanilla defines
      // both the key and a `_plural` variant in name_lists_l_<lang>.yml.
      localisationEntries.push({ key, value: title });
      localisationEntries.push({ key: `${key}_plural`, value: optionalString(spec.title_plural) ?? title });
    }

    classBlocks.push('');
    classBlocks.push(setLines.join('\n'));
  }

  const categoryKey = `${prefix}_species_categories`;
  const categoryLines = [`${categoryKey} = {`];
  for (const [classKey, setName] of setIdOf.entries()) {
    categoryLines.push(`\t${classKey}_category = {`);
    categoryLines.push(`\t\tname = ${classKey}`);
    categoryLines.push('\t\tsets = {');
    categoryLines.push(`\t\t\t${setName}`);
    categoryLines.push('\t\t}');
    categoryLines.push('\t}');
  }
  categoryLines.push('}');

  const files = [
    generatedFile(
      `common/species_classes/${prefix}_species_classes.txt`,
      `${SCRIPT_HEADER(`common/species_classes/${prefix}_species_classes.txt`, 'common/species_classes/')}${classBlocks.join('\n')}\n`,
      { summary: `${classes.length} species class(es)` },
    ),
    generatedFile(
      `common/portrait_sets/${prefix}_portrait_sets.txt`,
      `${SCRIPT_HEADER(`common/portrait_sets/${prefix}_portrait_sets.txt`, 'common/portrait_sets/')}${[...setIdOf.values()]
        .map((setName) => classBlocks.find((blockText) => blockText.startsWith(`${setName} = {`)))
        .filter(Boolean)
        .join('\n\n')}\n`,
      { summary: 'Portrait sets for the new species classes' },
    ),
    generatedFile(
      `common/portrait_categories/${prefix}_portrait_categories.txt`,
      `${SCRIPT_HEADER(`common/portrait_categories/${prefix}_portrait_categories.txt`, 'common/portrait_categories/')}${categoryLines.join('\n')}\n`,
      { summary: 'Empire-creator category for the new species classes' },
    ),
  ];
  if (traitBlocks.length > 0) {
    files.push(
      generatedFile(
        `common/traits/${prefix}_traits.txt`,
        `${SCRIPT_HEADER(`common/traits/${prefix}_traits.txt`, 'common/traits/000_documentation_species_traits.txt')}${traitBlocks.join('\n\n')}\n`,
        { summary: `${traitBlocks.length} class-granted trait(s)` },
      ),
    );
  }
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_species`, language),
        entries: localisationEntries,
        summary: 'Species class names, plurals and granted traits',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'A new species class needs all three of common/species_classes/, common/portrait_sets/ and common/portrait_categories/ to be selectable, and its display name is looked up by the class key (plus a `_plural`). `random_weight` takes a block: `random_weight = { base = N }`.',
  );
  result.messages.push(
    'Duplicate keys in common/species_classes/ are overridden silently - no error.log entry - so a broken class is invisible. Verify a new class in the empire creator.',
  );
  result.messages.push(
    'PAIRING RULE: the engine links a species class to its random name list ONLY by string - the name list category must equal the class ENGLISH display name (MAM1 has category = "Mammalian" and the localisation has MAM:0 "Mammalian"). Nothing in script references the other side. `randomized` is written as `no` here by default; leave it that way unless you also provide a name list whose category matches, or the engine logs `Failed to get a random class namelist in create_species effect` for every random species of the class.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_name_list_batch
// ------------------------------------------------------------------------------------

export function generateNameListBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const lists = requireArray(args.lists, 'lists');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of lists.entries()) {
    const spec = requireObject(entry, `lists[${index}]`);
    const key = requireAnyCaseKey(spec.key ?? spec.id, `lists[${index}].key`);
    const title = requireString(spec.title, `lists[${index}].title`);

    // Name pools hold LOCALISATION KEYS, not literal text. Vanilla MAM1.txt lists
    // `MAM1_SHIP_TTanak` and the text lives in
    // localisation/<lang>/name_list_MAM1_l_<lang>.yml. So a literal name given here is
    // converted into a stable key plus its localisation entry, and pools are written
    // unquoted exactly as vanilla writes them.
    const counters = new Map();
    const pool = (tag, values) => {
      const keys = [];
      for (const value of optionalArray(values)) {
        const nameText = String(value ?? '').trim();
        if (nameText === '') continue;
        const next = (counters.get(tag) ?? 0) + 1;
        counters.set(tag, next);
        const locKey = `${key}_${tag}_${String(next).padStart(2, '0')}`;
        keys.push(locKey);
        if (withLocalisation) localisationEntries.push({ key: locKey, value: nameText });
      }
      return keys;
    };
    const poolBlock = (name, tag, values, depth) =>
      multiLineListBlock(name, pool(tag, values), depth, false);
    const sequential = (node, tag) => {
      if (node?.sequential_name) return node.sequential_name;
      if (!node?.sequential_name_text) return null;
      const locKey = `${key}_${tag}_SEQ`;
      if (withLocalisation) localisationEntries.push({ key: locKey, value: String(node.sequential_name_text) });
      return locKey;
    };

    const lines = [`${key} = {`];
    if (spec.selectable !== undefined) {
      lines.push(
        optionalBoolean(spec.selectable)
          ? '\tselectable = { always = yes }'
          : '\tselectable = { always = no }',
      );
    }
    if (spec.randomized !== undefined) lines.push(assignment('randomized', optionalBoolean(spec.randomized, true), 1));
    if (spec.category) lines.push(`\tcategory = "${escapeScriptString(spec.category)}"`);
    if (spec.alias) lines.push(`\talias = "${escapeScriptString(spec.alias)}"`);
    if (spec.customize_random_override) {
      lines.push(`\tcustomize_random_override = ${spec.customize_random_override}`);
    }
    if (spec.should_name_home_system_planets !== undefined) {
      lines.push(assignment('should_name_home_system_planets', optionalBoolean(spec.should_name_home_system_planets, true), 1));
    }
    if (spec.trigger) lines.push(block('trigger', spec.trigger, 1));

    if (spec.ship_names) {
      const parts = [poolBlock('generic', 'SHIP', spec.ship_names.generic, 2)];
      for (const [size, names] of Object.entries(spec.ship_names)) {
        if (size === 'generic') continue;
        parts.push(poolBlock(size, `SHIP_${size.toUpperCase()}`, names, 2));
      }
      const body = parts.filter(Boolean).join('\n\n');
      if (body) lines.push(`\tship_names = {\n${body}\n\t}`);
    }
    if (spec.fleet_names) {
      const parts = [poolBlock('random_names', 'FLEET', spec.fleet_names.random_names, 2)];
      const seq = sequential(spec.fleet_names, 'FLEET');
      if (seq) parts.push(`\t\tsequential_name = ${seq}`);
      const body = parts.filter(Boolean).join('\n\n');
      if (body) lines.push(`\tfleet_names = {\n${body}\n\t}`);
    }
    if (spec.army_names) {
      const parts = [];
      const generic = spec.army_names.generic ?? {};
      const genericParts = [
        poolBlock('random_names', 'ARMY', generic.random_names, 3),
        sequential(generic, 'ARMY') ? `\t\t\tsequential_name = ${sequential(generic, 'ARMY')}` : null,
      ].filter(Boolean);
      if (genericParts.length > 0) parts.push(`\t\tgeneric = {\n${genericParts.join('\n\n')}\n\t\t}`);
      for (const [type, node] of Object.entries(spec.army_names)) {
        if (type === 'generic') continue;
        const typeParts = [
          poolBlock('random_names', `ARMY_${type.toUpperCase()}`, node.random_names, 3),
          sequential(node, `ARMY_${type.toUpperCase()}`)
            ? `\t\t\tsequential_name = ${sequential(node, `ARMY_${type.toUpperCase()}`)}`
            : null,
        ].filter(Boolean);
        if (typeParts.length > 0) parts.push(`\t\t${type} = {\n${typeParts.join('\n\n')}\n\t\t}`);
      }
      if (parts.length > 0) lines.push(`\tarmy_names = {\n${parts.join('\n\n')}\n\t}`);
    }
    if (spec.planet_names) {
      const parts = Object.entries(spec.planet_names)
        .map(([planetClass, names]) => {
          const blockText = poolBlock('names', `PLANET_${planetClass.toUpperCase()}`, names, 3);
          return blockText === null ? null : `\t\t${planetClass} = {\n${blockText}\n\t\t}`;
        })
        .filter(Boolean);
      if (parts.length > 0) lines.push(`\tplanet_names = {\n${parts.join('\n\n')}\n\t}`);
    }

    const cultures = optionalArray(spec.character_names);
    if (cultures.length > 0) {
      const cultureBlocks = cultures.map((culture) => {
        const cultureKey = optionalString(culture.culture ?? culture.key) ?? 'default';
        const tagFor = (poolName) => `CHR_${poolName.toUpperCase()}`;
        const parts = [
          poolBlock('full_names', tagFor('full_names'), culture.full_names, 3),
          poolBlock('full_names_female', tagFor('full_names_female'), culture.full_names_female, 3),
          poolBlock('full_names_male', tagFor('full_names_male'), culture.full_names_male, 3),
          poolBlock('first_names', tagFor('first_names'), culture.first_names, 3),
          poolBlock('first_names_female', tagFor('first_names_female'), culture.first_names_female, 3),
          poolBlock('first_names_male', tagFor('first_names_male'), culture.first_names_male, 3),
          poolBlock('second_names', tagFor('second_names'), culture.second_names, 3),
          poolBlock('second_names_female', tagFor('second_names_female'), culture.second_names_female, 3),
          poolBlock('second_names_male', tagFor('second_names_male'), culture.second_names_male, 3),
          culture.weight === undefined ? null : `\t\t\tweight = ${Number(culture.weight)}`,
        ].filter(Boolean);
        if (parts.length === 0) {
          throw new ToolError(
            `lists[${index}].character_names[${cultureKey}] has no name pools; a culture with no names generates nothing`,
          );
        }
        return `\t\t${cultureKey} = {\n${parts.join('\n\n')}\n\t\t}`;
      });
      lines.push(`\tcharacter_names = {\n${cultureBlocks.join('\n\n')}\n\t}`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      // Verified in 4.4.6: a name list's display name key is `name_list_<KEY>` with the
      // root key verbatim (MAM1 -> name_list_MAM1) and there is no `_plural` variant.
      // The similar-looking lowercased `mam1` is a *portrait* name and `MAM` is the
      // species class, so neither may be reused here.
      localisationEntries.push({ key: `name_list_${key}`, value: title });
      localisationEntries.push({
        key: `name_list_${key}_plural`,
        value: optionalString(spec.title_plural) ?? title,
      });
    }
  }

  const scriptPath = `common/name_lists/${prefix}_name_lists.txt`;
  const files = [
    generatedFile(
      scriptPath,
      `${SCRIPT_HEADER(scriptPath, 'common/name_lists/README_NAME_LISTS.txt')}${blocks.join('\n\n')}\n`,
      {
        // The engine asks for BOM here: "File 'common/name_lists/...' should be in
        // utf8-bom encoding (will try to use it anyways)". Vanilla name lists carry one.
        encoding: ENCODING_UTF8_BOM,
        summary: `${lists.length} name list(s)`,
      },
    ),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_name_lists`, language),
        entries: localisationEntries,
        summary: 'Name list display names and every generated name pool entry',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Name pools hold localisation keys, not literal text: at least one localisation file has to define every key the pool lists, or the game shows the raw key as a name. This generator converts the text you pass into stable keys and writes the matching entries.',
  );
  result.messages.push(
    'Display names are looked up by the lowercased root key (vanilla MAM1 resolves through the loc key mam1); both cases and a _plural are written.',
  )
  result.messages.push(
    'PAIRING RULE: `category` is how the engine ties this list to a species class, and the only way is an exact string match against the class ENGLISH display name (MAM1 has category = "Mammalian" and the localisation has MAM:0 "Mammalian"). Set it to that name rather than a label of your own if random species of the class should draw from these pools.',
  );;
  return result;
}

// ------------------------------------------------------------------------------------
// generate_prescripted_empire
// ------------------------------------------------------------------------------------

export function generatePrescriptedEmpire(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const empires = requireArray(args.empires, 'empires');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of empires.entries()) {
    const spec = requireObject(entry, `empires[${index}]`);
    const key = requireAnyCaseKey(spec.key ?? spec.id, `empires[${index}].key`);
    const name = requireString(spec.name, `empires[${index}].name`);
    const species = requireObject(spec.species, `empires[${index}].species`);

    const locPrefix = `${prefix}_${key}`;
    const designKey = `EMPIRE_DESIGN_${key}`;

    const speciesPortrait = requireString(species.portrait, `empires[${index}].species.portrait`);
    const speciesLines = [
      `\t\tclass = "${escapeScriptString(requireString(species.class, `empires[${index}].species.class`))}"`,
      `\t\tportrait = "${escapeScriptString(speciesPortrait)}"`,
    ];
    speciesLines.push(`\t\tname = ${locPrefix}_species_name`);
    speciesLines.push(`\t\tplural = ${locPrefix}_species_plural`);
    speciesLines.push(`\t\tadjective = ${locPrefix}_species_adjective`);
    if (species.name_list) speciesLines.push(`\t\tname_list = "${escapeScriptString(species.name_list)}"`);
    for (const trait of optionalArray(species.traits)) speciesLines.push(`\t\ttrait = "${escapeScriptString(trait)}"`);
    if (optionalArray(species.traits).length === 0) speciesLines.push('\t\ttrait = "trait_organic"');

    const lines = [
      `${key} = {`,
      `\tname = ${designKey}`,
      `\tadjective = ${locPrefix}_adjective`,
      `\tspawn_enabled = ${optionalString(spec.spawn_enabled) ?? 'no'}`,
      `\tignore_portrait_duplication = ${optionalBoolean(spec.ignore_portrait_duplication, true) ? 'yes' : 'no'}`,
      '',
      `\tship_prefix = ${locPrefix}_ship_prefix`,
      '',
      '\tspecies = {',
      speciesLines.join('\n'),
      '\t}',
      '',
      // `playable` defaults to yes, which is what makes a design selectable in the empire
      // designer. `playable = empire_design_never` (+ -- always = no) hides it completely,
      // and until this was fixed every generated empire was hidden.
      // Only write `playable` when there is something to say. Vanilla designs a player can
      // pick omit the field completely; writing `playable = yes` is a value the game never
      // uses, and `empire_design_never` (+ -- always = no) hides the design outright.
      spec.playable
        ? `\tplayable = ${spec.playable}`
        : spec.hidden
          ? '\tplayable = empire_design_never'
          : '',
      '',
    ];
    if (spec.room) lines.push(`\troom = "${escapeScriptString(spec.room)}"`, '');
    if (spec.authority) lines.push(`\tauthority = "${escapeScriptString(spec.authority)}"`);
    if (optionalArray(spec.civics).length > 0) lines.push(`\tcivics = { ${quoteList(spec.civics)} }`);
    if (spec.government) lines.push(`\tgovernment = ${spec.government}`);
    for (const ethic of optionalArray(spec.ethics)) lines.push(`\tethic = "${escapeScriptString(ethic)}"`);
    if (spec.origin) lines.push(`\torigin = "${escapeScriptString(spec.origin)}"`);
    if (spec.flag) lines.push(`\tflag = ${spec.flag}`);
    lines.push('');
    if (spec.planet_name) lines.push(`\tplanet_name = "${escapeScriptString(spec.planet_name)}"`);
    if (spec.planet_class) lines.push(`\tplanet_class = "${escapeScriptString(spec.planet_class)}"`);
    if (spec.initializer) lines.push(`\tinitializer = "${escapeScriptString(spec.initializer)}"`);
    if (spec.system_name) lines.push(`\tsystem_name = "${escapeScriptString(spec.system_name)}"`);
    lines.push('');
    lines.push(
      `\tgraphical_culture = "${escapeScriptString(optionalString(spec.graphical_culture) ?? 'arthropoid_01')}"`,
    );
    lines.push(
      `\tcity_graphical_culture = "${escapeScriptString(optionalString(spec.city_graphical_culture) ?? 'arthropoid_01')}"`,
    );

    const flag = spec.empire_flag;
    if (flag) {
      lines.push('');
      lines.push('\tempire_flag = {');
      lines.push('\t\ticon= {');
      lines.push(`\t\t\tcategory = "${escapeScriptString(flag.icon?.category ?? 'human')}"`);
      lines.push(`\t\t\tfile = "${escapeScriptString(flag.icon?.file ?? 'flag_human_9.dds')}"`);
      lines.push('\t\t}');
      lines.push('\t\tbackground= {');
      lines.push(`\t\t\tcategory = "${escapeScriptString(flag.background?.category ?? 'backgrounds')}"`);
      lines.push(`\t\t\tfile = "${escapeScriptString(flag.background?.file ?? '00_solid.dds')}"`);
      lines.push('\t\t}');
      lines.push('\t\tcolors={');
      for (const color of optionalArray(flag.colors).length > 0
        ? flag.colors
        : ['blue', 'black', 'null', 'null']) {
        lines.push(`\t\t\t"${escapeScriptString(color)}"`);
      }
      lines.push('\t\t}');
      lines.push('\t}');
    }

    const ruler = spec.ruler;
    if (ruler) {
      lines.push('');
      lines.push('\truler = {');
      lines.push(`\t\tname = ${locPrefix}_ruler_name`);
      if (ruler.gender) lines.push(`\t\tgender = ${ruler.gender}`);
      // Every player-selectable vanilla design sets this, using a species portrait name.
      lines.push(
        `\t\tportrait = "${escapeScriptString(optionalString(ruler.portrait) ?? speciesPortrait)}"`,
      );
      if (ruler.texture !== undefined) lines.push(`\t\ttexture = ${Number(ruler.texture)}`);
      if (ruler.attachment !== undefined) lines.push(`\t\tattachment = ${Number(ruler.attachment)}`);
      if (ruler.clothes !== undefined) lines.push(`\t\tclothes = ${Number(ruler.clothes)}`);
      for (const trait of optionalArray(ruler.traits).length > 0 ? ruler.traits : ruler.trait ? [ruler.trait] : []) {
        lines.push(`\t\ttrait = "${escapeScriptString(trait)}"`);
      }
      if (ruler.leader_class) lines.push(`\t\tleader_class = ${ruler.leader_class}`);
      lines.push('\t}');
    }

    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key: designKey, value: name });
      localisationEntries.push({
        key: `${locPrefix}_adjective`,
        value: optionalString(spec.adjective) ?? name,
      });
      localisationEntries.push({
        key: `${locPrefix}_ship_prefix`,
        value: optionalString(spec.ship_prefix) ?? 'VNC',
      });
      localisationEntries.push({
        key: `${locPrefix}_species_name`,
        value: requireString(species.name, `empires[${index}].species.name`),
      });
      localisationEntries.push({
        key: `${locPrefix}_species_plural`,
        value: optionalString(species.plural) ?? species.name,
      });
      localisationEntries.push({
        key: `${locPrefix}_species_adjective`,
        value: optionalString(species.adjective) ?? species.name,
      });
      if (ruler) {
        localisationEntries.push({
          key: `${locPrefix}_ruler_name`,
          value: optionalString(ruler.name) ?? name,
        });
      }
    }
  }

  const scriptPath = `prescripted_countries/${prefix}_prescripted_countries.txt`;
  const files = [
    generatedFile(
      scriptPath,
      `${SCRIPT_HEADER(scriptPath, 'prescripted_countries/00_top_countries.txt')}${blocks.join('\n\n')}\n`,
      { summary: `${empires.length} prescripted empire(s)` },
    ),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_prescripted`, language),
        entries: localisationEntries,
        summary: 'Prescripted empire names, adjectives and species text',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Prescripted empires live in `prescripted_countries/` at the mod root (not under `common/`). `spawn_enabled` controls whether galaxy generation may use the design as an AI empire; `playable` controls whether a player may pick it in the empire designer.',
  );
  result.messages.push(
    'VISIBILITY: `playable` defaults to yes here, so the design shows up in the empire designer. Passing `hidden: true` writes `playable = empire_design_never`, which is `always = no` in a scripted trigger and removes the design from the designer completely - that is how vanilla marks its retired stubs.',
  );
  result.messages.push(
    '`initializer` must name a real entry in `common/solar_system_initializers/`, and the flag category/file must exist under `flags/<category>/`.',
  );
  result.messages.push(
    'TRAP: a species class grants its trait automatically in game, but a prescripted design must ALSO list that trait in `species.traits`. Otherwise the engine logs "Design species was missing trait <key>".',
  );
  result.messages.push(
    'ENCODING: prescripted_countries files must NOT carry a UTF-8 BOM - vanilla has none, and a BOM makes the engine report `Unexpected token: =` at the END of the file. This is the opposite of common/name_lists/, which requires a BOM. This generator writes them without one.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_ship_size_batch
// ------------------------------------------------------------------------------------

export function generateShipSizeBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const ships = requireArray(args.ships, 'ships');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of ships.entries()) {
    const spec = requireObject(entry, `ships[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `ships[${index}].key`);
    const title = requireString(spec.title, `ships[${index}].title`);

    const sectionSlots = optionalArray(spec.section_slots).map((slot) => {
      const slotKey = requireString(slot.slot, `ships[${index}].section_slots[].slot`);
      const locator = requireString(slot.locator, `ships[${index}].section_slots[].locator`);
      return `\t\t"${escapeScriptString(slotKey)}" = { locator = "${escapeScriptString(locator)}" }`;
    });
    if (sectionSlots.length === 0) {
      throw new ToolError(
        `ships[${index}].section_slots is empty; a ship size with no section slot cannot be designed or built`,
      );
    }

    const lines = [
      `${key} = {`,
      `\tentity = "${escapeScriptString(optionalString(spec.entity) ?? 'ancient_corvette_entity')}"`,
      `\tmax_speed = ${Number(spec.max_speed ?? 160)}`,
      `\trotation_speed = ${Number(spec.rotation_speed ?? 0.15)}`,
      `\tacceleration = ${Number(spec.acceleration ?? 0.35)}`,
    ];
    if (spec.modifier) lines.push(block('modifier', spec.modifier, 1));
    lines.push(`\tmax_hitpoints = ${Number(spec.max_hitpoints ?? 300)}`);
    lines.push(`\tsize_multiplier = ${Number(spec.size_multiplier ?? 1)}`);
    lines.push(`\tmap_counter_icon = ${optionalString(spec.map_counter_icon) ?? 'ship_counter_4'}`);
    lines.push(`\ticon = ${optionalString(spec.icon) ?? 'ship_size_military_1'}`);
    lines.push(`\tfleet_slot_size = ${Number(spec.fleet_slot_size ?? 1)}`);
    lines.push('\tsection_slots = {');
    lines.push(sectionSlots.join('\n'));
    lines.push('\t}');
    lines.push(`\tnum_target_locators = ${Number(spec.num_target_locators ?? 0)}`);
    lines.push(`\tclass = ${optionalString(spec.class) ?? 'shipclass_military'}`);
    lines.push(`\tis_designable = ${optionalBoolean(spec.is_designable, true) ? 'yes' : 'no'}`);
    lines.push(`\tgraphical_culture = ${optionalString(spec.graphical_culture) ?? 'no'}`);
    lines.push(`\tcomponents_add_to_cost = ${optionalBoolean(spec.components_add_to_cost, false) ? 'yes' : 'no'}`);

    // --- how and where the hull is built ---------------------------------------------
    // `construction_type = starbase_shipyard` is what makes starbases with a shipyard build
    // it; `prerequisites` is the generic, non-hardcoded way to unlock a ship size on a tech.
    if (spec.construction_type) lines.push(`\tconstruction_type = ${spec.construction_type}`);
    if (spec.carries_colony) lines.push(`\tcarries_colony = ${spec.carries_colony}`);
    for (const set of optionalArray(spec.required_component_set)) {
      lines.push(`\trequired_component_set = "${escapeScriptString(set)}"`);
    }
    if (optionalArray(spec.scripted_action).length > 0) {
      lines.push(`\tscripted_action = { ${spec.scripted_action.map((name) => escapeScriptString(name)).join(' ')} }`);
    }
    if (spec.icon_frame !== undefined) lines.push(`\ticon_frame = ${Number(spec.icon_frame)}`);

    if (spec.upgrades_from) lines.push(`\tupgrades_from = ${spec.upgrades_from}`);
    if (spec.prerequisites) lines.push(inlineListBlock('prerequisites', spec.prerequisites, 1));
    if (spec.potential) lines.push(block('potential', spec.potential, 1));
    if (spec.resources) {
      const costLines = Object.entries(spec.resources.cost ?? {}).map(
        ([resource, amount]) => `\t\t\t${resource} = ${Number(amount)}`,
      );
      lines.push('\tresources = {');
      lines.push(`\t\tcategory = ${optionalString(spec.resources.category) ?? 'ships'}`);
      if (costLines.length > 0) lines.push('\t\tcost = {', ...costLines, '\t\t}');
      lines.push('\t}');
    }
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key, value: title });
      localisationEntries.push({ key: `${key}_plural`, value: optionalString(spec.title_plural) ?? title });
    }
  }

  const scriptPath = `common/ship_sizes/${prefix}_ship_sizes.txt`;
  const files = [
    generatedFile(
      scriptPath,
      `${SCRIPT_HEADER(scriptPath, 'common/ship_sizes/27_extreme_frontiers.txt')}${blocks.join('\n\n')}\n`,
      { summary: `${ships.length} ship size(s)` },
    ),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_ship_sizes`, language),
        entries: localisationEntries,
        summary: 'Ship size names and plurals',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Ship sizes are localised with `<key>` and `<key>_plural`. `entity` and the `section_slots` locators must match each other and an existing ship entity; reusing a vanilla pair is the safe way to add a size without new art.',
  );
result.messages.push(
    'A new ship size also needs a common/section_templates/ block whose `ship_size` equals the new key (copy a vanilla one verbatim and rename it), otherwise the auto-designer has nowhere to put the required core components.',
  );
  result.messages.push(
    'TRAP: big-hull components gate themselves on scripted triggers that whitelist vanilla ship sizes (ship_uses_juggernaut_reactors, is_arkship_ship, ...). A modded size is not in those lists, so power_core, thruster_components and combat_computers cannot be filled and the engine logs "cannot build any component in the component set X" once per country. Fix: override each trigger in common/scripted_triggers/ with the same key plus your size - a mod file with the same key wins, and the log then reports "already exists, using the one at file: <your file>", which means success.',
  );

  result.messages.push(
    '`class` selects the designer category (vanilla: shipclass_military, shipclass_military_station, shipclass_constructor, shipclass_colonizer, shipclass_science_ship, shipclass_transport, shipclass_orbital_station, shipclass_ion_cannon …). Verify the value you pass exists in the install.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_event_chain_batch
// ------------------------------------------------------------------------------------

export function generateEventChainBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const chains = requireArray(args.chains, 'chains');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of chains.entries()) {
    const spec = requireObject(entry, `chains[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `chains[${index}].key`);
    const title = requireString(spec.title, `chains[${index}].title`);
    const description = requireString(spec.description ?? spec.desc, `chains[${index}].description`);

    const lines = [`${key} = {`];
    if (spec.icon) lines.push(`\ticon = "${escapeScriptString(spec.icon)}"`);
    else lines.push('\ticon = "gfx/interface/icons/situation_log/situation_log_main_quest.dds"');
    if (spec.picture) lines.push(`\tpicture = ${spec.picture}`);
    if (spec.situation_log_category) {
      lines.push(`\tsituation_log_category = ${spec.situation_log_category}`);
    }
    const counters = optionalArray(spec.counters);
    if (counters.length > 0) {
      lines.push('\tcounter = {');
      for (const counter of counters) {
        const counterKey = requireDefinitionKey(counter.key, `chains[${index}].counters[].key`);
        lines.push(`\t\t${counterKey} = {`);
        lines.push(`\t\t\tmax = ${Number(counter.max ?? 6)}`);
        lines.push('\t\t}');
        // The engine demands a loc key for every counter:
        //   Objective counter "X" is missing localization for "X".
        if (withLocalisation) {
          localisationEntries.push({
            key: counterKey,
            value: optionalString(counter.title) ?? humaniseKey(counterKey),
          });
        }
      }
      lines.push('\t}');
    }
    if (spec.abort_trigger) lines.push(block('abort_trigger', spec.abort_trigger, 1));
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      // Verified in 4.4.6 localisation: the keys are `<chain_key>_title` / `_desc`.
      // The comment at the top of vanilla 00_event_chains.txt claims an `event_chain_`
      // prefix, and that prefix occurs zero times in the shipped localisation.
      localisationEntries.push({ key: `${key}_title`, value: title });
      localisationEntries.push({ key: `${key}_desc`, value: description });
    }
  }

  const scriptPath = `common/event_chains/${prefix}_event_chains.txt`;
  const files = [
    generatedFile(
      scriptPath,
      `${SCRIPT_HEADER(scriptPath, 'common/event_chains/00_event_chains.txt')}${blocks.join('\n\n')}\n`,
      { summary: `${chains.length} event chain(s)` },
    ),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_event_chains`, language),
        entries: localisationEntries,
        summary: 'Event chain titles and descriptions',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Localisation keys are `<chain_key>_title` and `<chain_key>_desc`. The header comment in vanilla `common/event_chains/00_event_chains.txt` says `event_chain_<key>_title`, which does not exist in the shipped localisation.',
  );
  result.messages.push(
    'Start a chain from script with `begin_event_chain = { event_chain = <key> target = <country> }` and end it with `end_event_chain`.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_situation_batch
// ------------------------------------------------------------------------------------

export function generateSituationBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const situations = requireArray(args.situations, 'situations');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of situations.entries()) {
    const spec = requireObject(entry, `situations[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `situations[${index}].key`);
    const title = requireString(spec.title, `situations[${index}].title`);
    const description = requireString(spec.description ?? spec.desc, `situations[${index}].description`);
    const stages = optionalArray(spec.stages);
    if (stages.length === 0) {
      throw new ToolError(`situations[${index}].stages is empty; a situation needs at least one stage`);
    }

    const lines = [`${key} = {`];
    lines.push(`\tpicture = ${optionalString(spec.picture) ?? 'GFX_evt_alien_nature'}`);
    if (spec.complete_icon) lines.push(`\tcomplete_icon = ${spec.complete_icon}`);
    if (spec.complete_icon_frame) lines.push(`\tcomplete_icon_frame = ${spec.complete_icon_frame}`);
    if (spec.fail_icon) lines.push(`\tfail_icon = ${spec.fail_icon}`);
    if (spec.fail_icon_frame) lines.push(`\tfail_icon_frame = ${spec.fail_icon_frame}`);
    if (spec.category) lines.push(`\tcategory = ${spec.category}`);
    lines.push(`\tsituation_log_category = ${optionalString(spec.situation_log_category) ?? 'developments'}`);
    if (spec.custom_tooltip) lines.push(`\tcustom_tooltip = ${spec.custom_tooltip}`);
    if (spec.custom_tooltip_with_modifiers) {
      lines.push(`\tcustom_tooltip_with_modifiers = ${spec.custom_tooltip_with_modifiers}`);
    }
    if (spec.permanent !== undefined) lines.push(assignment('permanent', optionalBoolean(spec.permanent), 1));
    if (spec.show_in_outliner !== undefined) {
      lines.push(assignment('show_in_outliner', optionalBoolean(spec.show_in_outliner, true), 1));
    }
    if (spec.potential) lines.push(block('potential', spec.potential, 1));
    if (spec.modifier) lines.push(block('modifier', spec.modifier, 1));
    if (spec.abort_trigger) lines.push(block('abort_trigger', spec.abort_trigger, 1));
    if (spec.start_value !== undefined) lines.push(`\tstart_value = ${Number(spec.start_value)}`);
    if (spec.initial_progress !== undefined) lines.push(`\tinitial_progress = ${Number(spec.initial_progress)}`);
    if (spec.progress_direction) lines.push(`\tprogress_direction = ${spec.progress_direction}`);
    if (spec.total_progress !== undefined) lines.push(`\ttotal_progress = ${Number(spec.total_progress)}`);
    if (spec.on_start) lines.push(block('on_start', spec.on_start, 1));
    if (optionalArray(spec.on_monthly_events).length > 0) {
      lines.push('\ton_monthly = {');
      lines.push('\t\tevents = {');
      for (const eventId of spec.on_monthly_events) lines.push(`\t\t\t${eventId}`);
      lines.push('\t\t}');
      lines.push('\t}');
    }
    if (spec.monthly_progress) {
      const mp = spec.monthly_progress;
      lines.push('\tmonthly_progress = {');
      lines.push(`\t\tbase = ${Number(mp.base ?? 1)}`);
      if (mp.modifier) {
        const body = blockBody('modifier', mp.modifier, 3);
        lines.push('\t\tmodifier = {', body ?? '', '\t\t}');
      }
      lines.push('\t}');
    }

    lines.push('');
    lines.push('\tstages = {');
    for (const stage of stages) {
      const stageKey = requireDefinitionKey(stage.key, `situations[${index}].stages[].key`);
      lines.push(`\t\t${stageKey} = {`);
      lines.push(`\t\t\ticon = ${optionalString(stage.icon) ?? 'GFX_situation_stage_1'}`);
      lines.push(
        `\t\t\ticon_background = ${optionalString(stage.icon_background) ?? 'GFX_situation_stage_frame_blue'}`,
      );
      if (stage.color) lines.push(`\t\t\tcolor = ${stage.color}`);
      if (stage.end !== undefined && spec.total_progress !== undefined) {
        throw new ToolError(
          `situations[${index}] declares total_progress, so stage \`${stageKey}\` must use section_weight instead of end (the game logs an error if the two are mixed)`,
        );
      }
      if (stage.end !== undefined) lines.push(`\t\t\tend = ${Number(stage.end)}`);
      if (stage.section_weight !== undefined) lines.push(`\t\t\tsection_weight = ${Number(stage.section_weight)}`);
      if (stage.on_first_enter) lines.push(blockFromLines('on_first_enter', [blockBody('on_first_enter', stage.on_first_enter, 1) ?? ''], 3));
      if (stage.on_enter) lines.push(block('on_enter', stage.on_enter, 3));
      if (stage.modifier) lines.push(block('modifier', stage.modifier, 3));
      if (stage.custom_tooltip) lines.push(`\t\t\tcustom_tooltip = ${stage.custom_tooltip}`);
      lines.push('\t\t}');
      if (withLocalisation) {
        localisationEntries.push({ key: stageKey, value: optionalString(stage.title) ?? stageKey });
      }
    }
    lines.push('\t}');

    for (const approach of optionalArray(spec.approaches)) {
      lines.push('');
      lines.push('\tapproach = {');
      const approachKey = requireDefinitionKey(approach.key, `situations[${index}].approaches[].key`);
      lines.push(`\t\tname = ${approachKey}`);
      lines.push(`\t\ticon = ${optionalString(approach.icon) ?? 'GFX_situation_approach_radioactive'}`);
      lines.push(
        `\t\ticon_background = ${optionalString(approach.icon_background) ?? 'GFX_situation_approach_bg_green'}`,
      );
      if (approach.potential) lines.push(block('potential', approach.potential, 2));
      if (approach.allow) lines.push(block('allow', approach.allow, 2));
      if (approach.on_select) lines.push(block('on_select', approach.on_select, 2));
      if (approach.default !== undefined) lines.push(assignment('default', optionalBoolean(approach.default), 2));
      if (approach.modifier) lines.push(block('modifier', approach.modifier, 2));
      if (approach.upkeep) {
        lines.push('\t\tresources = {');
        lines.push('\t\t\tcategory = situations');
        lines.push('\t\t\tupkeep = {');
        for (const [resource, amount] of Object.entries(approach.upkeep)) {
          lines.push(`\t\t\t\t${resource} = ${Number(amount)}`);
        }
        lines.push('\t\t\t}');
        lines.push('\t\t}');
      }
      lines.push('\t}');
      if (withLocalisation) {
        localisationEntries.push({
          key: approachKey,
          value: requireString(approach.title, `situations[${index}].approaches[].title`),
        });
      }
    }

    if (spec.on_progress_complete) lines.push('', block('on_progress_complete', spec.on_progress_complete, 1));
    if (spec.on_fail) lines.push('', block('on_fail', spec.on_fail, 1));
    if (spec.on_abort) lines.push('', block('on_abort', spec.on_abort, 1));
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      // All four keys are required by the situations README.
      localisationEntries.push({ key, value: title });
      localisationEntries.push({
        key: `${key}_type`,
        value: optionalString(spec.type_title) ?? title,
      });
      localisationEntries.push({ key: `${key}_desc`, value: description });
      localisationEntries.push({
        key: `${key}_monthly_change_tooltip`,
        value: requireString(spec.monthly_change_tooltip, `situations[${index}].monthly_change_tooltip`),
      });
    }
  }

  const scriptPath = `common/situations/${prefix}_situations.txt`;
  const files = [
    generatedFile(
      scriptPath,
      `${SCRIPT_HEADER(scriptPath, 'common/situations/99_README_SITUATIONS.txt')}${blocks.join('\n\n')}\n`,
      { summary: `${situations.length} situation(s)` },
    ),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_situations`, language),
        entries: localisationEntries,
        summary: 'Situation names, types, descriptions, monthly tooltips, stages and approaches',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Every situation needs four localisation keys: `<key>`, `<key>_type`, `<key>_desc` and `<key>_monthly_change_tooltip`; stage and approach keys are localised too.',
  );
  result.messages.push(
    'Scope: the situation itself is `this`/`root`, `owner` is the country and `target` is the target. `target = { ... }` only works when the target is a colony carrier or a country.',
  );
  result.messages.push(
    'TRAP: inside `monthly_progress`, `on_start`, `on_progress_complete`, `on_fail` and `on_abort` the scope is the SITUATION, not the country, so country triggers and effects such as `has_country_flag` or `set_country_flag` are out of scope. Wrap them as `owner = { ... }`. The engine logs "Wrong scope for ..." and still loads the situation.',
  );
  result.messages.push(
    'An approach with no `on_select` effect loads, but the engine warns that it "lacks any effects, this will not display well"; give every approach an effect or a `custom_tooltip`.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_tradition_tree
// ------------------------------------------------------------------------------------

/** Build the interface/*.gfx body that gives a tradition tree its four sprites.
 *
 * The tradition screen looks up, by category key:
 *   GFX_tradition_hex_bg_<key>, GFX_tradition_category_bg_<key>,
 *   GFX_tradition_category_tile_<key> and GFX_tradition_category_icon_<key>.
 * Vanilla defines all four per tree in interface/traditions.gfx. Without them the tree still
 * renders, but the game logs `Trying to change sprite to unknown sprite` for each and the
 * tree has no icon or background. The defaults below are vanilla textures, so they exist in
 * every install.
 */
function traditionGfxFile(categoryKey, icons = {}) {
  const textures = {
    hex_bg: optionalString(icons.hex_bg) ?? 'gfx/interface/traditions/tradition_hex_bg_blue.dds',
    category_bg: optionalString(icons.category_bg) ?? 'gfx/interface/tiles/tradition_category_tile_locked.dds',
    category_tile: optionalString(icons.category_tile) ?? 'gfx/interface/tiles/tradition_category_tile_locked.dds',
    category_icon:
      optionalString(icons.category_icon) ??
      'gfx/interface/icons/traditions/tree_icons/tradition_icon_locked.dds',
  };

  const sprite = (name, texture) => `\tspriteType = {\n\t\tname = "${name}"\n\t\ttextureFile = "${texture}"\n\t}`;
  const body = [
    sprite(`GFX_tradition_hex_bg_${categoryKey}`, textures.hex_bg),
    sprite(`GFX_tradition_category_bg_${categoryKey}`, textures.category_bg),
    [
      '\tcorneredTileSpriteType = {',
      `\t\tname = "GFX_tradition_category_tile_${categoryKey}"`,
      `\t\ttextureFile = "${textures.category_tile}"`,
      '\t\tborderSize = { x=140 y=140 }',
      '\t\teffectFile = "gfx/FX/buttonstate_onlydisable.shader"',
      '\t}',
    ].join('\n'),
    sprite(`GFX_tradition_category_icon_${categoryKey}`, textures.category_icon),
  ].join('\n\n');

  return `spriteTypes = {\n\n${body}\n}\n`;
}

export function generateTraditionTree(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const tree = requireObject(args.tree, 'tree');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);

  const categoryKey = requireDefinitionKey(tree.key ?? `tradition_${prefix}`, 'tree.key');
  const adoptionKey = requireDefinitionKey(
    tree.adoption?.key ?? `${categoryKey.replace(/^tradition_/, 'tr_')}_adopt`,
    'tree.adoption.key',
  );
  const finishKey = requireDefinitionKey(
    tree.finish?.key ?? `${categoryKey.replace(/^tradition_/, 'tr_')}_finish`,
    'tree.finish.key',
  );
  const traditions = requireArray(tree.traditions, 'tree.traditions');
  const perks = optionalArray(args.ascension_perks);

  const traditionLines = [];
  const localisationEntries = [];

  const writeTradition = (tradition, key, label) => {
    const lines = [`${key} = {`];
    if (tradition.possible) lines.push(block('possible', tradition.possible, 1));
    if (tradition.potential) lines.push(block('potential', tradition.potential, 1));
    if (tradition.unlocks_agenda) lines.push(`\tunlocks_agenda = ${tradition.unlocks_agenda}`);
    if (tradition.custom_tooltip) lines.push(`\tcustom_tooltip = ${tradition.custom_tooltip}`);
    if (tradition.custom_tooltip_with_modifiers) {
      lines.push(`\tcustom_tooltip_with_modifiers = ${tradition.custom_tooltip_with_modifiers}`);
    }
    if (tradition.modifier) lines.push(block('modifier', tradition.modifier, 1));
    if (tradition.triggered_modifier) lines.push(block('triggered_modifier', tradition.triggered_modifier, 1));
    if (tradition.on_enabled) lines.push(block('on_enabled', tradition.on_enabled, 1));
    if (tradition.on_disabled) lines.push(block('on_disabled', tradition.on_disabled, 1));
    lines.push(block('ai_weight', tradition.ai_weight ?? 'factor = 1000', 1));
    lines.push('}');
    if (withLocalisation) {
      localisationEntries.push({
        key,
        value: requireString(tradition.title, `${label}.title`),
      });
      // The description key for a tradition is `<key>_delayed`, NOT `<key>_desc`.
      localisationEntries.push({
        key: `${key}_delayed`,
        value: requireString(tradition.description ?? tradition.desc, `${label}.description`),
      });
    }
    return lines.join('\n');
  };

  traditionLines.push(writeTradition(tree.adoption ?? {}, adoptionKey, 'tree.adoption'));
  traditionLines.push(writeTradition(tree.finish ?? {}, finishKey, 'tree.finish'));
  traditions.forEach((tradition, index) => {
    const key = requireDefinitionKey(tradition.key ?? tradition.id, `tree.traditions[${index}].key`);
    traditionLines.push(writeTradition(tradition, key, `tree.traditions[${index}]`));
  });

  const categoryLines = [
    `${categoryKey} = {`,
    `\ttree_template = "${escapeScriptString(optionalString(tree.tree_template) ?? 'tree_11_12')}"`,
    `\tadoption_bonus = "${adoptionKey}"`,
    `\tfinish_bonus = "${finishKey}"`,
    '\ttraditions = {',
    ...traditions.map((tradition) =>
      `\t\t"${requireDefinitionKey(tradition.key ?? tradition.id, 'tree.traditions[].key')}"`,
    ),
    '\t}',
  ];
  if (tree.potential) categoryLines.push(block('potential', tree.potential, 1));
  categoryLines.push(block('ai_weight', tree.ai_weight ?? 'factor = 5', 1));
  categoryLines.push('}');

  const files = [
    generatedFile(
      `common/tradition_categories/${prefix}_tradition_categories.txt`,
      `${SCRIPT_HEADER(`common/tradition_categories/${prefix}_tradition_categories.txt`, 'common/tradition_categories/99_README_TRADITION_CATEGORIES.txt')}${categoryLines.join('\n')}\n`,
      { summary: `Tradition tree category ${categoryKey}` },
    ),
    generatedFile(
      `common/traditions/${prefix}_traditions.txt`,
      `${SCRIPT_HEADER(`common/traditions/${prefix}_traditions.txt`, 'common/traditions/99_README_TRADITIONS.txt')}${traditionLines.join('\n\n')}\n`,
      { summary: `${traditions.length + 2} tradition(s) including adoption and finish bonuses` },
    ),
  ];

  if (withLocalisation) {
    localisationEntries.push({ key: categoryKey, value: requireString(tree.title, 'tree.title') });
    localisationEntries.push({
      key: `${categoryKey}_desc`,
      value: optionalString(tree.description) ?? requireString(tree.title, 'tree.title'),
    });
  }

  if (perks.length > 0) {
    const perkBlocks = perks.map((perk, index) => {
      const key = requireDefinitionKey(perk.key ?? perk.id, `ascension_perks[${index}].key`);
      const lines = [`${key} = {`];
      if (perk.potential) lines.push(block('potential', perk.potential, 1));
      if (perk.possible) lines.push(block('possible', perk.possible, 1));
      if (perk.on_enabled) lines.push(block('on_enabled', perk.on_enabled, 1));
      if (perk.modifier) lines.push(block('modifier', perk.modifier, 1));
      lines.push('}');
      if (withLocalisation) {
        localisationEntries.push({ key, value: requireString(perk.title, `ascension_perks[${index}].title`) });
        // Ascension perks DO use `<key>_desc`.
        localisationEntries.push({
          key: `${key}_desc`,
          value: requireString(perk.description ?? perk.desc, `ascension_perks[${index}].description`),
        });
      }
      return lines.join('\n');
    });
    files.push(
      generatedFile(
        `common/ascension_perks/${prefix}_ascension_perks.txt`,
        `${SCRIPT_HEADER(`common/ascension_perks/${prefix}_ascension_perks.txt`, 'common/ascension_perks/00_ascension_perks.txt')}${perkBlocks.join('\n\n')}\n`,
        { summary: `${perks.length} ascension perk(s)` },
      ),
    );
  }

  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPathFor(`${language}/${prefix}_traditions`, language),
        entries: localisationEntries,
        summary: 'Tradition tree, tradition and ascension perk text',
      }),
    );
  }

    // A tree's sprites live in interface/, named after the category key. Without them the
  // tradition screen logs "Trying to change sprite to unknown sprite" for each one.
  files.push(
    generatedFile(
      `interface/zz_${prefix}_tradition_gfx.gfx`,
      `# Generated by RStellarScribe for interface/zz_${prefix}_tradition_gfx.gfx.\n# Sprite names follow interface/traditions.gfx.\n\n${traditionGfxFile(categoryKey, tree.icons ?? {})}`,
      { summary: `Tradition tree sprites for ${categoryKey}` },
    ),
  );

const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Localisation: a tradition\'s description key is `<key>_delayed`; an ascension perk\'s is `<key>_desc`. Mixing them up leaves the description blank with no error.',
  );
  result.messages.push(
    '`adoption_bonus`, `finish_bonus` and every key in `traditions` must exist in `common/traditions/`; the `traditions` list must NOT repeat the adoption or finish keys, they are added automatically.',
  );
  result.messages.push(
    'A tree also needs four sprites in interface/*.gfx named after the category key (hex background, category background, the cornered category tile and the category icon). This generator writes interface/zz_<prefix>_tradition_gfx.gfx using vanilla textures; without it the tree renders but the game logs "Trying to change sprite to unknown sprite" and shows no icon.',
  );
  return result;
}
