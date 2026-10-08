//------------------------------------------------------------------------------------
// generators-galaxy.mjs -- Part of RStellarisScribe
//
// Galaxy-layer generators, written from the mechanisms verified in the installed game:
//
//   * solar system initializers
//       common/solar_system_initializers/special_system_initializers.txt:2626
//       (`the_chosen_home_initializer`: class / name / flags / usage = misc_system_init /
//        usage_odds = 0 / prevent_anomalies, then `planet = { class orbit_distance orbit_angle
//        size has_ring }` entries)
//   * spawning a system by script
//       events/first_contact_dlc_events.txt:6499 (The Chosen)
//         spawn_system = { min_distance >= 30 max_distance <= 75 direction = rimwards
//                          initializer = ... hyperlane = no }
//       NOTE: min_distance / max_distance take the comparison operator INSIDE the key, exactly
//       like the *_compare triggers, and the values are a 0-100 percentage of the galaxy radius
//       measured from the centre - which is how a cluster is pinned around the galactic core.
//       `hyperlane = no` is what makes a system ISOLATED, the way the L-Cluster and The Chosen's
//       home are; `hyperlane = yes` wires it into the surrounding network instead.
//       A GROUP of spawns is wrapped in `set_spawn_system_batch = begin` / `= end`
//       (events/distant_stars_events_3.txt:1615-1618; also events/distant_stars_events_2.txt:25-30,
//       distar.290), whose own comment says the spawns are then batch-processed "so caches are
//       recalculated only once rather than for every system spawned"; without it the later spawns
//       fail with "Failed to find position at minimum distance SPAWN_SYSTEM_BUFFER_DISTANCE = 10
//       from other systems". Each spawn in the group may also take its own distance band
//       (`spawn.bands`), so several systems placed in the same region do not compete for one spot.
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import {
  asciiKey,
  escapeLocalisationText,
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
  localisationPlan,
  requireDefinitionKey,
} from './generators.mjs';

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

function localisationPath(language, prefix, name) {
  return localisationPathFor(`${language}/${prefix}_${name}`, language);
}

