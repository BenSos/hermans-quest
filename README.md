# Herman's Quest

A 3D top-down action rogue-lite for the browser. Built by Ben, Cole and Claude.

## Play it

**Easiest:** double-click `play.html`. It opens in your browser, no install needed.

**For development** (needs Node.js 18+ from nodejs.org):

```
npm install
npm run dev
```

Then open the link it prints. To play on the iPad, use the "Network" link it prints
(the iPad must be on the same Wi-Fi as the Mac).

`npm run build` makes a fresh single-file `dist/index.html` (that's what `play.html` is).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | WASD or arrow keys | Drag anywhere on the screen |
| Dash | Space | DASH button |
| Jump over rocks, bushes, signs, chests, monsters | Shift | JUMP button |
| Switch weapon | 1 / 2 / 3 / 4, or Q to cycle | Weapon button, or tap a weapon slot |
| Rocks (slot 4, empty hands) | E lifts, E aims, WASD moves the gold circle, E throws | LIFT / AIM / THROW button, joystick moves the circle |
| Attack | Automatic: the sword swings while walking, boomerang and bow fire when you stop | Same |
| Read / interact / talk to shopkeepers | E | Tap the bubble |
| Pause and settings | Esc or P | Gear button |
| Sandbox panel (Sandbox mode) | B | Sandbox button |
| Unlock a door | Walk into it with the right key | Same |

## Where things live

| Folder | What's inside |
| --- | --- |
| `src/world/world.ts` | **The Adventure map:** the 4 Greenmeadow screens and the 7 Ogre Keep rooms, drawn with letters, plus which doors connect, which are locked, what's in each chest and which monsters live where |
| `src/world/village.ts` | Oakhollow's houses, Bob, Jerry, the training dummy, well, barrels and Ben and Cole's secret button |
| `src/game/save.ts` | Gold, shop upgrades and gear: prices, what each one does, and saving in the browser |
| `src/world/greenmeadow.ts` | The first meadow screen (also the Arena), drawn with letters. Edit it to move trees, rocks and flowers. |
| `src/world/dungeon.ts` | The Dungeon: map letters at the top (walls, torches, pillars, braziers, lava, bridge) |
| `src/entities/herman.ts` | Herman's model and walk animation |
| `src/entities/slime.ts` | Green, blue and mini slimes |
| `src/game/weapons.ts` | Sword, boomerang and bow: ranges, damage, speeds (tweak `WEAPON_STATS`) |
| `src/game/waves.ts` | The 30 waves, bosses every 10th wave, hearts and the boss key |
| `src/game/powerups.ts` | Every power-up, its rarities and the odds (tweak `RARITIES` weights) |
| `src/entities/skeleton.ts`, `ogre.ts` | Skeleton warriors, archers, the Bone King; ogres and Grumbok |
| `src/fx/telegraph.ts` | The red danger zones that warn before big attacks |
| `src/fx/` | Sword slashes, sparks, goo, target ring, dash ring |
| `src/world/` | Ground, grass, river, trees, windmill, chest and other props |
| `src/game/` | Camera, lighting, collision |
| `src/ui/` | Hearts, weapon slot, Look Options panel, styles |
| `src/core/` | Renderer, toon shading and outlines, input |
| `src/core/sfx.ts` | Every sound effect, made with code (no sound files). Tweak pitches and lengths here. |

## Phase log

- **Phase 0 · Look and Feel:** one Greenmeadow screen, Herman walking, tilted camera, toon shading,
  outlines, shadows, glow, swaying grass, flowing river, windmill, slimes (harmless for now),
  keyboard and touch movement, Look Options panel to compare camera tilt, time of day,
  Herman's tabard color, outlines and glow.
- **Phase 1 · Combat Core:** sword (auto-swings while walking), boomerang and bow (fire when
  stopped), arrows that land and get picked up or fly home when a wave is cleared, dash with a
  1.5 second cooldown, 5 hearts with half-heart hits, green and blue slimes (blue ones split),
  heart drops, practice waves in Greenmeadow, pause menu with tabard color, outlines and glow,
  touch buttons for dash and weapon switching. Camera at 45 degrees, morning light.
- **Phase 2 · Monsters, Bosses and Loot** (pulled forward at the Phase 1 check-in): camera angle
  and morning/noon/night back in the pause menu; waves 1-9 slimes, 10 Gloopus the King Slime,
  11-19 skeletons (warriors and archers), 20 Ossian the Bone King, 21-29 ogres, 30 Grumbok the
  Ogre King, then mixed waves; bosses hit for 1.5 hearts; boss key opens the chest; pick 1 of 3
  power-ups rolled from Common (35%) to Mythic (2%); poison, fire and acid; practice jump-to-wave.
- **Rock throwing** (Cole's idea): empty-hands slot (4); lift any rock in the meadow, aim a gold
  circle anywhere on the screen with WASD, throw. Everything in the circle: regular monsters are
  knocked out, ogres lose half their health, bosses take 8. Rocks stay where they land (river rocks
  wash back home), so you can throw them again.
- **The Dungeon:** a second map the same size as Greenmeadow, picked in the pause menu (Map). Torch-lit
  stone hall, lava channel with one stone bridge, pillars, braziers, no exits and no rocks (sword,
  boomerang and bow only). Same waves, bosses, key, chest and power-ups. Switching maps restarts the run.
- **Phase 3 · Ogre Keep:** a title screen to pick **Adventure** or **Arena** (switch any time in the pause
  menu). Adventure: four connected Greenmeadow screens (Greenmeadow, North Road, East Fields, Ogre Keep
  Gate) with monsters, rocks and wooden chests, then Ogre Keep: Entrance Hall, Guard Room (small key),
  Lava Crossing (shoot the blue crystal with the bow or boomerang to raise a bridge), Ogre Den (Big Key),
  Archer Gallery, Fountain Room (healing fountain, silver chest), and Grumbok's Throne. Doors slam shut
  until a room is cleared. Grumbok drops a Heart Container (+1 max heart) and a golden chest with the best
  odds. Chest odds: wooden mostly Common, silver up to Legendary, gold up to Mythic. Mini-map, key counter,
  screen fades. Sound effects for everything (pause menu On/Off). Arena mode is the old waves game.
- **Sandbox mode** (Cole's idea): a third choice on the title screen. The Sandbox panel (Sandbox button
  or B) lets you pick how many of each monster to spawn (including the three bosses), start waves at any
  wave from 1 to 60 (or stop them), add any power-up at any rarity and remove them again, turn on
  "can't lose hearts", heal, and switch between Greenmeadow and the Dungeon. Restarting keeps your power-ups.
- **Connected world** (Cole's idea): in Adventure the Greenmeadow screens sit side by side like one big map,
  so past each edge you see the next field instead of empty space. Walking off an edge slides the camera
  over to the next screen (Zelda style). Keep rooms slide the same way; only the keep gate fades.
  Neighbor screens skip shadows to stay fast.
- **Phase 4 · Village and Progression:** Adventure starts in **Oakhollow Village** (south of Greenmeadow).
  Monsters and chests drop gold coins, and Herman keeps all of it when he falls (he wakes up in Oakhollow).
  **Bob's Smithy** sells sword, boomerang and archery mastery; the **Training Yard** board sells Vitality,
  Swiftness, Bigger Quiver and Lucky Find; **Jerry's Armory** sells helmets, armor, boots and charms you keep
  forever. A straw training dummy shows your damage. Greenmeadow grows to 8 screens in a 3 x 3 map around
  the village (West Woods, Bramble Hollow, Old Orchard, Mill Pond). Gold, upgrades and gear save in the
  browser (erase from the pause menu). Cole's extras: **Shift jumps** over rocks, bushes, signs, chests and
  monsters (and dodges ground attacks), Herman can **wade through rivers and ponds** (half speed, with
  splashes), and a **secret button** in Oakhollow's back-left corner says the game was made by Ben and Cole
  (10 gold the first time).
- **Phase 4 extras (Cole):** Herman now wears everyday clothes (pick shirt and pants colors in the pause menu)
  and the gear you buy from Jerry shows on him: Leather Cap, Iron Helm, Knight's Helm with plume; Padded Vest,
  Chain Mail, Plate Armor with a cape; Soft, Swift and Wind Boots; and a charm on a cord. The secret button
  must be pressed (E or tap) and is solid. The well is solid, has moving water, and butterflies fly around
  it. Flowers come in daisies, tulips and bluebells. Jump the back hedge in Oakhollow to find the Secret
  Clearing and its "Ah, you cheater!" chest (50 coins).
