---
name: Mobile artifact status
description: Native mobile is active again; align its game screen with the website while preserving touch controls.
---

The user explicitly resumed mobile work on October 8, 2026 and repeatedly asked for mobile's appearance and gameplay to match the website as closely as possible. Both the browser game and Expo app are active.

**Why:** The web and mobile clients have separate UI implementations, so visual changes do not carry across automatically. The user noticed the difference and asked for parity.

**How to apply:** Treat the phone-width website as the visual and behavior baseline for native mobile. Preserve touch sizing, board-first launch and all saved rounds; the user chose text-only room chat on mobile, so do not add voice unless they change that choice. Keep clients aligned when gameplay changes. Do not build an APK unless explicitly asked.

## Mobile testing

Replit's built-in Android Emulator is available in the desktop Project Editor, not inside the Replit mobile app. The desktop emulator can preview an Expo app without Expo Go on a personal phone; testing directly on a phone uses Expo Go. A mobile website route is not a substitute for the native Expo app. An installable Android package is separate work and should only be built when explicitly requested.

**Why:** The user expects a functioning native preview rather than a mobile web route or an automatically generated APK. The desktop editor's emulator is not available inside the Replit mobile app.

**How to apply:** Use the desktop Project Editor's Android Emulator for device testing without a personal phone; use Expo Go for personal-phone testing. Keep the explicitly chosen board-first launch and preserve all saved rounds. Do not tell the user to open the desktop emulator inside Replit mobile.

The user explicitly chose a board-first launch on October 8, 2026. Wait for local storage, then resume the most recently updated local round; if none exists, create a fresh two-player Pass & Play board. Put player, mode, and room setup behind “New Game,” and keep all other saved rounds intact.

**Why:** The user said the mobile app should open like the website rather than showing a separate setup screen first.

**How to apply:** Preserve this launch choice in future mobile navigation changes. Do not clear or replace saved rounds while selecting the latest round.

## Mobile launch screen

The launch loading screen is mobile-only and temporary; the game board remains the first destination after startup.

**Why:** On October 9, 2026, the user asked for a loading page when opening the mobile app and explicitly said not to add it to the website. This is compatible with the earlier board-first choice because the loader is only a brief startup transition.

**How to apply:** Keep the loader out of the web artifact and do not replace the resumed game board with a persistent intro or setup screen.

## React Native SVG web compatibility

In this Expo web preview, `react-native-svg` forwards `accessible={false}` and `originX`/`originY` as invalid DOM attributes. For decorative SVGs, use `aria-hidden={true}`; for centered rotations, use the SVG `transform` string rather than legacy rotation/origin props.

**Why:** Those props triggered visible React error notices over the mobile game preview.

**How to apply:** When adding SVG icon art shared between native and web, verify the Expo web preview and avoid props that become invalid HTML/SVG attributes.

## Sound scope

Use short action sound effects for dice, panda movement, ladder climbing, snake bites, bullet collection and key collection. Give bullet and key pickups distinct sounds. Do not add background music during active gameplay. Post-match winner dance music is now explicitly requested.

**Why:** The user explicitly requested these effects, later asked for separate bullet/key pickup sounds, and said not to add background music. They subsequently requested music for the winners’ post-match dance, so that is a scoped exception.

**How to apply:** Keep audio event-driven and non-looping; audio failure must never block a turn.

## Game-focused controls

Prefer compact symbols and counts for powers, with detailed actions and rules revealed on request rather than permanently occupying space.

**Why:** The user asked that the power stash take less space so the game feels easier, and that rules stay hidden until clicked.

**How to apply:** Keep the board and dice prominent. On phone-width browsers, center the tappable die directly below the board, align colorful power icons beside it, and use a compact turn label instead of a large panel or separate roll button. Fill the open left area with the current player's gun/ammo and aim/fire controls. Replace the quest card with that player's Torch → Key → Crown progress and a clear next task.

## Playability constraint

Collectible and gate rules must not permanently trap a panda because a roll skipped a key or a snake returned it behind a gate.

**Why:** The user reported that pandas stopped moving regardless of subsequent dice values. Requiring exact key landings and repeatedly charging already opened gates caused unreachable progress.

**How to apply:** When changing movement rules, account for skipped squares, ladder shortcuts, snake backtracking and older saved rounds. Preserve a route to progress rather than resetting saved games.

## Browser keys and ammunition

Key and crown progression follows the crown quest described in crown-quest.md; do not revive movement-blocking gates. Bullets are collected only when the panda stops on a bullet room, including a snake's final destination—not when crossing a tile or taking a ladder past it. Keep the five-bullet cap. Fire is available only when the panda stops in a gun room. Aim choices are 98, 99, or both; each targeted snake costs one bullet, so both requires two. A hit makes that snake harmless only for the shooter’s next three dice rolls; the countdown advances on that player’s rolls, not the opponent’s.

**Why:** The user reiterated the exact-room requirement with room 6: stopping on 6 rewards a bullet; crossing 6 and continuing does not. Firing must remain at gun rooms, with single-target and both-target aiming restricted by available bullets.

**How to apply:** Apply gameplay behavior and feedback changes to both web and mobile. Preserve inventory, firing, per-player countdowns, quest progress, turn messages and the user's saved rounds.

## Saved-round compatibility

Older browser rounds must retain players, positions, ammunition and turn progress. Preserve obsolete keys as history, not as crown keys. Do not grant retroactive ammunition from a saved position. If a save cannot be understood safely, preserve it and show an explicit warning rather than silently replacing it.

**Why:** Browser updates should not erase an existing round or invent pickups that never occurred.

**How to apply:** Default absent ammo, stun and quest fields when migrating; validate present fields before loading. Keep earlier browser save versions intact during upgrades.

## Required animation visibility

Do not rely on a timed smooth scroll to make short gameplay effects visible. Position the viewport synchronously before starting a shot, or explicitly wait for scrolling to finish.

**Why:** Browser checks found that smooth scrolling could leave the upper-board snake targets offscreen for the entire short firing animation, despite correctly resolving the shot. Direct instant document scrolling made the target area visible.

**How to apply:** On both clients, establish visibility before playing a short animation when controls and action areas are separated on narrow screens, then restore the controls afterward.

## Snake and ladder movement

Panda movement on mobile should reproduce the website's step hops, ladder climb, snake slide and bamboo return path rather than using a plain glide.

**Why:** On October 9, 2026, the user specifically asked for mobile panda movement to be the website version after noticing the two clients moved differently. They had earlier asked that snake and ladder movement be slower and playful.

**How to apply:** Treat the website's timing, easing, body motion and return route as the source of truth. Keep native reduced-motion behavior and turn completion synchronized with the visible animation.