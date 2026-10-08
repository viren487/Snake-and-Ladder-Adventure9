---
name: React Native SVG gradient offsets
description: Avoid invalid SVG gradient offset warnings in Expo Android builds.
---

Use numeric fractions for `react-native-svg` gradient stop offsets and opacity values rather than decimal strings such as `".3"` or `".58"`.

**Why:** Expo's Android runtime reported those decimal strings as invalid number or percentage values while rendering the mobile board artwork.

**How to apply:** When editing SVG `<Stop>` values in the Expo app, prefer `offset={0.3}` and `stopOpacity={0.58}`; verify Android logs if the warning returns.
