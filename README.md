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


## Data and offline use

- History: NASA POWER for the saved farm coordinates; ERA5 is the fallback. The first download covers one year and ends seven days before today. No synthetic values, sample switches, unverified CSV uploads or manual weather edits appear in live views.
- Forecast: Open-Meteo. If Render is rate-limited, the browser tries the same public API directly. No new key is needed. Forecasts cache for three hours, keep their original dates and feed both Forecasts and Farm Performance.
- Farm Performance: an explainable weather outlook for heat, rain and drying risk. It is not a crop-disease, soil-fertility or yield diagnosis. Missing/old data stays unknown. Open **Why this check?** for values, source times and prototype thresholds.
- Soil pH/NPK: only actual measurements supplied by the farmer; unavailable readings stay blank. Weather-model surface moisture is labeled as an estimate and cannot diagnose root water need.
- Journal: farmer-written notes only. NLP is reserved for later. Notes have a local archive and sync queue. Form drafts survive reloads. Optional JPG/PNG/WebP photos up to 2 MB stay in IndexedDB on that device. Use **Choose photo preview** after selecting a photo, or tap a saved thumbnail and choose **Edit preview**. Drag the photo to move it and pinch or scroll to zoom. **Done** saves the framing. Keep a copy of your photos because JSON exports only include the notes.

Open the app online once and download weather before going offline. The app shell, sourced history, forecasts, notes and saved crop results can then be read on the same browser. New weather, new crop calculations and cloud AI chat still need internet. Old forecasts and cached crop results display their saved dates. Clearing browser/site data also clears local copies, so export a backup first.

Weather credits: [NASA POWER](https://power.larc.nasa.gov/), [Open-Meteo](https://open-meteo.com/) under CC BY 4.0, and [MET Norway](https://api.met.no/doc/License) for backup current air estimates. The street-photo tile uses [KartaView](https://kartaview.org/) under CC BY-SA 4.0. Model estimates are not measurements taken on the farm.
