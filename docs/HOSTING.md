# Put the demo online for free

This setup runs the existing Flask app on Render. Visitors only need a browser.
It is one shared demo farm, not separate farmer accounts. Use made-up records.

## Upload the prepared files

Extract `dist/agriforesight-demo.zip` on your computer. Upload the extracted files
and folders to your GitHub repository root (not the zip itself and not an extra
parent folder). The root should contain `app.py`, `wsgi.py`, `render.yaml`,
`requirements-hosting.txt`, `static/` and `data/`. The boundary files in data are
needed for Philippine location lookup. Keep the repository private if you prefer.

The package deliberately leaves out your local database, saved journals, virtual
environment, credentials and screenshots. The hosted demo starts with the default
sample farm. Nothing changes in your local database.

## Deploy on Render

1. Sign in at https://dashboard.render.com/ with your own account.
2. Choose **New > Blueprint** and connect the GitHub repository.
3. Select the branch containing the uploaded files. Render reads `render.yaml`.
4. Check that the service plan says **Free**, then deploy. There is no paid disk,
   database or AI service in this configuration.
5. Wait until the service says **Live**. Open the `onrender.com` URL Render gives you.

If you use **New > Web Service** instead, set these values manually:

| Setting | Value |
| --- | --- |
| Runtime | Python 3 |
| Instance | Free |
| Build command | `pip install -r requirements-hosting.txt` |
| Start command | `gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 180` |
| Health check | `/healthz` |
| Environment: AGRIFORESIGHT_DEMO | `1` |
| Environment: AGRIFORESIGHT_DB | `/tmp/agriforesight/farm.sqlite3` |

The `.python-version` file selects Python 3.12. Gunicorn is for the Linux host;
keep using START-AGRIFORESIGHT.cmd on Windows.

## What to expect

Render's free service sleeps after 15 minutes without traffic. The next visit
can take about a minute to wake it. SQLite changes disappear on sleep, restart or
redeploy. Export any test records you want before leaving. Free usage also has
monthly limits; review Render's dashboard and avoid paid upgrades for this demo.

The shared-demo banner appears on the website. Anyone with the link can read or
change the same farm and notes. This is not ready for private farmer records.
Demo mode disables external AI classification even if a key was accidentally
configured. Guided assistant buttons and supported phrases still work. Weather
lookups still need the external weather providers to respond.

## Check after deployment

Open the home page and confirm the Shared demo banner. Open Ask for help and try
“My farm”, then “my crop is corn”. Confirm it and check My farm & soil. Try a
sample note and check the journal. Try Update weather. Visiting `/healthz` should
return `{"status":"ok"}`. Refresh to check the current running instance saved
your edits; this does not mean they will survive the next sleep or restart.

## Updating or removing it

Commit updated source to the connected branch and use Render's deploy controls.
You can delete the demo service in its Settings when you no longer need it.
Never upload `.env`, `.venv`, `instance/` or a SQLite file to the repository.

References: https://render.com/docs/deploy-flask and https://render.com/docs/free
