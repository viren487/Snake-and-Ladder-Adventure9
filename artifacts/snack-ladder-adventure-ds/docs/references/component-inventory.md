# Component inventory (source-backed extraction)

Scope: active Snake & Ladder Adventure web UI source. Product rules, navigation, board rendering, animated game pieces, powers and dialogs remain app compositions, not cross-screen primitives. The workspace also contains a broad unused starter library; it is not presented as extracted product coverage.

## Pilot component families — complete set

| Family | Source evidence | Why included |
| --- | --- | --- |
| Button | src/components/ui/button.tsx and game action styles in src/index.css | Shared actions with focus and disabled states. |
| Card | src/components/ui/card.tsx; used in src/pages/not-found.tsx | Bounded content and error surfaces. |
| Badge | src/components/ui/badge.tsx and status-chip styles in src/index.css | Compact status/category labels. |
| Input | src/components/ui/input.tsx and game form styles in src/index.css | Consistent text entry and focus. |
| Avatar | src/components/ui/avatar.tsx and player identity visuals | Reusable player identity/fallback. |

This is the complete product-agnostic primitive inventory. Board tiles, dice, power glyphs, player tokens and gameplay overlays remain product-specific app components.