/** One `planet = { ... }` block, with optional nested moons. */
function planetBlock(planet, field, depth = 1) {
  const indent = '\t'.repeat(depth);
  const lines = [`${indent}planet = {`];
  const inner = '\t'.repeat(depth + 1);
  lines.push(`${inner}class = ${escapeScriptString(requireString(planet.class, `${field}.class`))}`);
  if (planet.orbit_distance !== undefined) lines.push(`${inner}orbit_distance = ${Number(planet.orbit_distance)}`);
  if (planet.orbit_angle !== undefined) lines.push(`${inner}orbit_angle = ${Number(planet.orbit_angle)}`);
  if (planet.size !== undefined) lines.push(`${inner}size = ${Number(planet.size)}`);
  if (planet.has_ring !== undefined) {
    lines.push(`${inner}has_ring = ${optionalBoolean(planet.has_ring, false) ? 'yes' : 'no'}`);
  }
  if (planet.name) lines.push(`${inner}name = ${escapeScriptString(String(planet.name))}`);
  if (planet.is_moon !== undefined) {
    lines.push(`${inner}is_moon = ${optionalBoolean(planet.is_moon, false) ? 'yes' : 'no'}`);
  }
  if (planet.init_effect) lines.push(`${inner}init_effect = ${escapeScriptString(String(planet.init_effect))}`);
  for (const [index, moon] of optionalArray(planet.moons).entries()) {
    lines.push(planetBlock(requireObject(moon, `${field}.moons[${index}]`), `${field}.moons[${index}]`, depth + 1));
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

/**
 * Write common/solar_system_initializers/ entries plus, optionally, a scripted effect that
 * spawns them as a cluster at a chosen distance band from the galactic centre.
 */
export function generateSolarSystemInitializerBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const systems = requireArray(args.systems, 'systems');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const source =
    optionalString(args.source) ??
    'common/solar_system_initializers/special_system_initializers.txt:2626 (The Chosen)';

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of systems.entries()) {
    const spec = requireObject(entry, `systems[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `systems[${index}].key`);
    const nameKey = optionalString(spec.name) ?? key;
    const starClass = requireString(spec.star_class ?? spec.class, `systems[${index}].star_class`);

    const lines = [
      `${key} = {`,
      `\tclass = ${escapeScriptString(starClass)}`,
      `\tname = ${escapeScriptString(nameKey)}`,
    ];

    const flags = optionalArray(spec.flags);
    if (flags.length > 0) {
      lines.push('\tflags = {');
      for (const flag of flags) lines.push(`\t\t${escapeScriptString(String(flag))}`);
      lines.push('\t}');
    }

    // `usage = misc_system_init` plus `usage_odds = 0` means the initializer is never placed by
    // galaxy generation and only appears when script spawns it.
    lines.push(`\tusage = ${escapeScriptString(optionalString(spec.usage) ?? 'misc_system_init')}`);
    lines.push(`\tusage_odds = ${Number(spec.usage_odds ?? 0)}`);
    lines.push(`\tprevent_anomalies = ${optionalBoolean(spec.prevent_anomalies, true) ? 'yes' : 'no'}`);

    const planets = optionalArray(spec.planets);
    if (planets.length === 0) {
      throw new ToolError(
        `systems[${index}].planets is empty; an initializer with no planets produces an empty system`,
      );
    }
    for (const [planetIndex, planet] of planets.entries()) {
      const field = `systems[${index}].planets[${planetIndex}]`;
      const spec2 = requireObject(planet, field);
      // `change_orbit` sets the orbit radius for everything that follows it, which is how
      // vanilla builds a ringworld: several pieces with orbit_distance = 0 and different
      // orbit_angle values share the orbit and close into a ring
      // (federations_initializers.txt:1908, shattered_ring_start).
      if (spec2.change_orbit !== undefined) {
        lines.push(`\tchange_orbit = ${Number(spec2.change_orbit)}`);
        if (spec2.class === undefined) continue;
      }
      lines.push(planetBlock(spec2, field));
    }
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key: nameKey, value: String(spec.title ?? key) });
    }
  }

  const scriptPath = `common/solar_system_initializers/${prefix}_initializers.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${systems.length} system initializer(s)`,
    }),
  ];

  // Optional companion: the scripted effect that actually puts the cluster on the map.
  const spawn = args.spawn ? requireObject(args.spawn, 'spawn') : null;
  if (spawn) {
    const effectKey = requireDefinitionKey(
      spawn.effect_key ?? `${prefix}_spawn_cluster`,
      'spawn.effect_key',
    );
    const initializers = optionalArray(spawn.initializers);
    const list = initializers.length > 0 ? initializers.map(String) : blocks.map((_, i) => systems[i].key ?? systems[i].id);
    const times = Number(spawn.times ?? list.length);

    const effectLines = [`${effectKey} = {`];
    const minDistance = spawn.min_distance !== undefined ? Number(spawn.min_distance) : 0;
    const maxDistance = spawn.max_distance !== undefined ? Number(spawn.max_distance) : 5;
    const direction = optionalString(spawn.direction);
    const hyperlane = optionalBoolean(spawn.hyperlane, true);

    // `spawn.bands` gives each spawn its own distance band - cycled through the spawns - so that
    // several systems placed in the same region stop competing for one spot. A band may set only
    // one of the two bounds; the other falls back to the top-level min_distance / max_distance.
    const bands = optionalArray(spawn.bands).map((entry, index) => {
      const band = requireObject(entry, `spawn.bands[${index}]`);
      return {
        min: band.min_distance !== undefined ? Number(band.min_distance) : minDistance,
        max: band.max_distance !== undefined ? Number(band.max_distance) : maxDistance,
      };
    });

    // `spawn.batch` wraps the group in `set_spawn_system_batch = begin` / `end`. Vanilla
    // (events/distant_stars_events_3.txt:1615-1618, distar.290 in distant_stars_events_2.txt)
    // batch-processes the spawns so the placement caches are recalculated once instead of per
    // system; without it the later spawns fail with "Failed to find position at minimum distance
    // SPAWN_SYSTEM_BUFFER_DISTANCE = 10 from other systems". It defaults to on whenever more than
    // one system is spawned, which is exactly when the caches matter.
    const batch = optionalBoolean(spawn.batch, times > 1);
    if (batch) effectLines.push('\tset_spawn_system_batch = begin');

    for (let i = 0; i < times; i += 1) {
      const initializer = list[i % list.length];
      const band = bands.length > 0 ? bands[i % bands.length] : null;
      const bandMin = band ? band.min : minDistance;
      const bandMax = band ? band.max : maxDistance;
      const parts = [
        `min_distance >= ${bandMin}`,
        `max_distance <= ${bandMax}`,
      ];
      if (direction) parts.push(`direction = ${escapeScriptString(direction)}`);
      parts.push(`initializer = ${escapeScriptString(String(initializer))}`);
      parts.push(`hyperlane = ${hyperlane ? 'yes' : 'no'}`);
      effectLines.push('\tspawn_system = {');
      for (const part of parts) effectLines.push(`\t\t${part}`);
      effectLines.push('\t}');
    }
    if (batch) effectLines.push('\tset_spawn_system_batch = end');
    effectLines.push('}');

    const effectPath = `common/scripted_effects/${prefix}_spawn_effects.txt`;
    const bandSummary =
      bands.length > 0
        ? `${bands.length} distance band(s)`
        : `the ${minDistance}-${maxDistance}% band`;
    files.push(
      generatedFile(effectPath, `${SCRIPT_HEADER(effectPath, 'events/first_contact_dlc_events.txt:6499 (The Chosen)')}${effectLines.join('\n')}\n`, {
        summary: `Spawns ${times} system(s) in ${bandSummary} of the galaxy radius${batch ? ', batch-processed with set_spawn_system_batch' : ''}`,
      }),
    );
  }

  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPath(language, prefix, 'initializers'),
        entries: localisationEntries,
        summary: 'System names',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'min_distance / max_distance take the comparison operator INSIDE the key (`min_distance >= 30`, `max_distance <= 75`) and are a 0-100 percentage of the galaxy radius from the centre. Writing `min_distance = 30` is not the same thing.',
  );
  result.messages.push(
    '`spawn.bands` gives each spawn_system call its own band - `bands: [{ min_distance: 0, max_distance: 4 }, ...]` - cycled in order, so several systems in the same region stop competing for one spot; a band may set just one bound and the other falls back to `spawn.min_distance` / `spawn.max_distance`.',
  );
  result.messages.push(
    '`spawn.batch` (default: on as soon as more than one system is spawned) wraps the group in `set_spawn_system_batch = begin` / `= end`, which is what vanilla does (events/distant_stars_events_3.txt:1615) so the placement caches are recalculated once instead of per system. Without it the later spawns fail with "Failed to find position at minimum distance SPAWN_SYSTEM_BUFFER_DISTANCE = 10 from other systems".',
  );
  result.messages.push(
    '`hyperlane = no` leaves the spawned system disconnected, which is how The Chosen\'s home and the L-Cluster are isolated; `hyperlane = yes` wires it into the surrounding network so the systems form a reachable cluster.',
  );
  result.messages.push(
    '`usage = misc_system_init` with `usage_odds = 0` keeps an initializer out of random galaxy generation - it then only exists when script spawns it. Without that, the systems also appear as ordinary random systems.',
  );
  result.messages.push(
    '`class` is a star class (vanilla: sc_g, sc_b, sc_black_hole, sc_neutron_star, sc_pulsar, ...). A planet entry\'s `class` is a planet class from common/planet_classes/, and its art comes from that class - so reusing `dyson_sphere_phase_05_entity` on a custom colonizable class is what puts a Dyson sphere in a planet slot.',
  );
  result.messages.push(
    'The spawn call needs a scope to run in: a `system_event` with `hide_window = yes` in its `immediate`, fired from an on_action (for example on_game_start via common/on_actions/) is the pattern vanilla uses.',
  );
  return result;
}


// ------------------------------------------------------------------------------------
// generate_planet_class_batch
// ------------------------------------------------------------------------------------

/**
 * Write common/planet_classes/ entries for artificial celestial bodies that can be colonised.
 *
 * Modelled on the two vanilla classes that do this: `pc_habitat` (habitat = yes,
 * district_set = habitat, planet_size = 6) and `pc_ringworld_habitable` (ringworld = yes,
 * district_set = ring_world, planet_size = 10, ideal = yes). `planet_size` on the class is the
 * body's size, and an initializer may override it per planet.
 *
 * Art is never invented here: the caller passes the entity and sprite names, which is what makes
 * it possible to reuse e.g. the Dyson sphere's own model (`dyson_sphere_phase_05_entity`) for a
 * body that behaves like a planet.
 */
export function generatePlanetClassBatch(args = {}) {
  const prefix = asciiKey(requireString(args.prefix ?? args.file_prefix, 'prefix'), { fallback: 'mymod' });
  const classes = requireArray(args.planet_classes ?? args.classes, 'planet_classes');
  const language = assertLanguage(args.language ?? 'english');
  const withLocalisation = args.generate_localisation !== false;
  const dryRun = args.dry_run !== false;
  const outputRoot = optionalString(args.output_root);
  const source =
    optionalString(args.source) ?? 'common/planet_classes/00_planet_classes.txt (pc_habitat, pc_ringworld_habitable)';

  const blocks = [];
  const localisationEntries = [];

  for (const [index, entry] of classes.entries()) {
    const spec = requireObject(entry, `planet_classes[${index}]`);
    const key = requireDefinitionKey(spec.key ?? spec.id, `planet_classes[${index}].key`);
    const title = requireString(spec.title, `planet_classes[${index}].title`);
    const entity = requireString(spec.entity, `planet_classes[${index}].entity`);
    const icon = requireString(spec.icon, `planet_classes[${index}].icon`);

    const lines = [`${key} = {`];
    // A body may take at most one of these shape flags; they are what the engine keys off.
    const shape = optionalString(spec.shape);
    if (shape) lines.push(`\t${shape} = yes`);
    lines.push(`\tentity = "${escapeScriptString(entity)}"`);
    if (spec.preview_entity) lines.push(`\tpreview_entity = "${escapeScriptString(String(spec.preview_entity))}"`);
    if (spec.picture) lines.push(`\tpicture = ${escapeScriptString(String(spec.picture))}`);
    lines.push(`\ticon = ${escapeScriptString(icon)}`);
    if (spec.icon_large) lines.push(`\ticon_large = ${escapeScriptString(String(spec.icon_large))}`);
    lines.push(`\tentity_scale = ${Number(spec.entity_scale ?? 1)}`);
    lines.push(`\tenable_tilt = ${optionalBoolean(spec.enable_tilt, false) ? 'yes' : 'no'}`);
    lines.push(`\tfixed_entity_scale = ${optionalBoolean(spec.fixed_entity_scale, true) ? 'yes' : 'no'}`);
    if (spec.place_entity_on_planet_plane !== undefined) {
      lines.push(`\tplace_entity_on_planet_plane = ${optionalBoolean(spec.place_entity_on_planet_plane, false) ? 'yes' : 'no'}`);
    }
    if (spec.entity_face_object !== undefined) {
      lines.push(`\tentity_face_object = ${optionalBoolean(spec.entity_face_object, false) ? 'yes' : 'no'}`);
    }
    if (spec.auto_trait_prio) {
      lines.push('\tauto_trait_prio = {');
      lines.push(`\t\t${escapeScriptString(String(spec.auto_trait_prio))}`);
      lines.push('\t}');
    }
    lines.push('\tatmosphere_color = hsv { 0.0 0.0 1.0 }');
    lines.push(`\tatmosphere_intensity = ${Number(spec.atmosphere_intensity ?? 1)}`);
    lines.push(`\tatmosphere_width = ${Number(spec.atmosphere_width ?? 0.5)}`);
    lines.push(`\tshow_city = ${optionalBoolean(spec.show_city, true) ? 'yes' : 'no'}`);
    if (spec.city_color_lut) lines.push(`\tcity_color_lut = "${escapeScriptString(String(spec.city_color_lut))}"`);
    lines.push(`\textra_orbit_size = ${Number(spec.extra_orbit_size ?? 0)}`);
    lines.push(`\textra_planet_count = ${Number(spec.extra_planet_count ?? 0)}`);
    lines.push(`\tchance_of_ring = ${Number(spec.chance_of_ring ?? 0)}`);
    // star bodies declare a range (vanilla pc_g_star: planet_size = { min = 20 max = 35 })
    if (spec.planet_size && typeof spec.planet_size === 'object') {
      if (spec.min_distance_from_sun !== undefined) {
      lines.push(`\tmin_distance_from_sun = ${Number(spec.min_distance_from_sun)}`);
    }
    if (spec.max_distance_from_sun !== undefined) {
      lines.push(`\tmax_distance_from_sun = ${Number(spec.max_distance_from_sun)}`);
    }
    if (spec.spawn_odds !== undefined) lines.push(`\tspawn_odds = ${Number(spec.spawn_odds)}`);
    lines.push(`\tplanet_size = { min = ${Number(spec.planet_size.min)} max = ${Number(spec.planet_size.max)} }`);
    } else {
      lines.push(`\tplanet_size = ${Number(spec.planet_size ?? 80)}`);
    }
    lines.push(`\tmoon_size = ${Number(spec.moon_size ?? 1)}`);
    lines.push(`\tcolonizable = ${optionalBoolean(spec.colonizable, true) ? 'yes' : 'no'}`);
    if (spec.district_set) lines.push(`\tdistrict_set = ${escapeScriptString(String(spec.district_set))}`);
    if (spec.starting_district) lines.push(`\tstarting_district = ${escapeScriptString(String(spec.starting_district))}`);
    if (spec.ideal !== undefined) lines.push(`\tideal = ${optionalBoolean(spec.ideal, false) ? 'yes' : 'no'}`);
    lines.push(`\tstarting_planet = ${optionalBoolean(spec.starting_planet, false) ? 'yes' : 'no'}`);
    lines.push(`\torbit_lines = ${optionalBoolean(spec.orbit_lines, false) ? 'yes' : 'no'}`);
    lines.push(`\thas_colonization_influence_cost = ${optionalBoolean(spec.has_colonization_influence_cost, false) ? 'yes' : 'no'}`);
    lines.push(`\tclimate = "${escapeScriptString(optionalString(spec.climate) ?? 'artificial')}"`);
    lines.push(`\tis_artificial_planet = ${optionalBoolean(spec.is_artificial_planet, true) ? 'yes' : 'no'}`);
    if (spec.default_planet_selection !== undefined) {
      lines.push(`\tdefault_planet_selection = ${optionalBoolean(spec.default_planet_selection, false) ? 'yes' : 'no'}`);
    }
    if (spec.modifier) lines.push(`\tmodifier = {\n\t\t${String(spec.modifier).replace(/\n/g, '\n\t\t')}\n\t}`);
    lines.push('}');
    blocks.push(lines.join('\n'));

    if (withLocalisation) {
      localisationEntries.push({ key, value: title });
      if (spec.desc) localisationEntries.push({ key: `${key}_desc`, value: String(spec.desc) });
    }
  }

  const scriptPath = `common/planet_classes/${prefix}_planet_classes.txt`;
  const files = [
    generatedFile(scriptPath, `${SCRIPT_HEADER(scriptPath, source)}${blocks.join('\n\n')}\n`, {
      summary: `${classes.length} planet class(es)`,
    }),
  ];
  if (withLocalisation) {
    files.push(
      localisationPlan({
        language,
        path: localisationPath(language, prefix, 'planet_classes'),
        entries: localisationEntries,
        summary: 'Planet class names',
      }),
    );
  }

  const result = finishGeneration({ dryRun, outputRoot, files });
  result.language = language;
  result.messages.push(
    'A colonisable class needs a district_set and a starting_district, or the colony has no districts to build; vanilla pairs are habitat/district_hab_housing and ring_world/district_rw_city.',
  );
  result.messages.push(
    'planet_size on the class is the body default, and an initializer may override it per planet (size = 80). To have the body render as an existing model, pass that model as entity - this is how a Dyson sphere model ends up in a planet slot.',
  );
  result.messages.push(
    'Do not copy @variables such as @carry_cap_high from a vanilla file unless you define them yourself; they are resolved at parse time and an undefined one is an error.',
  );
  result.messages.push(
    'The sprite in icon / icon_large must exist; validate_stellaris_interface reports unknown sprite names. Entities are not checked by that tool, so verify the entity name against the install (gfx/models/**.asset).',
  );
  return result;
}

export default { generatePlanetClassBatch, generateSolarSystemInitializerBatch };
