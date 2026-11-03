# Farm assistant

The assistant opens from the **Ask for help** button at the bottom of any page. Close or Escape minimises it without losing the conversation. Farm overview is the first screen. Simulations have been removed from navigation and the public API. The older water calculation files remain in the repository as earlier work.

## Try it

Start the app as usual. Open Ask for help, then tap Check the weather, Help me choose a crop, My farm details or Save a note. You can also type “my crop is corn”, “newly planted”, “bagong tanim” or “note: Watered the field today”.

The guided assistant works without an AI account. It recognises a small set of phrases and asks follow-up questions through buttons. It needs the local Flask server. It is not a general-purpose conversational model, and voice input is not implemented yet.

Weather is read from saved records. Update weather performs the existing provider download. Crop suggestions ask about drainage and use the existing crop rules. Crop and stage changes and notes require Save this; Cancel discards the pending change. Notes use today’s Philippine date and remain excluded from recommendation analysis.

## Optional AI interpretation

For broader phrasing, configure a compatible OpenAI chat-completions model on the server. Set these environment variables in the same PowerShell window before starting the app:

```powershell
$env:OPENAI_API_KEY = "your-key"
$env:AGRIFORESIGHT_CHAT_MODEL = "your-compatible-model-id"
.\.venv\Scripts\python.exe app.py
```

The app does not automatically load a .env file. Keep keys out of browser files and source control. When configured, messages the guided parser cannot recognise may be sent to OpenAI for intent classification. No full farm profile or journal history is sent by this classifier. A message itself can contain personal information, so the screen discloses this connection. Provider usage can incur charges.

The AI returns an intent and value. Flask checks the allowed intent and crop/stage values and controls all writes. It cannot run SQL, arbitrary code or arbitrary app routes. Provider errors fall back to the guided help message. Actual provider compatibility and language accuracy need testing with the selected model.

## Files and storage

`assistant_chat.py` recognises guided phrases and optionally calls the classifier. `/api/chat` in `app.py` executes bounded operations. `static/chat.js` renders messages and choices. `static/assistant-mark.svg` is a replaceable placeholder logo.

A random conversation ID stays in browser storage. Pending actions are saved under `chat:<id>` in SQLite state; the visible transcript is currently kept only on the page. Confirmed notes go into journals with duplicate-safe IDs. A changed farm profile invalidates a pending save. Start a new request if the farm changed elsewhere.

## Current limits

No speech recognition, general agronomy question answering, saved conversation history, backdated notes, arbitrary farm-field editing or multi-user accounts yet. Crop and crop-stage updates are supported; area, location and soil details use the existing farm form. The interface keeps those forms available.

Next work should focus on ambiguity handling, expiry of old pending actions, voice/language trials, undo and authenticated farm access before shared hosting.

## Working alongside the forms

Chat stays open when you switch pages. Crop and stage changes include a Show the farm field button, which brings the field into view and minimises chat so it does not cover the form. Confirming a change saves it through the backend and updates the matching form input. Other unsaved farm inputs stay as you left them. The assistant currently changes crop and stage, saves notes, fetches weather and helps compare crops; it does not edit every input yet.
