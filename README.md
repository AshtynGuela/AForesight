# AgriForesight Bicol

A single-farm prototype for checking weather, comparing crops and keeping field notes. The chat assistant can explain saved data and help edit farm details.

**Live demo:** https://aforesight.onrender.com/ — Open **Ask for help** to use the hosted chatbot. It needs internet access and a working provider on the server. If Render is waking up, allow about a minute for the first load.

## Submission package

The source ZIP includes the app, images, Philippine boundary data, sourced weather samples and setup instructions. It excludes Python environments, Git history, caches, private databases and API keys. Install dependencies using the steps below for a local run. Set your own provider variables to enable AI locally; the included code alone does not run an offline language model. The hosted demo uses its own server-side configuration and may run an earlier version until redeployed.

## Run locally

Use Python 3.12. Open PowerShell in the folder containing `app.py` and `render.yaml`.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:5000 and keep the terminal running. For later runs, double-click `START-AGRIFORESIGHT.cmd`. Press Ctrl+C in the terminal to stop.

## Use the app

1. **My Farm** — Enter Philippine coordinates, check the returned location, then save the crop, area and water access. Add soil readings only when you have measurements.
2. **Dashboard** — Review average daily rainfall, temperature, farm details and suggested actions. **Dates** changes the historical period, up to 366 days.
3. **Forecast** — Use **Update weather** for the short-range forecast or **Load 30-day outlook** for broader planning. Check the saved dates and data labels.
4. **Crop Plans** — Answer the drainage question, compare the reasons for each crop and create a draft planting calendar. Calendars are shown on screen and have no saved-plan library yet.
5. **Field Journal** — Record observations and outcomes. Offline notes wait for syncing in the same browser. Journals are kept for later NLP work.
6. **Ask for help** — Try “Explain the saved forecast”, “Show historical weather”, “Change my area to 2 hectares” or “Save a note”. Review proposed edits and tap **Save this**.

To import weather, open **Weather data** and use CSV columns `date,temp,rain`. Dates use `YYYY-MM-DD`, temperature uses °C and rainfall uses mm per day. Imports accept 14–1,826 historical rows and replace the active records.

## Set up the chat models

Choose **Gayuma** or **Alon** inside chat. The browser remembers your choice and keeps the conversation when switching.

| Environment variable | Value |
| --- | --- |
| `AGRIFORESIGHT_AI_ENABLED` | `1` |
| `AGRIFORESIGHT_AI_PROVIDER` | `groq` for default Alon, `openrouter` for default Gayuma |
| `GROQ_API_KEY` | Your Groq key |
| `AGRIFORESIGHT_GROQ_MODEL` | `openai/gpt-oss-20b`, or an available model for your account |
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `AGRIFORESIGHT_OPENROUTER_MODEL` | `nvidia/nemotron-3.5-super-vl:free` |

For local use, set variables in the PowerShell window before starting Python. For example, `$env:AGRIFORESIGHT_AI_PROVIDER = "groq"`. The app does not automatically load `.env` files.

For Render, enter the variables in the service's **Environment** settings and redeploy. Keys stay on the server. The older `AGRIFORESIGHT_CHAT_MODEL` is a fallback for the default provider only.

Model availability in the selector checks configuration. Send a short farming question with each model to verify access and quota. Recent conversation and farm context go to the chosen provider. Use made-up details for this shared prototype, especially with the Nemotron free endpoint's data-logging terms.

## Deploy or update on Render

Connect this GitHub repository using a Render Blueprint with `render.yaml`, or configure a Python web service with these settings.

| Setting | Value |
| --- | --- |
| Build | `pip install -r requirements-hosting.txt` |
| Start | `gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 180` |
| Health check | `/healthz` |
| `AGRIFORESIGHT_DEMO` | `1` |
| `AGRIFORESIGHT_DB` | `/tmp/agriforesight/farm.sqlite3` |

Commit and push changes to the connected branch, then check the deployment in Render. Configure AI variables separately. After deployment, test loading the dashboard, saving an edit and updating weather.

The current configuration uses one shared farm and temporary SQLite storage. Hosted records can disappear after restarts or deployments. Local records normally live in `instance/farm.sqlite3`. Keep credentials, `.venv` and database files out of Git.

## Quick fixes

| Problem | Try this |
| --- | --- |
| Old layout or text | Press Ctrl+Shift+R. Confirm the server or latest deployment is running. |
| Model unavailable | Check its API key, model ID and `AGRIFORESIGHT_AI_ENABLED`, then restart or redeploy. |
| Weather update fails | Retry later. Chat can show the previous forecast with its original dates. |
| Old forecast dates | Update weather or load newer history before building an app prediction. |
| Repeated prediction values | The historical-average baseline repeats its average. Check the selected method. |
| Missing location dataset | Run `.\.venv\Scripts\python.exe scripts/download_boundaries.py`, then restart. |

## Code and checks

