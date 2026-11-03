> Earlier implementation notes. For current behaviour, start with the [README](../README.md).

# October workflow fixes — v0.4, 3 November 2026

- Shared analysis period with October 2026 preset; NASA POWER primary and ERA5 archive alternative. Loads pre-period training history while keeping the display/test window explicit.
- Rolling one-day-ahead historical test with 31 predictions, references and errors. Method selection is fixed before the period and training excludes targets after each origin. No artificial day-to-day variation is added.
- The constant seven-day mean is retained as a labeled benchmark; regression can be manually selected for experiments. Automatic selection still uses validation.
- Archived model comparison uses exact matching coordinates/dates and is labeled stitched historical output, not an equal-lead forecast.
- Farm and daily weather editing are accessible from all screens. Weather edits are marked unverified and backed up for restoration. Model caching includes source contents/version/mode/method/period.
- Saved farm analysis and archived comparison survive reload. Historical review and simulations respect the selected month. Simulations can cover up to 92 continuous days.
- Suggested actions are restored across overview, forecasts/tests and simulations. Moderate rainfall/irrigation conditions still receive contextual checks; scenario actions respond to actual model flags/losses and ET₀ assumptions.
- Journals and farm profile were preserved. No journal NLP was added.

Verification: the live saved-farm NASA request loaded 761 daily records ending 2026-10-31, including all 31 October days and training history. The browser displayed changing daily predictions, reference values, test scores and an archived comparison for the same October dates. A full-month simulation returned 31 balances and dynamic actions. Reload preserved the fitted analysis. Weather edit/restore and future-data isolation are covered by automated tests. Final automated suite: 49 passing tests.

The earlier v0.3 report remains historical context. These fixes do not establish farm-scale forecast accuracy, crop survival prediction or agronomic validation. Historical guidance uses the saved crop/stage as explicit scenario context.
