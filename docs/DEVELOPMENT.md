# Working on the code

This is a small Flask app with plain browser files. You can change one part at a time without replacing the whole project.

## Where to look

| File | Job |
| --- | --- |
| `app.py` | Flask routes, SQLite storage, caching and linking the modules together |
| `engine.py` | Farm input checks and overview summary |
| `location.py` | Philippine coordinate lookup using local boundary files |
| `climate.py` | NASA POWER and ERA5 historical downloads |
| `forecast.py` | Short-range, archived and 30-day provider weather |
| `modelling.py` | Regression, baseline selection and historical replay |
| `evaluation.py` | Scores for saved forecasts once later weather is available |
| `simulation.py` | Daily soil-water and rice pond calculations |
| `crop_planning.py` | Crop option ranking and draft planting calendars |
| `advice.py` | Source-linked field checks |
| `periods.py`, `time_utils.py` | Date windows and Philippine dates |
| `static/index.html` | Page structure and form fields |
| `static/app.js` | Browser events, API calls and rendering |
| `static/style.css`, `static/sw.js` | Layout and offline shell |

## How a request travels

A browser form sends JSON to Flask. The route reads the saved farm and relevant weather, calls a calculation module, then returns JSON. JavaScript turns the result into cards or tables.

For example, crop suggestions use `/api/crop-suggestions` → `suggest()` in `crop_planning.py`. The optional calendar uses `/api/crop-plan` → `plan()`. They are separate requests. The `climate` argument currently passed into `suggest()` is not used; historical seasonal analysis has not been added.

## Main routes

All POST routes expect a JSON object. Normal validation failures return an `error` message and HTTP 400. Some provider failures return 502. Writes from a different browser origin are rejected; this is not a replacement for user authentication on a public server.

| Route | What it does |
| --- | --- |
| GET `/api/state` | Farm, weather, notes, advice and saved analysis |
| POST `/api/profile` | Validate and save the farm |
| POST `/api/location` | Look up latitude and longitude |
| POST `/api/period` | Apply `start`, `end` and `provider` (`nasa`, `era5`, `saved`) |
| POST `/api/climate` | Replace raw history; up to 1,096 historical days |
| POST `/api/forecast` | Update the seven-day provider forecast |
| POST `/api/month-outlook` | Load/cache the separate 30-day outlook |
| POST `/api/model` | Build a forecast or run a historical replay |
| POST `/api/comparison` | Load archived provider model output |
| POST `/api/crop-suggestions` | Rank crop options using saved inputs and `drainage` |
| POST `/api/crop-plan` | Make a calendar using `crop`, `previous_crop`, `start`, `duration`, `drainage` |
| POST `/api/simulate` | Compare water plans using weather and field assumptions |
| POST `/api/history/import` | Import CSV text in the `csv` field |
| POST `/api/history/record` | Add/edit/delete a daily weather record |
| GET `/api/history/backups` | List earlier edit copies for the farm location |
| POST `/api/history/restore` | Restore a listed backup by `id` |
| POST `/api/journal` | Save a note; repeated IDs do not create duplicates |

A crop-suggestion request can be as small as:

```json
{"drainage": "good"}
```

The saved farm supplies the other inputs. Drainage accepts `good`, `poor` or `unknown`. Read `options`, `timing`, `missing`, `inputs` and `sources` from the response. Scores are internal rule totals, not probabilities.

## Storage

SQLite has three tables: `state` for saved JSON settings and cached results, `journals` for notes, and `forecast_issues` for saved forecasts. The app factory accepts a separate database path, which tests use to avoid changing the working farm.

Browser storage holds cached state and pending journal entries. The service worker caches the app shell. Changing the shell cache name in `static/sw.js` helps roll out changed browser files.

## Making a change

Keep calculations in Python and screen rendering in JavaScript. Use stable field values and IDs even if a label changes. Render user text as text rather than inserting it as HTML.

For a new crop rule, write down the input, the condition, the reason and the source. Distinguish an agricultural reference from a threshold chosen for the prototype. Check what happens when the input is missing or stale.

Run the checks listed in the root README. For weather or crop logic, also check the opposite case: wet vs dry, good vs poor drainage, fresh vs old data. Use a temporary database for API tests. A successful mock test does not prove a provider still returns the expected live response.

Before sharing beyond the local computer, plan for HTTPS, user accounts, authorization, backups and a real server setup. The current launcher binds to localhost.
