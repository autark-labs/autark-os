# Release Warning Baseline

The free-release build treats compiler, type-check, test, lint, and Vite deprecation warnings as release blockers unless this file names a narrowly scoped exception.

## Fast Refresh export advisory

The `react-refresh/only-export-components` ESLint advisory is disabled. Autark-OS intentionally keeps small presentational helpers and stable view-model constants next to the components that use them. React Fast Refresh invalidates those modules safely; this affects local development refresh granularity, not runtime behavior or release correctness.

All React hook dependency warnings remain enabled and must be fixed by stabilizing the relevant values or callbacks rather than by disabling the rule.

## Bundle-size review

`yarn --cwd frontend build` reports production asset sizes. The current largest route chunk is `MonitoringChartsSection` at approximately 374 kB (109 kB gzip). It is loaded only when the monitoring charts section is opened and includes the charting dependency, so it is not part of the initial application bundle.

This is a recorded baseline, not a reason to make speculative micro-optimizations. Reassess the chunk when its route boundary changes, a new heavy visualization dependency is added, or its gzip size grows materially. Keep route-level lazy loading in place unless a measured user flow shows that it harms usability.
