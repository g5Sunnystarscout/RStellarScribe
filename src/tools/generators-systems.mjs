//------------------------------------------------------------------------------------
// generators-systems.mjs -- Part of RStellarisScribe
//
// Generators for the script systems that were added after the live aerospace-carrier test.
// Every field below was read out of the installed game, and each generator records where:
//
//   scripted actions    common/scripted_actions/99_README_SCRIPTED_ACTIONS.txt
//                       (user_scope MUST be the first parameter, scope the second)
//   button effects      common/button_effects/example.txt + interface/fleet_view.gui:708
//   section templates   common/section_templates/00_generic_ship_sections.txt
//   starbase buildings  common/starbase_buildings/00_arkship_colony_buildings.txt
//
// The button-effect generator can also emit the matching `interface/*.gui`, because a button
// effect is useless without a window that contains an `effectbuttonType` pointing at it; that
// pairing is the hand-written-GUI mechanism verified in the carrier test.
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import {
  asciiKey,
  escapeScriptString,
  finishGeneration,
  generatedFile,
  optionalString,
  requireArray,
  requireString,
  ToolError,
} from '../lib/generation.mjs';
import { localisationPathFor } from '../lib/paths.mjs';
import {
  SCRIPT_HEADER,
  assertLanguage,
  block,
  localisationPlan,
  requireDefinitionKey,
} from './generators.mjs';

// ------------------------------------------------------------------------------------
// small shared pieces (same shapes as generators-content.mjs, which keeps them local)
// ------------------------------------------------------------------------------------

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolError(`\`${field}\` is required and must be an object`);
  }
  return value;
}

function optionalArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalBoolean(value, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

/** Localisation file path for a mod, matching the layout every other generator uses. */
function localisationPath(language, prefix, name) {
  return localisationPathFor(`${language}/${prefix}_${name}`, language);
}

// ------------------------------------------------------------------------------------
// generate_scripted_action_batch
// ------------------------------------------------------------------------------------

/**
 * Write common/scripted_actions/ entries. These are the buttons a ship, fleet or megastructure
 * can show; a ship size or a component enables them with `scripted_action = { <key> }`.
 *
 * Field order matters: the engine requires `user_scope` to be the first parameter and `scope`
 * the second (stated in the shipped README), so this generator always emits them in that order.
 */
export function generateScriptedActionBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const actions = requireArray(args.actions, 'actions');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const source = optionalString(args.source) ?? 'common/scripted_actions/99_README_SCRIPTED_ACTIONS.txt';

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of actions.entries()) {
    const spec = requireObject(entry, `actions[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `actions[${index}].key`);
    const title = requireString(spec.title, `actions[${index}].title`);
    const userScope = requireString(spec.user_scope, `actions[${index}].user_scope`);
    const scope = requireString(spec.scope, `actions[${index}].scope`);

    const lines = [
      `${key} = {`,
      `\t# user_scope MUST come first and scope second (shipped README).`,
      `\tuser_scope = ${escapeScriptString(userScope)}`,
      `\tscope = ${escapeScriptString(scope)}`,
    ];

    lines.push(block('possible', optionalString(spec.possible) ?? 'always = yes', 1));
    if (spec.finished) lines.push(block('finished', String(spec.finished), 1));
    if (spec.button_visible) lines.push(block('button_visible', String(spec.button_visible), 1));
    if (spec.button_clickable) lines.push(block('button_clickable', String(spec.button_clickable), 1));
    if (spec.hide_from_context_menu) {
      lines.push(block('hide_from_context_menu', String(spec.hide_from_context_menu), 1));
    }

    for (const hook of ['on_completed', 'on_queued', 'on_started', 'on_progress_start', 'on_cancelled']) {
      const value = optionalString(spec[hook]);
      if (value) lines.push(`\t${hook} = ${escapeScriptString(value)}`);
    }

    if (spec.automation) {
      const automation = requireObject(spec.automation, `actions[${index}].automation`);
      const automationLines = [];
      if (automation.priority !== undefined) automationLines.push(`\t\tpriority = ${Number(automation.priority)}`);
      automationLines.push(`\t\tdefault_on = ${optionalBoolean(automation.default_on, false) ? 'yes' : 'no'}`);
      if (automation.tooltip) automationLines.push(`\t\ttooltip = ${escapeScriptString(String(automation.tooltip))}`);
      for (const nested of optionalArray(automation.also_automate)) {
        automationLines.push(`\t\talso_automate = { ${escapeScriptString(String(nested))} }`);
      }
      lines.push('\tautomation = {', ...automationLines, '\t}');
    }

    const icon = optionalString(spec.icon);
    if (icon) lines.push(`\ticon = ${icon}`);
    const iconSelected = optionalString(spec.icon_selected);
    if (iconSelected) lines.push(`\ticon_selected = ${iconSelected}`);

    // The tooltip and the context-menu label are localisation keys; default them to keys this
    // generator also writes, so the result is self-consistent.
    const tooltipKey = optionalString(spec.tooltip) ?? key;
    const menuKey = optionalString(spec.context_menu_name) ?? `${key}_menu`;
    lines.push(`\ttooltip = ${escapeScriptString(tooltipKey)}`);
    lines.push(`\tcontext_menu_name = ${escapeScriptString(menuKey)}`);
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key: tooltipKey, value: title });
      if (menuKey !== tooltipKey) localisationEntries.push({ key: menuKey, value: title });
      if (spec.desc) localisationEntries.push({ key: `${key}_desc`, value: String(spec.desc) });
    }
  }

  const scriptPath = `common/scripted_actions/${prefix}_scripted_actions.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${actions.length} scripted action(s)`,
    }),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPath(language, prefix, 'scripted_actions'),
        entries: localisationEntries,
        summary: 'Scripted action button tooltips and context menu labels',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    '`user_scope` and `scope` are not decoration: user_scope defines the scope of button_visible / button_clickable and the `from` of the action, scope defines the target and the scope of `possible` / `finished`. The shipped README requires user_scope first and scope second.',
  );
  result.messages.push(
    'An action does nothing until something enables it: a ship size gets it with `scripted_action = { <key> }` (documented in common/ship_sizes/00_ship_sizes.txt and used by vanilla at 29_nomads_dlc_ships.txt:1348), or a component with the same field.',
  );
  result.messages.push(
    'The `on_completed` / `on_started` / `on_queued` hooks name an on_action, NOT an event. An on_action block accepts only `events` and `random_events`; adding `effect = { ... }` there is rejected with `Unexpected token: effect`, so route through an event if you need script.',
  );
  result.messages.push(
    'The button is drawn by the engine (the fleet view fills its `actions` grid from scripted actions), so the icon must be an existing sprite: run validate_stellaris_interface after writing.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_button_effect_batch
// ------------------------------------------------------------------------------------

/**
 * Write common/button_effects/ entries and, optionally, the interface/*.gui that uses them.
 *
 * Scope (from the shipped example.txt): `this` is the selected object (planet, ship, fleet,
 * system, megastructure, federation, espionage operation, arc site, first contact) or the player
 * country, and `from` is the player country. Because the same effect can be reached from
 * several open interfaces, the example advises checking `is_scope_type` in `allow`.
 */
export function generateButtonEffectBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const buttons = requireArray(args.buttons, 'buttons');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const withGui = optionalBoolean(args.generate_gui, false);
  const source = optionalString(args.source) ?? 'common/button_effects/example.txt';

  const blocks = [];
  const guiButtons = [];
  const localisationEntries = [];

  for (const [index, entry] of buttons.entries()) {
    const spec = requireObject(entry, `buttons[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `buttons[${index}].key`);
    const title = requireString(spec.title, `buttons[${index}].title`);

    if (!spec.effect && !spec.effect_lines) {
      throw new ToolError(
        `buttons[${index}] needs either \`effect\` (an object of effects) or \`effect_lines\` (raw lines) - a button effect without an effect does nothing`,
      );
    }

    const lines = [`${key} = {`];
    // A scope check is what keeps a shared effect safe when several interfaces are open.
    const potential = optionalString(spec.potential) ?? `is_scope_type = ${spec.scope_type ?? 'fleet'}`;
    lines.push(block('potential', potential, 1));
    if (spec.allow) lines.push(block('allow', String(spec.allow), 1));
    if (!spec.effect && !spec.effect_lines) {
      throw new ToolError(
        `buttons[${index}] needs \`effect\` (raw script text) or \`effect_lines\` (an array of lines)`,
      );
    }
    if (spec.effect_lines) {
      lines.push('\teffect = {');
      for (const raw of optionalArray(spec.effect_lines)) lines.push(`\t\t${String(raw)}`);
      lines.push('\t}');
    } else {
      lines.push(block('effect', spec.effect, 1));
    }
    lines.push('}');
    blocks.push(lines.join('\n'));

    const tooltipKey = optionalString(spec.tooltip) ?? `${key}_tooltip`;
    if (withLocalisation) {
      localisationEntries.push({ key: tooltipKey, value: title });
      localisationEntries.push({ key, value: title });
    }

    if (withGui) {
      const gui = requireObject(spec.gui, `buttons[${index}].gui (required when generate_gui is true)`);
      const buttonLines = [
        '\t\teffectbuttonType = {',
        `\t\t\tname = ${escapeScriptString(optionalString(gui.name) ?? `${key}_button`)}`,
        `\t\t\tposition = { x = ${Number(gui.x ?? 0)} y = ${Number(gui.y ?? index * 40)} }`,
        `\t\t\tsize = { x = ${Number(gui.width ?? 240)} y = ${Number(gui.height ?? 32)} }`,
        `\t\t\tquadTextureSprite = ${optionalString(gui.sprite) ?? 'GFX_tiling_button_standard'}`,
        '\t\t\torientation = UPPER_LEFT',
        `\t\t\tfont = ${escapeScriptString(optionalString(gui.font) ?? 'cg_16b')}`,
        `\t\t\tbuttonText = ${escapeScriptString(tooltipKey)}`,
        `\t\t\ttooltipText = ${escapeScriptString(tooltipKey)}`,
        `\t\t\teffect = ${escapeScriptString(key)}`,
        '\t\t\tclicksound = tab_click',
        '\t\t}',
      ];
      guiButtons.push(buttonLines.join('\n'));
    }
  }

  const scriptPath = `common/button_effects/${prefix}_button_effects.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${buttons.length} button effect(s)`,
    }),
  ];
  if (withGui) {
    const guiPath = `interface/${prefix}_button_effects.gui`;
    const windowName = optionalString(args.window_name) ?? `${prefix}_button_window`;
    const guiContent = [
      `guiTypes = {`,
      '',
      `\t# Root MUST be guiTypes; a bare containerWindowType at the top level fails to parse.`,
      `\tcontainerWindowType = {`,
      `\t\tname = ${escapeScriptString(windowName)}`,
      `\t\torientation = center`,
      `\t\torigo = center`,
      `\t\tmoveable = yes`,
      `\t\tsize = { width = ${Number(args.window_width ?? 420)} height = ${Number(args.window_height ?? 260)} }`,
      '',
      `\t\tbackground = {`,
      `\t\t\tname = "background"`,
      `\t\t\tquadTextureSprite = "GFX_tile_large_bg"`,
      `\t\t}`,
      '',
      guiButtons.join('\n\n'),
      '',
      `\t\tbuttonType = {`,
      `\t\t\tname = "close"`,
      `\t\t\tquadTextureSprite = "GFX_button_close"`,
      `\t\t\tposition = { x = -20 y = 12 }`,
      `\t\t\torientation = "UPPER_RIGHT"`,
      `\t\t\tclicksound = "back_click"`,
      `\t\t}`,
      `\t}`,
      `}`,
      '',
    ].join('\n');
    files.push(generatedFile(guiPath, guiContent, { summary: `Hand-written window ${windowName}` }));
  }
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPath(language, prefix, 'button_effects'),
        entries: localisationEntries,
        summary: 'Button effect labels',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'Scope rules from the shipped example: `this` is the selected object or the player country, `from` is the player country. Check `is_scope_type = <scope>` in `allow`, or the effect can fire from the wrong interface.',
  );
  result.messages.push(
    'Reserve `this` for what the player selected and reach the country through `from`. Effects that iterate a fleet use `every_owned_ship` - `every_ship` does not exist and fails with `Invalid scripted effect`.',
  );
  result.messages.push(
    'A fleet-view button belongs in a .gui file, and the file root must be `guiTypes = { ... }`. A hand-written window only appears if an event names it (`custom_gui = "<name>"`); otherwise inject the container into a .gui file the engine already instantiates, which replaces that file wholesale.',
  );
  result.messages.push(
    'Iterators such as `*_compare` take the comparison operator inside the key name: `value >= 100`, never `value = 100` (which reads as equality and silently fails for larger stockpiles).',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_section_template_batch
// ------------------------------------------------------------------------------------

/**
 * Write common/section_templates/ entries. A ship size's `section_slots` names slots; each slot
 * needs a section template whose `fits_on_slot` matches it, or the designer has nothing to offer.
 */
export function generateSectionTemplateBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const sections = requireArray(args.sections, 'sections');
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const source = optionalString(args.source) ?? 'common/section_templates/00_generic_ship_sections.txt';

  const blocks = [];

  for (const [index, entry] of sections.entries()) {
    const spec = requireObject(entry, `sections[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `sections[${index}].key`);
    const shipSize = requireString(spec.ship_size, `sections[${index}].ship_size`);
    const fitsOnSlot = requireString(spec.fits_on_slot, `sections[${index}].fits_on_slot`);
    const slots = optionalArray(spec.component_slots);

    const lines = [
      'ship_section_template = {',
      `\tkey = ${escapeScriptString(key)}`,
      `\tship_size = ${escapeScriptString(shipSize)}`,
      `\tfits_on_slot = ${escapeScriptString(fitsOnSlot)}`,
      `\tentity = ${escapeScriptString(optionalString(spec.entity) ?? 'warship_large_entity')}`,
      `\ticon = ${escapeScriptString(optionalString(spec.icon) ?? 'GFX_ship_part_core_mid')}`,
    ];

    for (const [slotIndex, slot] of slots.entries()) {
      const slotSpec = requireObject(slot, `sections[${index}].component_slots[${slotIndex}]`);
      lines.push('\tcomponent_slot = {');
      lines.push(`\t\tname = ${escapeScriptString(requireString(slotSpec.name, `sections[${index}].component_slots[${slotIndex}].name`))}`);
      lines.push(`\t\ttemplate = ${escapeScriptString(requireString(slotSpec.template, `sections[${index}].component_slots[${slotIndex}].template`))}`);
      lines.push(`\t\tlocatorname = ${escapeScriptString(requireString(slotSpec.locatorname, `sections[${index}].component_slots[${slotIndex}].locatorname`))}`);
      if (slotSpec.is_side_slot !== undefined) {
        lines.push(`\t\tis_side_slot = ${optionalBoolean(slotSpec.is_side_slot, false) ? 'yes' : 'no'}`);
      }
      lines.push('\t}');
    }

    // Utility slots are plain counts and need no locator, unlike component_slot entries.
    for (const slotKind of ['small_utility_slots', 'medium_utility_slots', 'large_utility_slots', 'aux_utility_slots']) {
      if (spec[slotKind] !== undefined) lines.push(`\t${slotKind} = ${Number(spec[slotKind])}`);
    }

    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  const scriptPath = `common/section_templates/${prefix}_section_templates.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${sections.length} section template(s)`,
    }),
  ];

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.messages.push(
    'Every slot named in a ship size\'s `section_slots` needs a section template whose `fits_on_slot` matches exactly. A mismatch logs `Couldn\'t find any section templates that are compatible with ship_size "X" and fits on slot "Y"` and the design screen offers no section.',
  );
  result.messages.push(
    '`component_slot` entries need a real `template` (a component template key) and a `locatorname` that exists on the ship entity. `small_utility_slots` / `medium_utility_slots` / `large_utility_slots` / `aux_utility_slots` are plain counts and need no locator.',
  );
  result.messages.push(
    'Reusing a vanilla entity plus its locatornames is the only way to add a hull without new art; check the entity you name in the ship size uses the same locators.',
  );
  return result;
}

// ------------------------------------------------------------------------------------
// generate_starbase_building_batch
// ------------------------------------------------------------------------------------

/**
 * Write common/starbase_buildings/ entries (starbase buildings and modules).
 *
 * TRAP: these blocks have no bare `modifier` field. Writing one gives
 * `Unexpected token: modifier` and the whole building fails to load; vanilla reaches the same
 * goal with `equipped_component = <component key>`, `resources`, and scoped trigger blocks.
 */
export function generateStarbaseBuildingBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const buildings = requireArray(args.buildings, 'buildings');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const source = optionalString(args.source) ?? 'common/starbase_buildings/00_arkship_colony_buildings.txt';

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of buildings.entries()) {
    const spec = requireObject(entry, `buildings[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `buildings[${index}].key`);
    const title = requireString(spec.title, `buildings[${index}].title`);

    if (spec.modifier) {
      throw new ToolError(
        `buildings[${index}].modifier is not a valid field here: starbase buildings and modules have no bare \`modifier\` block, and writing one fails to load with \`Unexpected token: modifier\`. Use \`equipped_component = <component template key>\` (whose own modifier does the work), or a scoped block such as \`owner = { ... }\` / \`triggered_modifier = { ... }\`.`,
      );
    }

    const lines = [
      `${key} = {`,
      `\ticon = ${escapeScriptString(requireString(spec.icon, `buildings[${index}].icon`))}`,
      `\tstarbase_type = ${escapeScriptString(requireString(spec.starbase_type, `buildings[${index}].starbase_type`))}`,
      `\tconstruction_days = ${Number(spec.construction_days ?? 360)}`,
    ];
    const category = optionalString(spec.category);
    if (category) lines.push(`\tcategory = ${escapeScriptString(category)}`);

    const equipped = optionalString(spec.equipped_component);
    if (equipped) lines.push(`\tequipped_component = ${escapeScriptString(equipped)}`);

    if (spec.starbase_limit !== undefined) {
      lines.push('\tstarbase_limit = {');
      lines.push(`\t\tbase = ${Number(spec.starbase_limit)}`);
      lines.push('\t}');
    }

    lines.push(block('potential', optionalString(spec.potential) ?? 'always = yes', 1));
    const showInTech = optionalString(spec.show_in_tech);
    if (showInTech) lines.push(`\tshow_in_tech = ${escapeScriptString(showInTech)}`);
    if (spec.show_tech_unlock_if) {
      lines.push(block('show_tech_unlock_if', String(spec.show_tech_unlock_if), 1));
    }

    if (spec.resources) {
      const resources = requireObject(spec.resources, `buildings[${index}].resources`);
      lines.push('\tresources = {');
      lines.push(`\t\tcategory = ${escapeScriptString(optionalString(resources.category) ?? 'starbase_buildings')}`);
      if (resources.cost) {
        lines.push('\t\tcost = {');
        for (const [resource, amount] of Object.entries(resources.cost)) lines.push(`\t\t\t${resource} = ${Number(amount)}`);
        lines.push('\t\t}');
      }
      if (resources.upkeep) {
        lines.push('\t\tupkeep = {');
        for (const [resource, amount] of Object.entries(resources.upkeep)) lines.push(`\t\t\t${resource} = ${Number(amount)}`);
        lines.push('\t\t}');
      }
      lines.push('\t}');
    }

    const description = optionalString(spec.desc);
    if (description) lines.push(`\tdesc = ${escapeScriptString(`${key}_desc`)}`);
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key, value: title });
      if (description) localisationEntries.push({ key: `${key}_desc`, value: description });
    }
  }

  const scriptPath = `common/starbase_buildings/${prefix}_starbase_buildings.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${buildings.length} starbase building(s)`,
    }),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPath(language, prefix, 'starbase_buildings'),
        entries: localisationEntries,
        summary: 'Starbase building names and descriptions',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'No bare `modifier` field exists on these blocks - this generator refuses one rather than writing a file that fails to load. `equipped_component = <key>` is how vanilla attaches behaviour, and the component carries the modifier.',
  );
  result.messages.push(
    '`potential` is evaluated with the starbase as the scope, so country triggers have to be wrapped: `owner = { has_technology = <tech> }`. Using `has_technology` directly there reports `Wrong scope for trigger`.',
  );
  result.messages.push(
    '`starbase_type` must exist (vanilla: starbase, arkship, orbital_ring, ...), and a building that is fitted through an arkship-style UI needs the hull to be that kind of ship - `carries_colony` and friends change what the ship even is.',
  );
  result.messages.push(
    'A building that grants a ship a button or an ability is usually the wrong tool: a ship-scope `scripted_action` on the ship size, or a component with `scripted_action`, is what the engine reads for fleet-view buttons.',
  );
  return result;
}

export default {
  generateScriptedActionBatch,
  generateButtonEffectBatch,
  generateSectionTemplateBatch,
  generateStarbaseBuildingBatch,
};
