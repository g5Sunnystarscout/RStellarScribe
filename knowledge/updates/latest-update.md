---
title: Version reality check - 4.1.7 verified, 4.4.6 in use
---

## What this knowledge base was actually verified against

Every topic in this build was field-checked against a **live Stellaris 4.1.7 "Lyra"**
installation (`D:\SteamLibrary\steamapps\common\Stellaris`, one DLC folder), not against
the wiki. Where the wiki disagreed with the installed files, the files won, and 4.1.7 is
the version recorded in each topic's `verified_version` field.

**That is not necessarily the copy you play.** A second, fully patched install is common:

| Install | Version | `modsCompatibilityVersion` | DLC folders |
| :--- | :--- | :--- | :--- |
| `D:\SteamLibrary\steamapps\common\Stellaris` | `Lyra v4.1.7` | *(absent)* | 1 |
| `<Stellaris>` | `Pegasus v4.4.6` | `4.4` | 35 |

Always run `discover_stellaris_environment` first and read the version it reports. When
more than one install exists it now reports **all** of them with their versions and marks
the result ambiguous, because picking the wrong copy silently validates a mod against the
wrong game. Pin your own copy once with `RSTELLARISCRIBE_GAME_ROOT`, or pass `game_root`.

## What was cross-checked against 4.4.6

Every field, key and asset name that a species-class mod depends on was compared between
the two installs and is present in both, with equal or higher counts in 4.4.6:
`archetype`, `trait = "<key>"`, `random_weight`, `graphical_culture`,
`move_pop_sound_effect` in `common/species_classes/`; `trait_lithoid`, `trait_organic`,
`allowed_archetypes`, `immortal_leaders` and the four trait modifiers used
(`planet_jobs_physics_research_produces_mult`, `planet_pops_food_upkeep_mult`,
`pop_environment_tolerance`, `logistic_growth_mult`) in `common/traits/`;
`species_class` in `common/portrait_sets/`; `sets` in `common/portrait_categories/`;
the `organic` trait tag; the `arthropoid_01` graphical culture; and the portrait
definitions `art3`, `art19`, `mol5`, `mol13`, `lith1`, `lith5`.

## What has NOT been re-verified

The other topics have not been re-read against 4.4.6. Field names that survived from
4.1.7 to 4.4.6 in the systems above very likely hold elsewhere too, but "very likely" is
not verification. Treat a 4.1.7 claim as follows: the field name is a good guess to grep
for, and the recorded failure mode is still worth reading, but confirm the name in your
own install before shipping. `validate_stellaris_project` with `game_root` set now also
warns when a mod's `supported_version` does not match the install it was checked against,
which is the fastest way to notice that you are validating against the wrong copy.

## What the live 4.1.7 files overturned

The vanilla files overturned several widely repeated claims. The knowledge topics record
each correction next to the evidence, and the most important ones are:

- `common/custom_tooltips/` does not exist. Custom tooltips are the `custom_tooltip = <key>`
  and `custom_tooltip = { fail_text = <key> ... }` forms only.
- `common/game_rules/` holds scripted trigger blocks, not `default`/`setting` pairs, and
  `has_game_rule` is not valid syntax in 4.1.7.
- On_action blocks accept `events` and `random_events` only; there is no `chance_to_fire`.
- `common/archaeological_site_types/` is plural-typed and singular-named; there is no
  `common/archaeological_sites/`, and archaeological sites have no `rewards` field.
- Decisions need no `decisions = { }` wrapper, and planetary decisions live in the same
  `common/decisions/` folder as country decisions.
- `common/buildable_districts/`, `common/strike_craft/` and `common/event_modifiers/`
  do not exist; 4.0 added `common/zones/` and `common/zone_slots/`.
- `common/name_lists/*.txt` ships **with** a UTF-8 BOM, so a BOM in a script file is
  tolerated by the engine even though localisation is the only place it is required.
- `is_repeatable` does not occur in any technology file, and `major` does not occur in
  any event file.

## Prefer the live files over this snapshot

`discover_stellaris_environment` reports the install it can see. When a topic and your
own install disagree, the install is right; the topic gives you the field names to grep for
and the failure mode to expect when they are wrong.

## Version coverage

The topics mark the version they were checked against. Systems that 4.0 rewrote - pops,
jobs, districts, buildings, zones, traditions - carry both writings where a 3.x form is
still worth knowing, and say plainly when an older form no longer loads.
