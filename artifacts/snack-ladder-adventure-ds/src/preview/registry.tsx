import { lazy, type ComponentType } from 'react';
import { ColorsPage, FontsPage, LayoutPage, OverviewPage } from './foundations';
function lazyPage(load: () => Promise<ComponentType>) { return lazy(async () => ({ default: await load() })); }
const ButtonDemo = lazyPage(() => import('./demos/button').then((m) => m.ButtonDemo));
const CardDemo = lazyPage(() => import('./demos/card').then((m) => m.CardDemo));
const BadgeDemo = lazyPage(() => import('./demos/badge').then((m) => m.BadgeDemo));
const InputDemo = lazyPage(() => import('./demos/input').then((m) => m.InputDemo));
const AvatarDemo = lazyPage(() => import('./demos/avatar').then((m) => m.AvatarDemo));
export type PreviewEntry = { id: string; name: string; description: string; Page: ComponentType };
export type NavGroup = { name: string; entries: PreviewEntry[] };
export const DESIGN_SYSTEM = { title: 'Snake & Ladder Adventure', description: 'Midnight-blue surfaces, gold actions, playful type and bright board colors.' } as const;
export const OVERVIEW_ENTRY: PreviewEntry = { id: 'overview', name: 'Overview', description: 'Visual foundations extracted from the game.', Page: OverviewPage };
export const NAV_GROUPS: NavGroup[] = [
 { name: 'Brand', entries: [] },
 { name: 'Colors', entries: [{ id: 'color-roles', name: 'Color roles', description: 'Brand and semantic color roles.', Page: ColorsPage }] },
 { name: 'Fonts', entries: [{ id: 'type-scale', name: 'Type scale', description: 'Display, body and status type.', Page: FontsPage }] },
 { name: 'Layout', entries: [{ id: 'spacing-radius', name: 'Spacing and radius', description: 'Spacing rhythm and corner treatments.', Page: LayoutPage }] },
 { name: 'Actions', entries: [{ id: 'button', name: 'Buttons', description: 'Primary, secondary and danger actions.', Page: ButtonDemo }] },
 { name: 'Forms & inputs', entries: [{ id: 'input', name: 'Input', description: 'Text entry and focus states.', Page: InputDemo }] },
 { name: 'Data display', entries: [{ id: 'card', name: 'Card', description: 'Grouped content on game surfaces.', Page: CardDemo }, { id: 'badge', name: 'Badge', description: 'Compact status/category labels.', Page: BadgeDemo }, { id: 'avatar', name: 'Avatar', description: 'Player identity and fallback states.', Page: AvatarDemo }] },
 { name: 'Overlays & navigation', entries: [] }, { name: 'Content', entries: [] }, { name: 'Charts', entries: [] }, { name: 'Motion', entries: [] }, { name: 'Applied examples', entries: [] },
 ];
export const ALL_ENTRIES: PreviewEntry[] = [OVERVIEW_ENTRY, ...NAV_GROUPS.flatMap((group) => group.entries)];
const duplicateIds = ALL_ENTRIES.map((entry) => entry.id).filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error('Duplicate preview ids: ' + [...new Set(duplicateIds)].join(', '));