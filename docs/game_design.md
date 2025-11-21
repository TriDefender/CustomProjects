# 2.5D Cartoon Third-Person Shooter Design

## Vision and Pillars
- **Lighthearted 2.5D style:** Tilted camera and chunky outlines reinforce a playful vibe while keeping spatial readability.
- **Sound-driven stealth and chaos:** Weapon loudness dynamically shapes enemy behavior; smart use of silencers and spacing is key.
- **Readable AI states:** Clear patrol routes, alert animations, and firing tells help players plan reactions.

## Player Kit
### Movement
- Eight-direction movement with a slight aim-offset to accentuate the 2.5D angle.
- Short dodge-roll on a cooldown; grants brief damage reduction but increases noise slightly.

### Weapons
| Slot | Concept | Fire Rate | Damage | Noise Radius | Notes |
| ---- | ------- | --------- | ------ | ------------ | ----- |
| Primary (quiet) | Suppressed repeater | High | Medium | Small | Ideal for stealth; small muzzle flash and cartoon "plink" audio. |
| Secondary (loud) | Thumper blaster | Low | High | Large | Massive comic-book blast VFX; knocks back light enemies. |

- Noise is emitted per shot; radius scales with weapon type and is reduced by obstacles using simple ray checks.
- Enemies inside the radius enter **Alert** and bias their search toward the sound source.
- A stackable **anxiety meter** tracks repeated loud shots; if it fills for a group, they may call reinforcements from nearby spawners.

### Progression Hooks
- Cosmetic skins for both weapons.
- Mods: extended magazines (quiet gun), slug rounds (loud gun), and muzzle toys that slightly alter noise.

## Enemies
### Behavior States
1. **Patrol**
   - Follows predefined waypoints with idle pauses and head-turn sweeps.
   - Limited peripheral vision; can miss the player when behind cover.
2. **Alert**
   - Triggered by: hearing a noise, seeing a suspicious silhouette, or finding a KOed ally.
   - Selects a **search origin** (sound direction or last known player position) and walks a widening spiral.
   - Timer-based; reverts to Patrol if nothing is found.
3. **Attack**
   - Engages when the player is confirmed in sight.
   - Uses cover if available; suppresses in bursts while flanking teammates reposition.

### Weapons (per-enemy randomized loadouts)
| Archetype | Fire Rate | Damage | Noise Radius | Special |
| --------- | --------- | ------ | ------------ | ------- |
| Chipper | High | Low | Small | Forces player to respect chip damage; often guards corners. |
| Grunt | Medium | Medium | Medium | Baseline soldier. |
| Bomber | Low | High (splash) | Large | Telegraphs throws; panic-causing noise. |

- Each spawn rolls a loadout from the archetype table; noise radius directly influences how many allies can be pulled into Alert.
- A rare **silenced elite** rolls a reduced-noise variant, encouraging players to listen carefully.

### Detection Rules
- Field of view: 90° forward cone; reduced detection in rain or heavy VFX moments to keep fairness.
- Hearing: Any noise event within radius triggers Alert; direction is estimated with ±20° error unless noise is extremely loud.
- Friendly fire is disabled to preserve cartoon tone, but enemies do flinch when allies are shot nearby, pausing their attack.

## Systems Design
### Sound Propagation
- Each shot emits a `NoiseEvent(loudness, position, decayTime)`.
- Query all enemies within `baseRadius * loudnessMultiplier`; apply line-of-sight dampening per obstacle hit.
- Enemies queue a **sound investigation task** that overrides Patrol until resolved or timer expires.

### AI State Machine Sketch
```pseudo
state Patrol:
  follow_waypoints()
  if see_player(): -> Attack
  if hear_noise(): set search_target(noise_direction); -> Alert

state Alert:
  move_to(search_target)
  perform_search_pattern()
  if see_player(): -> Attack
  if timer_expired(): -> Patrol

state Attack:
  take_cover_if_possible()
  fire_in_bursts(loadout)
  if lose_sight(): set search_target(last_seen_position); -> Alert
```

### Camera & Controls
- 2.5D camera pitched 25–35° with a mild orbit lock; dynamic zoom out during loud firefights.
- Aim assist cone for controllers; snap-to-target only when in Attack to maintain challenge during stealth.

### Level & Encounter Notes
- Use layered paths for flanking (elevated catwalks plus ground) to emphasize 2.5D depth.
- Place sound-reactive props (alarms, pans, rubber chickens) that amplify noise if shot.
- Patrol clusters of 3–5 enemies with overlapping but not identical routes to create stealth windows.

## Content Pipeline
- Stylized shaders with thick outlines; physics-based hits spark exaggerated stars.
- Animation: patrol swagger, exaggerated alert "!?" pop, and recoil squash-and-stretch.
- Audio: distinct quiet vs loud weapon motifs; enemy VO barks for state changes to help debugging.

## Tuning Hooks
- Expose in config: noise radius per weapon, alert duration, search spiral radius growth, anxiety threshold, and reinforcement cooldowns.
- Add debug overlays: vision cones, sound rings, and AI state labels for quick iteration.
