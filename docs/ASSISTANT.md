# Current setup: Groq Free plan

Groq is now the default provider. Stay on Groq's Free plan; do not upgrade to Developer for a free-only prototype. The app cannot inspect or enforce your account billing tier. It never switches providers automatically. Quota errors stop the request; guided buttons remain available.

Create a key at https://console.groq.com/keys and put it in Render Environment, not in source code or chat:

| Variable | Value |
| --- | --- |
| AGRIFORESIGHT_AI_PROVIDER | groq |
| GROQ_API_KEY | Your private Groq key |
| AGRIFORESIGHT_CHAT_MODEL | openai/gpt-oss-20b |
| AGRIFORESIGHT_AI_ENABLED | 1 |

Replace the old Gemini model setting explicitly. Keep AGRIFORESIGHT_DEMO=1 for the other demo restrictions. Push this code and save/deploy the environment settings, then use Ask for help → Test AI connection. The successful result names the provider and model. Local setup uses these same environment variable names in the PowerShell window that starts Flask; .env files are not loaded automatically.

Groq's published free limits for this model were 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day when checked November 3, 2026. Any one limit can stop requests. Check your account for current limits: https://console.groq.com/docs/rate-limits . Billing details: https://console.groq.com/docs/billing-faqs . Shared public use consumes the same account quota.

The provider interprets bounded app actions; it is not yet a general conversational agent. Confirmation is still required for saves. Only the current unrecognised message is sent, not the whole farm or journal history. Live Groq access has not been tested without a key; automated tests mock provider replies and verify routing and no cross-provider fallback.

The earlier Gemini setup notes below are kept for users who explicitly choose AGRIFORESIGHT_AI_PROVIDER=gemini. The current button is named Test AI connection for either provider.

---

# Farm assistant

The assistant opens from the **Ask for help** button at the bottom of any page. Close or Escape minimises it without losing the conversation. Farm overview is the first screen. Simulations have been removed from navigation and the public API. The older water calculation files remain in the repository as earlier work.

## Try it

Start the app as usual. Open Ask for help, then tap Check the weather, Help me choose a crop, My farm details or Save a note. You can also type “my crop is corn”, “newly planted”, “bagong tanim” or “note: Watered the field today”.

The guided assistant works without an AI account. It recognises a small set of phrases and asks follow-up questions through buttons. It needs the local Flask server. It is not a general-purpose conversational model, and voice input is not implemented yet.

Weather is read from saved records. Update weather performs the existing provider download. Crop suggestions ask about drainage and use the existing crop rules. Crop and stage changes and notes require Save this; Cancel discards the pending change. Notes use today’s Philippine date and remain excluded from recommendation analysis.

## Optional AI interpretation

For broader phrasing, configure Gemini 2.5 Flash through Google’s compatible chat endpoint on the server. Set these environment variables in the same PowerShell window before starting the app:

```powershell
$env:GEMINI_API_KEY = "your-key"
$env:AGRIFORESIGHT_CHAT_MODEL = "gemini-2.5-flash"
.\.venv\Scripts\python.exe app.py
```

The app does not automatically load a .env file. Keep keys out of browser files and source control. When configured, messages the guided parser cannot recognise may be sent to Google Gemini for intent classification. No full farm profile or journal history is sent by this classifier. A message itself can contain personal information, so the screen discloses this connection. Provider usage can incur charges.

The AI returns an intent and value. Flask checks the allowed intent and crop/stage values and controls all writes. It cannot run SQL, arbitrary code or arbitrary app routes. Provider errors fall back to the guided help message. Actual provider compatibility and language accuracy need testing with the selected model.

## Files and storage

`assistant_chat.py` recognises guided phrases and optionally calls the classifier. `/api/chat` in `app.py` executes bounded operations. `static/chat.js` renders messages and choices. `static/assistant-mark.svg` is a replaceable placeholder logo.

A random conversation ID stays in browser storage. Pending actions are saved under `chat:<id>` in SQLite state; the visible transcript is currently kept only on the page. Confirmed notes go into journals with duplicate-safe IDs. A changed farm profile invalidates a pending save. Start a new request if the farm changed elsewhere.

## Current limits

No speech recognition, general agronomy question answering, saved conversation history, backdated notes, arbitrary farm-field editing or multi-user accounts yet. Crop and crop-stage updates are supported; area, location and soil details use the existing farm form. The interface keeps those forms available.

Next work should focus on ambiguity handling, expiry of old pending actions, voice/language trials, undo and authenticated farm access before shared hosting.

## Working alongside the forms

Chat stays open when you switch pages. Crop and stage changes include a Show the farm field button, which brings the field into view and minimises chat so it does not cover the form. Confirming a change saves it through the backend and updates the matching form input. Other unsaved farm inputs stay as you left them. The assistant currently changes crop and stage, saves notes, fetches weather and helps compare crops; it does not edit every input yet.

## Render setup

Local PowerShell variables do not reach Render. Push the updated code to the repository and branch connected to your Render service. In the service's Environment settings add GEMINI_API_KEY (your private key), AGRIFORESIGHT_CHAT_MODEL (gemini-2.5-flash), and AGRIFORESIGHT_AI_ENABLED (1). Save and deploy the updated code. Keep AGRIFORESIGHT_DEMO=1 if you want the other demo restrictions; AI_ENABLED explicitly permits Gemini in that mode. Public visitors can then consume your Gemini quota.

Open Ask for help and select Test Gemini connection. This makes a real request without changing farm records. Errors now report missing configuration, HTTP failures, quota limits, connection failures or malformed replies without exposing credentials. A successful test confirms connectivity, not all conversational capabilities. The assistant is still a bounded intent classifier, not a general conversational agent. A .env file is not loaded automatically.

Connection diagnostics distinguish connection timeout (8 seconds), read timeout (45 seconds), certificate failures and interrupted connections. Temporary HTTP 502/503/504 responses get up to three total attempts, with 2- and 4-second waits. Transport failures are not automatically retried. Model names appear in error messages; keys and raw provider responses are not logged. These diagnostics do not establish a live connection without an actual successful provider reply.
