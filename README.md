# AgriForesight Bicol

A single-farm prototype for checking weather, comparing crops and keeping field notes. The chat assistant can explain saved data and help edit farm details.

**Live demo:** https://aforesight.onrender.com/ — Open **Ask for help** to use the hosted chatbot. It needs internet access and a working provider on the server. If Render is waking up, allow about a minute for the first load.

## Submission package

The source ZIP includes the app, images, Philippine boundary data, weather-source adapters and setup instructions. It excludes Python environments, Git history, caches, private databases and API keys. Install dependencies using the steps below for a local run. Set your own provider variables to enable AI locally; the included code alone does not run an offline language model. The hosted demo uses its own server-side configuration and may run an earlier version until redeployed.

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
3. **Forecast** — Use **Update weather** for the short-range forecast or **Load 30-day outlook** for broader planning. The short-range forecast is saved on this device and also powers Farm Performance. Check its dates before relying on it.
4. **Crop Plans** — Answer the drainage question, compare the reasons for each crop and create a draft planting calendar. The latest calendar, form draft and downloaded comparison are saved on this device for offline reference.
5. **Field Journal** — Record observations and outcomes. Offline notes wait for syncing in the same browser. Journals are kept for later NLP work.
6. **Ask for help** — Try “Explain the saved forecast”, “Show historical weather”, “Change my area to 2 hectares” or “Save a note”. Review proposed edits and tap **Save this**.

On first use, the app downloads one year of NASA POWER history for the saved coordinates, ending seven days before today to allow for source delay. ERA5 is the fallback. **Update sourced history** downloads it again. Sample switches, manual weather edits and unverified CSV imports are disabled; missing data stays empty. Your own soil measurements and journal notes remain editable.

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

Model availability in the selector checks configuration. Send a short farming question with each model to verify access and quota. Recent conversation and farm context go to the chosen provider. The hosted app is shared; chat context goes to the selected cloud provider.

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

## Data and offline use

- History: NASA POWER for the saved farm coordinates; ERA5 is the fallback. The first download covers one year and ends seven days before today. No synthetic values, sample switches, unverified CSV uploads or manual weather edits appear in live views.
- Forecast: Open-Meteo. If Render is rate-limited, the browser tries the same public API directly. No new key is needed. Forecasts cache for three hours, keep their original dates and feed both Forecasts and Farm Performance.
- Farm Performance: an explainable weather outlook for heat, rain and drying risk. It is not a crop-disease, soil-fertility or yield diagnosis. Missing/old data stays unknown. Open **Why this check?** for values, source times and prototype thresholds.
- Soil pH/NPK: only actual measurements supplied by the farmer; unavailable readings stay blank. Weather-model surface moisture is labeled as an estimate and cannot diagnose root water need.
- Journal: farmer-written notes only. NLP is reserved for later. Notes have a local archive and sync queue; form drafts survive reloads. Optional JPG/PNG/WebP photos up to 2 MB stay in IndexedDB on that device. Photos are not uploaded to Render or included in JSON export; keep the originals as a backup.

Open the app online once and download weather before going offline. The app shell, sourced history, forecasts, notes and saved crop results can then be read on the same browser. New weather, new crop calculations and cloud AI chat still need internet. Old forecasts and cached crop results display their saved dates. Clearing browser/site data also clears local copies, so export a backup first.

Screens follow Figma Desktop 3 (Forecast) and Desktop 4 (Crop Plans). The completed Field Journal is frame `107:338`, named Desktop 6 in the file; Desktop 5 is an unfinished Forecast copy. **More weather tools** keeps the 30-day outlook and comparison tools available. Decorative photos cache after loading and do not block installation of essential offline files.

Weather credits: [NASA POWER](https://power.larc.nasa.gov/), [Open-Meteo](https://open-meteo.com/) under CC BY 4.0, and [MET Norway](https://api.met.no/doc/License) for backup current air estimates. The street-photo tile uses [KartaView](https://kartaview.org/) under CC BY-SA 4.0. Model estimates are not measurements taken on the farm.

The screen code is in `static/forecasts.js`, `static/workspaces.js` and their matching CSS files. `static/forecast-store.js`, `static/history-store.js` and `static/journal-store.js` handle device copies. Run all client checks with `node --test tests/*.cjs`.
