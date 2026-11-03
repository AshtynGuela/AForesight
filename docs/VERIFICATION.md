# Assistant update

The assistant is now the home screen, with a replaceable SVG sprout mark. Simulations are removed from the browser and `/api/simulate` returns 404. Existing water calculation modules are retained as earlier work.

Assistant checks cover confirmation before crop changes, cancellation, duplicate note retries, drainage follow-up, invalid chat IDs, wrong confirmation IDs and removal of the simulation endpoint. Browser checks showed the assistant home, the drainage question and source-linked crop advice. The optional external AI classifier is implemented but has not been live-tested with a configured key/model. Voice is not implemented.

See [assistant setup](ASSISTANT.md) for the working guided phrases and optional configuration.

---

# Current verification status

The latest recorded automated run passed 53 tests. Extra one-off checks covered drainage blocking, stale forecast exclusion, a draft harvest date and a 366-day historical window. Those one-off checks are not all stored as repeatable tests yet.

The simplified forecast and water-planning screens had desktop and mobile browser checks. The newer crop-ranking screens and live 30-day provider feed have not had a complete end-to-end browser check. Field accuracy, local agronomic suitability and offline use on a physical phone remain unverified.

Documentation was checked against the current source files, and relative links in the main guides were checked. No new application test run was needed for the documentation update.

Earlier records below describe the version tested at that time. Their test counts and limitations are historical.

---

# Latest verification — v0.4, 3 November 2026

- **49 automated tests pass**, including October date propagation, 31 daily predictions, future-reference isolation, editable weather records and backup restoration.
- Live NASA request loaded the saved farm's 761-day training/reference window through October 31, 2026, with all October days available.
- Live archived Open-Meteo output loaded for the same October dates and coordinates.
- Browser verified varying daily predictions, reference values, historical scores, suggested actions on overview/forecasts, and a 31-day water simulation with scenario-specific actions.
- Reload preserved the selected period, fitted results and archived comparison.
- Mobile viewport 390 × 844 checked; document width did not exceed the viewport. Chart and horizontally scrollable numerical table were inspected. Desktop/mobile screenshots are `forecast-october2026.png` and `forecast-october2026-mobile.png`.
- UI bindings, unique IDs and JavaScript syntax checked. Weather editing/restoration is tested against isolated databases; no test correction was applied to the user's actual weather readings.
- Farm profile and journals preserved. The selected October analysis and downloaded weather were saved deliberately for the requested test.

The historical workflow is a rolling one-day-ahead test, not a single month-ahead forecast. NASA remains a grid reference, archived provider output is stitched across runs, and these checks do not establish farm-level accuracy or validate agronomic parameters. The preview server is stopped after testing; restart the normal app to load the updated Python backend.

Earlier version verification follows for historical context:

# Verification — version 0.3, 3 November 2026

## Passed

- **40 automated tests**, final run: all passed (45.8 seconds).
- JavaScript syntax checks for the app and service worker.
- UI element binding check and duplicate HTML ID check.
- Chronological forecasting: future-target leakage guard, explicit missing days, duplicate-date rejection, short-series baseline, synthetic-data restriction, MAPE handling and real sample evaluation.
- Water ledgers: conservation, equal inputs yielding equal plans, irrigation effects, paddy interpretation, bad soil inputs and missing weather dates.
- API/data: PH locations and offshore/foreign rejection; profile persistence; coordinate-specific cache isolation; model sample isolation; CSV duplicate rejection; journal context and idempotent retries; stale forecast exclusion and source-linked actions.
- Saved scoring: no errors without later references, and same-day/after-target issues excluded.
- SMS endpoint removed (404).

## Browser work completed

The revised overview and forecast screen rendered at the temporary local preview address. A Legazpi sample fit completed and visibly showed its dates, selected baseline, error ranges and chronological validation/holdout scores. Source-linked actions and navigation were visible. The sample did not change the saved farm profile.

## Not completed / limits

The final navigation to the standard local address was blocked by two automatic browser approval timeouts. This was not an unsafe-action determination. Final mobile visual verification and a final screenshot were not completed. Existing `preview.png` / `mobile-preview.png` are older-version images and must not be used as proof of this version.

Public NASA samples downloaded successfully earlier: 1,035 valid days each for Legazpi and Naga, with the original missingness and dates preserved. Later both NASA and Open-Meteo hostname resolution failed. A fresh live forecast comparison could not be completed; errors retained saved data. Mocked API and matching/scoring tests pass. This is distinct from a live-provider integration check.

Earlier-version offline browser behavior was tested, but the complete revised UI was not re-tested offline on a physical phone. Installation, multi-user behavior, real field accuracy and agronomic validation remain unverified.

The verification server was stopped after testing. Use the launcher or README instructions to start the app. Farm and journal records remain in SQLite; no journal NLP is enabled.

See `REFINEMENT_REPORT.md`, `METHODS.md` and `benchmark-results.json` for the delivered scope, methodology and source-labeled benchmarks.


## Farmer view refinement (November 3, 2026)

53 automated tests passed, including crop-stage changes, wet-weather checks for corn, exclusion of synthetic weather triggers, and exact conversion of 10,000 litres over 15 hectares. JavaScript syntax and unique/static element bindings checked. Browser checks confirmed next-seven-days vs past-weather separation, collapsed technical controls, litres/date submission, and a result reporting 10,000 litres. The mobile forecast had equal viewport and content widths (375 CSS pixels with the scrollbar). Farm and journal records were not edited by these UI checks.
