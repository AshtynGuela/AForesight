# AgriForesight Bicol

A single-farm prototype for checking weather, comparing crops and keeping field notes. The chat assistant can explain saved data and help edit farm details.

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
| `assistant_chat.py`, `assistant_actions.py` | AI providers, conversation and validated edits |
| `climate.py`, `forecast.py` | Weather downloads and provider data |
| `modelling.py`, `evaluation.py` | NumPy ridge regression, baseline and forecast evaluation |
| `advice.py`, `crop_planning.py` | Field checks, crop ranking and planting calendars |
| `location.py`, `data/boundaries/` | Philippine coordinate lookup |
| `static/overview.js`, `static/overview.css` | Dashboard text, charts and layout |
| `static/app.js`, `static/chat.js`, `static/index.html`, `static/style.css` | Other screens and chat UI |
| `static/sw.js` | Offline caching; change the cache version when updating cached assets |

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -q
node --check static/app.js
node --check static/overview.js
node --check static/chat.js
```

## Data and credits

Weather comes from NASA POWER and Open-Meteo, including ERA5 history and ECMWF EC46 outlooks. Sample, historical and predicted values carry different meanings. The 30-day outlook supports broad planning and has substantial daily uncertainty. Soil readings come from user input.

Philippine boundaries are a simplified 2020 snapshot from geoBoundaries, with original sources NAMRIA, PSA and OCHA Philippines. Distributed by William & Mary geoLab and contributors under [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/). Preserve this attribution when redistributing. Release details and source URLs are in `data/boundaries/metadata.json`. Coordinate matches provide approximate administrative context.