| Files | Purpose |
| --- | --- |
| `app.py`, `engine.py` | API routes, storage and validation |
| `assistant_chat.py`, `assistant_actions.py`, `assistant_context.py` | AI providers, validated edits and dated weather context |
| `climate.py`, `forecast.py` | Weather downloads and provider data |
| `modelling.py`, `evaluation.py` | NumPy ridge regression, baseline and forecast evaluation |
| `advice.py`, `crop_planning.py` | Field checks, crop ranking and planting calendars |
| `location.py`, `data/boundaries/` | Philippine coordinate lookup |
| `static/overview.js`, `static/overview.css` | Dashboard text, charts and layout |
| `static/myfarm.js`, `static/myfarm.css`, `static/sidebar.css` | Farm map, details and shared sidebar |
| `static/app.js`, `static/chat.js`, `static/index.html`, `static/style.css` | Other screens and chat UI |
| `static/sw.js` | Offline caching; change the cache version when updating cached assets |

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -q
node --check static/app.js
node --check static/overview.js
node --check static/chat.js
node --check static/myfarm.js
```

To keep edits readable, use `uvx ruff@0.11.13 format .` for Python and `npx --yes prettier@3.6.2 --write "static/*.js" "static/*.css" static/index.html` for the frontend. These are development tools; Render needs no extra packages. `uvx ruff@0.11.13 check .` checks Python for common mistakes and unused imports.

Screens register with `registerPageView` in `static/app.js`. Only the active screen redraws its charts and records. My Farm owns coordinate previews and GPS; the old hidden location screen and retired water simulator have been removed. `time_utils.py` handles Philippine dates and cache freshness.

## Data and credits

Weather comes from NASA POWER and Open-Meteo, including ERA5 history and ECMWF EC46 outlooks. Sample, historical and predicted values carry different meanings. The 30-day outlook supports broad planning and has substantial daily uncertainty. Soil readings come from user input.

Philippine boundaries are a simplified 2020 snapshot from geoBoundaries, with original sources NAMRIA, PSA and OCHA Philippines. Distributed by William & Mary geoLab and contributors under [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/). Preserve this attribution when redistributing. Release details and source URLs are in `data/boundaries/metadata.json`. Coordinate matches provide approximate administrative context.

My Farm uses locally bundled Leaflet 1.9.4 with Esri satellite imagery and an OpenStreetMap street layer. Tiles need internet access. Use **Choose a point on the map**, check the location preview, then choose **Save new coordinates** or **Cancel**. The point marks a location; farm boundaries and sensor measurements must be supplied separately. Leaflet attribution and license are in `static/vendor/leaflet/LICENSE`.

The My Farm Saved Weather card shows the selected historical rainfall and temperature, with source and dates. At the Legazpi example coordinates (13.1391, 123.7438), **Load sourced Legazpi weather** loads the bundled NASA POWER snapshot and selects its latest available month. Other farm coordinates need a weather download for that point. Weather downloads provide no measured soil chemistry or farm area.

The My Farm sensor log shows weather-model estimates, separate from actual soil samples. Open-Meteo supplies air temperature, humidity and surface soil moisture (0–1 cm, displayed as volume percent). If it fails, [MET Norway](https://api.met.no/doc/License) provides backup air estimates under CC BY 4.0; it supplies no soil moisture. The source and time stay visible. Open-Meteo caches for 30 minutes; MET Norway caches for at least three hours and until its expiry header. If both services fail, saved estimates keep their original time, the error remains visible, and repeated updates wait a minute. Render needs no new API keys. Its logs distinguish timeouts, connection problems and provider HTTP errors.

Map controls, location previews, help and the map message share a toolbar so they do not cover one another. Open More Details to hide the map while editing; the help button stays available.

If the server falls back to MET Norway or cannot supply soil moisture, the browser also tries Open-Meteo's public API directly. This needs no key and sends the saved coordinates to Open-Meteo. Successful estimates cache on that device for 30 minutes and stay visible after refreshing the farm. They are separate from database soil samples and are not uploaded as verified sensor records. `static/conditions.js` handles this request and validates timestamps, units and values. Run `node --test tests/test_conditions_client.cjs` to check this path.

Farm Performance keeps its circular design and now shows a **farm health outlook** from existing weather sources. Green/Good means Heat, Rain and Water checks are complete without flags; amber/Watch asks you to check the field; grey means data is missing or outdated. Missing pH/NPK does not block it. Rows show provider values and names. **Why this check?** shows source times, links, rules and actions. This is a weather-risk summary, not a diagnosis of soil fertility, disease or yield.

Opening My Farm automatically requests a missing/old forecast, with a three-minute retry cooldown. **Update sources** refreshes forecast and current estimates using existing keyless endpoints and the browser soil-moisture fallback on Render. Provider caches still apply. Stale, demo and wrong-coordinate data cannot clear a check. Only the next seven days count. Surface moisture is context, not root-zone health. Reference ET0 is not a watering amount. The 35 C / 50 mm / three dry day triggers are prototype rules, not validated crop-health limits. Run `node --test tests/test_farm_assessment.cjs`.

Rules live in `static/farm-assessment.js`, separate from the UI, ready for future crop rules or journal/NLP evidence. Nothing is inferred from journals yet. Optional measured soil reports remain saved for later use, but do not affect this weather-based indicator.

More Details contains compact crop and soil-sample fields. Use Input for typed coordinates or GPS. Location previews stay on the map and are saved separately from other unfinished form edits.

The location tile checks [KartaView](https://kartaview.org/doc/photos) for a public street photo within 500 m of the saved point. Tap a photo to enlarge it without leaving the app. The distance and capture date help distinguish a nearby road from your actual field. Where coverage is missing or the service fails, the tile opens the farm map. Photos need internet access; metadata caches for a day (six hours for no coverage, five minutes for outages). Images are credited to KartaView contributors under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This works on Render without extra keys or paid services.
