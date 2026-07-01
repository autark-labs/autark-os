# Project OS Styling Cleanup

Pages should use Tailwind mainly for layout, sizing, and one-off positioning. Reusable visual styling should live in small primitives or feature components.

Preferred:

```tsx
<Surface tone="panel" className="p-3">
  ...
</Surface>
```

```tsx
<ProjectDarkControlButton onClick={onRestart}>
  Restart
</ProjectDarkControlButton>
```

Discouraged:

```tsx
<div className="rounded-xl border border-sky-400/20 bg-slate-800 p-3 shadow-xl shadow-slate-950/30">
  ...
</div>
```

Raw Tailwind colors are acceptable for local status meaning. Shared surface, panel, border, and action colors should move through semantic variables or reusable primitives as pages are touched.

## Current Reference Pages

Applications uses `PageShell`, `PageHeader`, `Surface`, `MetricCard`, `ProjectEmptyState`, shared Project OS button primitives, and application-specific card wrappers.

Home uses `PageShell`, `Surface`, `StatusPill`, and the same shared Project OS button primitives, with homepage-only cards and timeline components under `pages/OverviewPage/components`. Keep feature-specific composition local until a second page needs the same component.

Access uses `PageShell`, `Surface`, `StatusPill`, shared Project OS button primitives, and local `NetworkPanel`/`NetworkInset` wrappers under `pages/NetworkPage`. Use this pattern for operational pages that need slate panels, blue borders, and compact actionable sections without bringing back broad `po-*` styling helpers.

Avoid importing the legacy broad `ProjectOSComponents` styling helpers into pages as they are cleaned up. If a page needs one of those patterns, copy the visual decision into a small primitive or feature component and keep `className` available for layout tweaks.
