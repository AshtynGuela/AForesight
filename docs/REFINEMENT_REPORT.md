> Earlier implementation notes. For current behaviour, start with the [README](../README.md).

# Refinement report — 3 November 2026

## Delivered

The existing Flask/SQLite architecture is retained. Version 0.3 makes Forecasts and Simulations the planning screens and removes the SMS screen, command handler and endpoint entirely. Earlier monthly-average scenario arithmetic has been removed from the public API.

The internal forecasting pipeline compares ridge regression with a 14-day mean baseline using chronological validation and a later holdout. Methods are selected separately for mean temperature and rainfall. It reports MAE, RMSE, bias, restricted rainfall MAPE and descriptive error ranges. Insufficient data returns a baseline or an explicit missing-data message, not fabricated model scores. Temperature/rainfall inputs are daily records; journals are excluded.

Open-Meteo daily means are requested directly for comparison. Tables join exact dates/coordinates and show unavailable values as blanks. Forecast issues are archived for later paired scoring after references arrive. Provider differences are never treated as prediction errors by themselves. Older cached forecasts are retained if a new request fails; older records without daily means show an unknown mean instead of a max/min substitute.

The water simulator has separate root-zone and rice pond ledgers. It compares original weather with changed rain/demand and one irrigation event. Inputs disclose Kc, soil properties, starting water, capture, efficiency, seepage and missing-ET₀ assumptions. Daily tables and storage graphs explain the result. Water conservation, invalid inputs, weather gaps and irrigation behavior are tested. Results do not predict yield or survival.

Suggested actions now carry a reason, timing and source. Rice-stage water prompts draw on DA-PhilRice; water availability uses FAO; weather checks link to PAGASA; nutrient planning points to BSWM soil testing. Chosen weather review triggers are labeled app screening assumptions, not official warning thresholds. Old forecasts do not trigger current weather advice.

The interface uses concise field-planning language, source labels, clear empty states, charts with numerical tables, and explicit sample selection. Unsaved farm edits are preserved during journal synchronization. Journal entries retain entry-time context for later processing/NLP; there is no text analysis or recommendation ranking.

## Development data

Two source-labeled NASA POWER samples were downloaded: public Legazpi and Naga example coordinates, requested 2024-01-01 through 2026-11-01. Each has 1,035 valid daily temperature/rainfall pairs, with the last available day 2026-10-31. The requested final day was unavailable. These are gridded references, not farm weather-station observations. Their retrieval metadata remains in `data/samples/`.

Full sample benchmark results are in `benchmark-results.json`. For Legazpi, earlier validation selected the baseline for both variables. Its later holdout MAE was 0.543 °C for mean temperature and 3.471 mm/day for rainfall, across 56 forecast/reference pairs. The ridge candidate's later temperature score was better, but that later score was not used to retroactively change the validation-based choice. Rainfall regression performed worse than the baseline. This is a useful outcome of testing; it does not justify forcing ML into production.

## Verification and limits

For Naga, validation selected ridge for mean temperature (holdout MAE 0.445 °C) and the baseline for rainfall (holdout MAE 4.478 mm/day). The two locations therefore exercise both selection paths. These are limited retrospective reference-data results, not estimates of farm-level forecast skill.

The final automated suite passes 40 tests. JavaScript syntax and all direct UI element bindings were checked. Forecast leakage tests change future targets and verify origin predictions remain unchanged. Water tests check conservation, equal-plan equivalence, irrigation effects, paddy interpretation and missing-date rejection. API tests cover profile preservation, sample isolation, duplicate-safe journals, CSV validation, geography, forecast caching and source-linked actions.

The browser showed the revised overview, navigation, source-linked actions, sample model fitting, selected method, comparison table, evaluation metrics and error ranges on the local test address. The final switch to the standard address could not be completed because automatic browser approval timed out twice. Final mobile layout and visual checks remain incomplete; no new screenshot is represented as final proof.

NASA retrieval succeeded earlier in the work, including the public samples and a direct diagnostic request. Later NASA and Open-Meteo requests failed hostname resolution. The running app retained its prior weather and reported the failure. A fresh end-to-end live-provider comparison could not be completed under those connection conditions. Mocked API and date-matching/scoring tests pass, but they do not substitute for a live provider test.

Existing farm and journal records were retained. Attempts to refresh farm history failed safely and did not replace the active window. Successful sample analysis did not change the farm profile. No journal NLP was added.

## Remaining research work

- Independent Bicol station/lab observations and documented quality review.
- Wider seasonal/location holdouts, rainfall-specific models and calibrated uncertainty.
- Local validation of crop parameters and weather review rules.
- SARAi data access through an approved feed or supplied export.
- Crop rotation, ash chemistry, microbiome and drought-survival models supported by suitable evidence.
- HTTPS phone testing, accounts and multi-farm authorization before shared deployment.

The result is a more substantive research prototype. Passing software tests does not establish agronomic or farm-scale forecast accuracy.
