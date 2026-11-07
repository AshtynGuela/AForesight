"""Local, single-farm Flask API. Run with: python app.py."""

import json
import hashlib
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from datetime import date, datetime, timezone, timedelta
from flask import Flask, jsonify, request, send_from_directory, g
from werkzeug.exceptions import HTTPException
import requests
from engine import validate_profile, recommend, number, CROPS
from climate import empty_history, sourced, fetch_power, fetch_archive
from location import lookup, coordinates
from forecast import fetch_forecast, fetch_archived_forecast, fetch_conditions
from street_photos import fetch_street_photo
from modelling import build_forecast, replay_period, VERSION
from evaluation import archive_scores
from time_utils import ph_today, age_seconds, is_recent
from assistant_context import describe_weather
from periods import validate_period, period_days
from advice import suggested_actions

ROOT = Path(__file__).parent
DEFAULT_FARM = {
    "name": "My Bicol farm",
    "municipality": "Legazpi, Albay",
    "latitude": 13.1391,
    "longitude": 123.7438,
    "area": 1,
    "terrain": "lowland",
    "water": "rainfed",
    "crop": "rice",
    "previous_crop": "corn",
    "crop_stage": "unknown",
    "planting_date": "",
    "ph": None,
    "previous_ph": None,
    "nitrogen": None,
    "phosphorus": None,
    "potassium": None,
    "ash": False,
    "soil_method": "unknown",
    "sample_date": "",
    "ph_medium": "unknown",
    "nitrogen_rating": "unknown",
    "phosphorus_rating": "unknown",
    "potassium_rating": "unknown",
    "soil_sample_point": None,
}


def sample_point_for(updated, previous):
    """Keep a report tied to its old field when only the farm coordinates change."""
    nutrients = ("nitrogen", "phosphorus", "potassium")
    keys = (
        "ph",
        *nutrients,
        "sample_date",
        "soil_method",
        "ph_medium",
        *(key + "_rating" for key in nutrients),
    )
    has_results = any(
        updated.get(key) is not None for key in ("ph", *nutrients)
    ) or any(updated.get(key + "_rating", "unknown") != "unknown" for key in nutrients)
    if not has_results:
        return None
    changed = any(
        updated.get(
            key, "unknown" if key.endswith("_rating") or key == "ph_medium" else None
        )
        != previous.get(
            key, "unknown" if key.endswith("_rating") or key == "ph_medium" else None
        )
        for key in keys
    )
    if changed:
        return {key: updated[key] for key in ("latitude", "longitude")}
    return previous.get("soil_sample_point") or {
        key: previous[key] for key in ("latitude", "longitude")
    }


def create_app(database=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
    db_path = Path(
        database
        or os.environ.get("AGRIFORESIGHT_DB", ROOT / "instance" / "farm.sqlite3")
    )
    db_path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def db():
        conn = sqlite3.connect(db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    with db() as conn:
        conn.executescript(
            "CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journals (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS forecast_issues (id TEXT PRIMARY KEY, kind TEXT, latitude REAL, longitude REAL, issued_at TEXT, payload TEXT);"
        )

    def get(key, default=None):
        with db() as conn:
            row = conn.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def put(key, value):
        with db() as conn:
            conn.execute(
                "INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)),
            )

    def cached_history(key):
        saved = get(key)
        if not saved:
            return None
        try:
            age = age_seconds(saved.get("cached_at") or saved.get("retrieved_at"))
            # Recent records can be revised by the provider. Older periods change less often.
            end = date.fromisoformat(
                saved.get("request_end") or saved["days"][-1]["date"]
            )
            lifetime = 86400 if (ph_today() - end).days < 30 else 30 * 86400
            return saved if age is not None and 0 <= age < lifetime else None
        except (ValueError, TypeError, KeyError, IndexError):
            return None

    def entries():
        with db() as conn:
            return [
                json.loads(r["payload"])
                for r in conn.execute(
                    "SELECT payload FROM journals ORDER BY rowid DESC"
                )
            ]

    def climate_for(farm):
        climate = get("climate")
        if sourced(climate) and (climate["latitude"], climate["longitude"]) == (
            farm["latitude"],
            farm["longitude"],
        ):
            return climate
        return empty_history(farm["latitude"], farm["longitude"])

    def history_label(climate):
        if not climate.get("days"):
            return "No sourced history"
        if climate.get("demo"):
            return (
                "Edited sample data"
                if climate.get("kind") == "user_edited"
                else "Sample data"
            )
        if climate.get("kind") in ("user_edited", "user_supplied"):
            return "User-entered history"
        return "Historical weather"

    def model_key(climate):
        digest = hashlib.sha256(
            json.dumps(climate, sort_keys=True).encode()
        ).hexdigest()
        return f"model:{VERSION}:{digest}"

    def saved_forecast(latitude, longitude):
        # Preserve older cached weather when the newer mean-temperature request is unavailable.
        return get(f"forecast:v2:{latitude}:{longitude}") or get(
            f"forecast:{latitude}:{longitude}"
        )

    def archive(kind, payload):
        if payload.get("demo") or not payload.get("days"):
            return
        issued = payload.get("issued_at") or payload.get("retrieved_at")
        if not issued:
            return
        encoded = json.dumps(payload, sort_keys=True)
        identifier = hashlib.sha256((kind + encoded).encode()).hexdigest()
        with db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO forecast_issues VALUES (?,?,?,?,?,?)",
                (
                    identifier,
                    kind,
                    payload["latitude"],
                    payload["longitude"],
                    issued,
                    encoded,
                ),
            )

    def scores(farm, climate):
        with db() as conn:
            rows = conn.execute(
                "SELECT * FROM forecast_issues WHERE latitude=? AND longitude=? ORDER BY issued_at DESC LIMIT 1000",
                (farm["latitude"], farm["longitude"]),
            ).fetchall()
        snapshots = [
            {**dict(row), "payload": json.loads(row["payload"])} for row in rows
        ]
        return archive_scores(snapshots, climate)

    def dataset(name, farm):
        if name in (None, "current"):
            return climate_for(farm)
        raise ValueError(
            "Use downloaded weather for your saved farm. Sample datasets are disabled."
        )

    def active_period(farm):
        period = get("analysis_period")
        return (
            period
            if period
            and (period["latitude"], period["longitude"])
            == (farm["latitude"], farm["longitude"])
            else None
        )

    def period_advice(farm, climate, forecast):
        period = active_period(farm)
        days = period_days(climate, period) if period else []
        if days:
            return suggested_actions(
                farm,
                {**climate, "days": days},
                allow_past=True,
                label="Historical review: " + period["start"] + " to " + period["end"],
            )
        return suggested_actions(farm, forecast)

    @app.post("/api/period")
    def set_period():
        data = body()
        a, b = validate_period(data.get("start"), data.get("end"))
        farm = get("farm", DEFAULT_FARM)
        provider = data.get("provider", "nasa")
        if provider not in ("nasa", "era5", "saved"):
            raise ValueError("Choose NASA POWER, ERA5 or saved records.")
        if provider == "saved":
            climate = climate_for(farm)
            if not any(
                a.isoformat() <= r["date"] <= b.isoformat() for r in climate["days"]
            ):
                raise ValueError(
                    "Saved records do not cover this period. Load NASA POWER/ERA5 or import records for these dates."
                )
        else:
            training_start = (a - timedelta(days=730)).isoformat()
            key = f"period:{provider}:{farm['latitude']}:{farm['longitude']}:{training_start}:{b.isoformat()}"
            climate = cached_history(key)
            if climate is None:
                try:
                    climate = (fetch_power if provider == "nasa" else fetch_archive)(
                        farm["latitude"],
                        farm["longitude"],
                        training_start,
                        b.isoformat(),
                    )
                except (requests.RequestException, KeyError, ValueError, TypeError):
                    return jsonify(
                        error="The weather service could not load this period. Previous records are kept. Try the other source or saved/imported data."
                    ), 502
                climate = {
                    **climate,
                    "cached_at": datetime.now(timezone.utc).isoformat(),
                }
                put(key, climate)
        put("climate", climate)
        period = {
            "start": a.isoformat(),
            "end": b.isoformat(),
            "latitude": farm["latitude"],
            "longitude": farm["longitude"],
            "provider": provider,
        }
        put("analysis_period", period)
        return jsonify(period=period)

    @app.post("/api/history/record")
    def edit_weather_record():
        return jsonify(
            error="Weather values come from source downloads. Manual weather editing is disabled."
        ), 410

    @app.get("/api/history/backups")
    def history_backups():
        farm = get("farm", DEFAULT_FARM)
        with db() as conn:
            rows = conn.execute(
                "SELECT key,value FROM state WHERE key LIKE 'history_backup:%' ORDER BY key DESC LIMIT 30"
            ).fetchall()
        backups = []
        for row in rows:
            climate = json.loads(row["value"])
            if sourced(climate) and (climate["latitude"], climate["longitude"]) == (
                farm["latitude"],
                farm["longitude"],
            ):
                backups.append(
                    {
                        "id": row["key"],
                        "source": climate["source"],
                        "start": climate["days"][0]["date"],
                        "end": climate["days"][-1]["date"],
                    }
                )
        return jsonify(backups=backups)

    @app.post("/api/history/restore")
    def restore_history():
        identifier = body().get("id", "")
        if not isinstance(identifier, str) or not identifier.startswith(
            "history_backup:"
        ):
            raise ValueError("Choose a valid saved backup.")
        climate = get(identifier)
        farm = get("farm", DEFAULT_FARM)
        if not sourced(climate) or (climate["latitude"], climate["longitude"]) != (
            farm["latitude"],
            farm["longitude"],
        ):
            raise ValueError("Backup unavailable for this farm location.")
        put(
            "history_backup:" + datetime.now(timezone.utc).isoformat(),
            climate_for(farm),
        )
        put("climate", climate)
        return jsonify(ok=True)

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.before_request
    def local_write_guard():
        # JSON-only writes prevent ordinary cross-origin HTML forms from changing data.
        if request.method == "POST" and not request.is_json:
            return jsonify(error="Send application/json."), 415
        if (
            request.method == "POST"
            and request.headers.get("Origin")
            and request.headers["Origin"] != request.host_url.rstrip("/")
        ):
            return jsonify(error="Cross-origin writes are disabled."), 403

    def body():
        data = request.get_json()
        if not isinstance(data, dict):
            raise ValueError("A JSON object is required.")
        return data

    @app.get("/healthz")
    def health():
        with db() as conn:
            conn.execute("SELECT 1").fetchone()
        return jsonify(status="ok")

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/sw.js")
    def service_worker():
        return send_from_directory(app.static_folder, "sw.js", max_age=0)

    @app.get("/api/state")
    def state():
        farm = get("farm", DEFAULT_FARM)
        climate = climate_for(farm)
        journals = entries()
        forecast = saved_forecast(farm["latitude"], farm["longitude"])
        internal = get(model_key(climate))
        period = active_period(farm)
        selected_days = period_days(climate, period) if period else []
        summary = recommend(
            farm,
            {**climate, "days": selected_days} if selected_days else climate,
            journals=journals,
            forecast=forecast,
        )
        summary["actions"] = period_advice(farm, climate, forecast)
        analysis = None
        session = get("model_session")
        if session and session.get("climate_key") == model_key(climate):
            result = get(session["key"])
            matches = session["mode"] == "forward" or (
                period
                and session.get("start") == period["start"]
                and session.get("end") == period["end"]
            )
            if result and matches:
                provider = (
                    forecast
                    if session["mode"] == "forward"
                    else get(
                        f"comparison:{farm['latitude']}:{farm['longitude']}:{session['start']}:{session['end']}"
                    )
                )
                analysis = {
                    "internal": result,
                    "provider": provider,
                    "actions": suggested_actions(
                        farm,
                        {
                            **result,
                            "source": "Internal " + session["mode"],
                            "retrieved_at": result.get("issued_at"),
                        },
                        allow_past=session["mode"] == "replay",
                        label="Historical test"
                        if session["mode"] == "replay"
                        else "Internal forecast",
                    ),
                }
        return jsonify(
            current_conditions=get(
                f"conditions:v1:{farm['latitude']}:{farm['longitude']}"
            ),
            current_conditions_status=get(
                f"conditions-status:v1:{farm['latitude']}:{farm['longitude']}"
            ),
            data_labels={
                "history": history_label(climate),
                "forecast": "Weather forecast" if forecast else "No forecast loaded",
            },
            demo_mode=os.environ.get("AGRIFORESIGHT_DEMO") == "1",
            farm=farm,
            climate=climate,
            weather_actions=suggested_actions(farm, forecast),
            analysis_period=period,
            analysis=analysis,
            journals=journals,
            forecast=forecast,
            internal=internal,
            saved_evaluation=scores(farm, climate),
            recommendation=summary,
        )

    @app.errorhandler(FileNotFoundError)
    def missing_boundaries(error):
        return jsonify(
            error="Location dataset is unavailable. Run scripts/download_boundaries.py, then restart Flask."
        ), 503

    @app.post("/api/location")
    def location_route():
        latitude, longitude = coordinates(body())
        return jsonify(location=lookup(latitude, longitude))

    @app.post("/api/forecast")
    def forecast_route():
        body()
        farm = get("farm", DEFAULT_FARM)
        lookup(farm["latitude"], farm["longitude"])
        key = f"forecast:v2:{farm['latitude']}:{farm['longitude']}"
        forecast = get(key)
        if forecast and is_recent(forecast.get("retrieved_at"), 10800):
            return jsonify(forecast=forecast, cached=True)
        status_key = key + ":retry"
        retry = get(status_key)
        if retry and datetime.fromisoformat(retry["retry_at"]) > datetime.now(
            timezone.utc
        ):
            return jsonify(
                error="Forecast update is cooling down. Try the device connection or wait a few minutes.",
                retry_at=retry["retry_at"],
            ), 503
        try:
            forecast = fetch_forecast(farm["latitude"], farm["longitude"])
        except (requests.RequestException, ValueError, KeyError, TypeError) as error:
            response = getattr(error, "response", None)
            status = response.status_code if response is not None else None
            app.logger.warning(
                "Forecast update failed: type=%s status=%s",
                type(error).__name__,
                status,
            )
            # Avoid repeatedly calling a shared-IP provider while it is blocked.
            cooldown = 300
            if response is not None:
                try:
                    cooldown = min(
                        3600, max(60, int(response.headers.get("Retry-After", "300")))
                    )
                except (ValueError, TypeError):
                    pass
            put(
                status_key,
                {
                    "retry_at": (
                        datetime.now(timezone.utc) + timedelta(seconds=cooldown)
                    ).isoformat()
                },
            )
            reason = (
                "The forecast service is busy. Try again shortly."
                if status == 429
                else "The forecast service could not complete the update."
            )
            if isinstance(error, requests.Timeout):
                reason = "The forecast service took too long to respond."
            return jsonify(
                error=reason + " Saved forecasts are kept with their original dates."
            ), 502
        put(key, forecast)
        put(status_key, None)
        archive("open_meteo", forecast)
        return jsonify(forecast=forecast, cached=False)

    @app.post("/api/location-photo")
    def location_photo_route():
        body()
        farm = get("farm", DEFAULT_FARM)
        lookup(farm["latitude"], farm["longitude"])
        key = f"street-photo:v1:{farm['latitude']}:{farm['longitude']}"
        saved = get(key)
        if saved:
            lifetime = (
                300
                if saved.get("unavailable")
                else 86400
                if saved.get("photo")
                else 21600
            )
            if is_recent(saved.get("retrieved_at"), lifetime):
                return jsonify(**saved, cached=True)
        try:
            result = fetch_street_photo(farm["latitude"], farm["longitude"])
        except (requests.RequestException, ValueError, KeyError, TypeError):
            # Also cache short outages so page switches do not hammer a free service.
            result = {
                "photo": None,
                "unavailable": True,
                "latitude": farm["latitude"],
                "longitude": farm["longitude"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            }
        put(key, result)
        return jsonify(**result, cached=False)

    @app.post("/api/conditions")
    def conditions_route():
        body()
        farm = get("farm", DEFAULT_FARM)
        lookup(farm["latitude"], farm["longitude"])
        key = f"conditions:v1:{farm['latitude']}:{farm['longitude']}"
        status_key = f"conditions-status:v1:{farm['latitude']}:{farm['longitude']}"
        saved = get(key)
        protected = saved and age_seconds(saved.get("cache_until"))
        if saved and (
            is_recent(saved.get("retrieved_at"), 1800)
            or (protected is not None and protected < 0)
        ):
            return jsonify(conditions=saved, cached=True)
        failure = get(status_key)
        if failure and is_recent(failure.get("checked_at"), 60):
            if saved:
                return jsonify(
                    conditions=saved, cached=True, warning=failure["message"]
                )
            return jsonify(error=failure["message"], code=failure["code"]), 502
        try:
            conditions = fetch_conditions(farm["latitude"], farm["longitude"])
        except (requests.RequestException, ValueError, KeyError, TypeError) as error:
            response = getattr(error, "response", None)
            status = response.status_code if response is not None else None
            app.logger.warning(
                "Current estimates failed: type=%s upstream_status=%s",
                type(error).__name__,
                status,
            )
            reason = "Weather estimates could not be loaded from either service. Try again in a minute."
            code = "conditions_unavailable"
            if isinstance(error, requests.Timeout):
                reason = (
                    "Weather services took too long to reply. Try again in a minute."
                )
                code = "conditions_timeout"
            elif status == 429:
                reason = "Weather services are busy. Try again in a minute."
                code = "conditions_busy"
            elif isinstance(error, requests.ConnectionError):
                reason = "This server could not reach the weather services. Try again in a minute."
                code = "conditions_connection"
            warning = reason + (
                " Saved estimates keep their original time." if saved else ""
            )
            put(
                status_key,
                {
                    "message": warning,
                    "code": code,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            if saved:
                return jsonify(
                    conditions=saved,
                    cached=True,
                    warning=warning,
                )
            return jsonify(error=reason, code=code), 502
        put(key, conditions)
        put(status_key, None)
        return jsonify(conditions=conditions, cached=False)

    @app.post("/api/profile")
    def profile():
        previous = get("farm", DEFAULT_FARM)
        farm = validate_profile(body())
        farm["soil_sample_point"] = sample_point_for(farm, previous)
        farm["location"] = lookup(farm["latitude"], farm["longitude"])
        put("farm", farm)
        return jsonify(farm=farm)

    @app.post("/api/profile/location")
    def save_profile_location():
        latitude, longitude = coordinates(body())
        location = lookup(latitude, longitude)
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT value FROM state WHERE key=?", ("farm",)
            ).fetchone()
            farm = json.loads(row["value"]) if row else DEFAULT_FARM
            previous = farm
            farm = validate_profile(
                {
                    **farm,
                    "latitude": latitude,
                    "longitude": longitude,
                    "municipality": ", ".join(
                        filter(
                            None,
                            [location.get("municipality"), location.get("province")],
                        )
                    ),
                }
            )
            farm["location"] = location
            farm["soil_sample_point"] = sample_point_for(farm, previous)
            conn.execute(
                "INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                ("farm", json.dumps(farm)),
            )
        return jsonify(farm=farm)

    @app.post("/api/climate")
    def climate_route():
        data = body()
        farm = get("farm", DEFAULT_FARM)
        if data.get("mode") not in (None, "nasa"):
            raise ValueError("Download sourced history; sample weather is disabled.")
        try:
            start, end = data.get("start", ""), data.get("end", "")
            a, b = date.fromisoformat(start), date.fromisoformat(end)
        except (ValueError, TypeError):
            raise ValueError("Use valid start and end dates.")
        if (
            a > b
            or b >= ph_today()
            or a < date(1981, 1, 1)
            or not 6 <= (b - a).days <= 1095
        ):
            raise ValueError(
                "Choose 7–1096 historical days from 1981 onward, ending before today."
            )
        key = f"period:nasa:{farm['latitude']}:{farm['longitude']}:{start}:{end}"
        climate = cached_history(key)
        if not sourced(climate):
            try:
                climate = fetch_power(farm["latitude"], farm["longitude"], start, end)
            except (requests.RequestException, KeyError, ValueError, TypeError):
                return jsonify(
                    error="NASA POWER could not download these dates. Existing sourced records are kept."
                ), 502
            climate = {**climate, "cached_at": datetime.now(timezone.utc).isoformat()}
            put(key, climate)
        put("climate", climate)
        return jsonify(climate=climate)

    @app.post("/api/history/sourced")
    def load_sourced_history():
        """Download one year for the saved point; retain existing real data on failure."""
        body()
        farm = get("farm", DEFAULT_FARM)
        end = ph_today() - timedelta(days=7)
        start = end - timedelta(days=364)
        key = f"sourced-history:{farm['latitude']}:{farm['longitude']}:{end}"
        climate = cached_history(key)
        if not sourced(climate):
            for provider in (fetch_power, fetch_archive):
                try:
                    candidate = provider(
                        farm["latitude"],
                        farm["longitude"],
                        start.isoformat(),
                        end.isoformat(),
                    )
                    if not sourced(candidate):
                        raise ValueError("No sourced history returned.")
                    climate = {
                        **candidate,
                        "cached_at": datetime.now(timezone.utc).isoformat(),
                    }
                    put(key, climate)
                    break
                except (requests.RequestException, ValueError, KeyError, TypeError):
                    app.logger.warning(
                        "Sourced history unavailable from %s",
                        provider.__name__
                        if hasattr(provider, "__name__")
                        else "provider",
                    )
            else:
                return jsonify(
                    error="Historical weather could not download. Existing sourced records are kept; no sample data is substituted."
                ), 502
        put("climate", climate)
        put("analysis_period", None)
        return jsonify(climate=climate)

    @app.post("/api/model")
    def internal_forecast_route():
        data = body()
        farm = get("farm", DEFAULT_FARM)
        climate = dataset(data.get("dataset", "current"), farm)
        mode = data.get("mode", "forward")
        method = data.get("method", "auto")
        if mode not in ("forward", "replay"):
            raise ValueError("Choose forward forecast or historical test.")
        period = active_period(farm)
        start = data.get("start") or (period or {}).get("start")
        end = data.get("end") or (period or {}).get("end")
        if mode == "replay":
            validate_period(start, end)
        key = (
            model_key(climate)
            + f":{mode}:{method}"
            + (f":{start}:{end}" if mode == "replay" else "")
        )
        result = get(key)
        if result is None:
            result = (
                replay_period(climate, start, end, method)
                if mode == "replay"
                else build_forecast(climate, method)
            )
            put(key, result)
        provider = (
            saved_forecast(climate["latitude"], climate["longitude"])
            if mode == "forward"
            else get(
                f"comparison:{climate['latitude']}:{climate['longitude']}:{start}:{end}"
            )
        )
        if (
            data.get("dataset", "current") == "current"
            and result.get("status") == "ready"
            and mode == "forward"
            and method == "auto"
        ):
            put(model_key(climate), result)
            archive("internal", result)
        context = {
            **result,
            "source": "Internal "
            + ("historical test" if mode == "replay" else "forecast"),
            "retrieved_at": result.get("issued_at"),
        }
        actions = suggested_actions(
            farm,
            context,
            allow_past=mode == "replay",
            label="Historical test" if mode == "replay" else "Internal forecast",
        )
        if (
            data.get("dataset", "current") == "current"
            and result.get("status") == "ready"
        ):
            put(
                "model_session",
                {
                    "key": key,
                    "climate_key": model_key(climate),
                    "mode": mode,
                    "method": method,
                    "start": start,
                    "end": end,
                },
            )
        return jsonify(
            internal=result,
            provider=provider,
            actions=actions,
            saved_evaluation=scores(climate, climate),
            dataset_label=climate.get("label", climate["source"]),
        )

    @app.post("/api/comparison")
    def comparison_route():
        data = body()
        farm = get("farm", DEFAULT_FARM)
        climate = dataset(data.get("dataset", "current"), farm)
        a, b = validate_period(data.get("start"), data.get("end"))
        key = f"comparison:{climate['latitude']}:{climate['longitude']}:{a.isoformat()}:{b.isoformat()}"
        provider = get(key)
        if provider is None:
            try:
                provider = fetch_archived_forecast(
                    climate["latitude"],
                    climate["longitude"],
                    a.isoformat(),
                    b.isoformat(),
                )
            except (requests.RequestException, KeyError, ValueError, TypeError):
                return jsonify(
                    error="Archived model output could not be loaded. Internal historical testing and reference data are still available."
                ), 502
            put(key, provider)
        return jsonify(provider=provider)

    @app.post("/api/month-outlook")
    def month_outlook():
        from forecast import fetch_month_outlook

        body()
        farm = get("farm", DEFAULT_FARM)
        key = f"month:{farm['latitude']}:{farm['longitude']}"
        old = get(key)
        if (
            old
            and (
                datetime.now(timezone.utc) - datetime.fromisoformat(old["retrieved_at"])
            ).total_seconds()
            < 21600
        ):
            return jsonify(old)
        try:
            result = fetch_month_outlook(farm["latitude"], farm["longitude"])
        except (requests.RequestException, ValueError, KeyError, TypeError):
            if old:
                return jsonify(
                    {
                        **old,
                        "note": old["note"]
                        + " Update failed; showing the saved issue.",
                    }
                )
            return jsonify(
                error="The month outlook could not be loaded. Try again later."
            ), 502
        put(key, result)
        return jsonify(result)

    @app.before_request
    def select_chat_provider():
        if request.path != "/api/chat" or request.method != "POST":
            return
        from assistant_chat import SELECTED_PROVIDER, MODEL_NAMES

        selected = body().get("model")
        if selected is not None and (
            not isinstance(selected, str) or selected not in MODEL_NAMES
        ):
            raise ValueError("Choose Gayuma or Alon.")
        g.chat_provider_token = SELECTED_PROVIDER.set(MODEL_NAMES.get(selected))

    @app.teardown_request
    def reset_chat_provider(error=None):
        from assistant_chat import SELECTED_PROVIDER

        token = g.pop("chat_provider_token", None)
        if token is not None:
            SELECTED_PROVIDER.reset(token)

    @app.get("/api/chat/models")
    def chat_models():
        from assistant_chat import MODEL_NAMES, SELECTED_PROVIDER, ai_enabled

        models = []
        for identifier, provider in MODEL_NAMES.items():
            token = SELECTED_PROVIDER.set(provider)
            try:
                models.append(
                    {
                        "id": identifier,
                        "name": identifier.capitalize(),
                        "available": ai_enabled(),
                    }
                )
            finally:
                SELECTED_PROVIDER.reset(token)
        default = (
            "gayuma"
            if os.environ.get("AGRIFORESIGHT_AI_PROVIDER", "groq").lower()
            in ("gemini", "openrouter")
            else "alon"
        )
        return jsonify(models=models, default=default)

    def chat_weather(farm):
        climate = climate_for(farm)
        period = active_period(farm)
        selected = period_days(climate, period) if period else climate["days"]
        history = describe_weather({**climate, "days": selected})
        history.pop("needs_update", None)
        for field in ("rain", "temp"):
            values = [
                row[field]
                for row in selected
                if isinstance(row.get(field), (int, float))
                and not isinstance(row[field], bool)
            ]
            history["average_" + field] = (
                round(sum(values) / len(values), 2) if values else None
            )
        history["selection"] = period
        internal = get(model_key(climate))
        session = get("model_session")
        if session and session.get("climate_key") == model_key(climate):
            internal = get(session["key"]) or internal
            if internal:
                internal = {**internal, "mode": session.get("mode")}
        return {
            "history": history,
            "forecast": describe_weather(
                saved_forecast(farm["latitude"], farm["longitude"])
            ),
            "outlook": describe_weather(
                get(f"month:{farm['latitude']}:{farm['longitude']}")
            ),
            "internal": describe_weather(internal),
        }

    @app.get("/api/chat/history")
    def chat_history():
        import uuid

        try:
            session = str(uuid.UUID(request.args.get("session", "")))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Start a new chat and try again.")
        return jsonify(messages=get("chat_view:" + session, []) or [])

    @app.post("/api/chat/reset")
    def chat_reset():
        import uuid

        try:
            session = str(uuid.UUID(body().get("session", "")))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Start a new chat and try again.")
        for prefix in ("chat:", "conversation:", "chat_view:", "chat_context:"):
            put(prefix + session, None)
        return jsonify(cleared=True)

    @app.post("/api/chat")
    def chat():
        from assistant_chat import understand, ai_enabled, provider_config
        from crop_planning import suggest
        from assistant_actions import prepare_edits, describe_edits
        from engine import CROP_STAGES
        import uuid

        data = body()
        message = data.get("message", "")
        session = data.get("session", "")
        try:
            session = str(uuid.UUID(session))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Start a new chat and try again.")
        if not isinstance(message, str) or not 1 <= len(message.strip()) <= 2000:
            raise ValueError("Write a short message, up to 2,000 characters.")
        message = message.strip()
        farm = get("farm", DEFAULT_FARM)
        key = "chat:" + session
        pending = get(key)
        mode = "AI-assisted" if ai_enabled() else "Guided assistant"
        history_key = "conversation:" + session
        history = get(history_key, []) or []
        original_message = message
        weather_context = chat_weather(farm)
        chat_context = get("chat_context:" + session, {}) or {}
        if chat_context.get("farm") != farm:
            chat_context = {"farm": farm}

        def reply(text, choices=None, narrate=False, **extra):
            if narrate and ai_enabled():
                try:
                    explained = understand(
                        original_message,
                        history=list(history),
                        context={
                            "weather": weather_context,
                            "today": ph_today().isoformat(),
                            "tool_result": {
                                "text": text,
                                "days": extra.get("days"),
                                "sources": extra.get("sources"),
                            },
                            "instruction": "Explain this completed read-only result. Return chat only. Do not request any action.",
                        },
                    )
                    if explained["intent"] == "chat" and explained["value"].strip():
                        text = explained["value"][:6000]
                except ValueError:
                    pass  # The real app result remains useful when narration is unavailable.

            history.extend(
                [
                    {"role": "user", "content": original_message},
                    {
                        "role": "assistant",
                        "content": (
                            text
                            + (
                                " Saved weather returned: " + json.dumps(extra["days"])
                                if extra.get("days")
                                else ""
                            )
                        )[:2500],
                    },
                ]
            )
            put(history_key, history[-20:])
            view = get("chat_view:" + session, []) or []
            payload = dict(
                text=text,
                choices=choices or [],
                mode=mode,
                provider=provider_config()[0],
                **extra,
            )
            view.extend(
                [
                    {"role": "user", "text": original_message},
                    {"role": "assistant", **payload},
                ]
            )
            put("chat_view:" + session, view[-24:])
            return jsonify(payload)

        if message == "Cancel":
            put(key, None)
            return reply("Okay, cancelled. What would you like to do?")
        if message == "Save this":
            confirmation = data.get("confirmation_id")
            if not isinstance(confirmation, str):
                return reply(
                    "Use Save this on the latest change, or tell me the change again."
                )
            # Lock before reading the proposal and farm, then save and consume it together.
            with db() as conn:
                conn.execute("BEGIN IMMEDIATE")

                def read_saved(name, default=None):
                    row = conn.execute(
                        "SELECT value FROM state WHERE key=?", (name,)
                    ).fetchone()
                    return json.loads(row["value"]) if row else default

                def write_saved(name, value):
                    conn.execute(
                        "INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (name, json.dumps(value)),
                    )

                receipt_key = "chat_saved:" + session + ":" + confirmation
                receipt = read_saved(receipt_key)
                if receipt:
                    result = receipt
                else:
                    pending = read_saved(key)
                    current_farm = read_saved("farm", DEFAULT_FARM)
                    if not pending or pending.get("kind") not in (
                        "crop",
                        "stage",
                        "note",
                        "profile",
                    ):
                        result = {"text": "There is no change waiting to be saved."}
                    elif pending["id"] != confirmation:
                        result = {
                            "text": "Use Save this on the latest change, or tell me the change again."
                        }
                    elif pending["farm"] != current_farm:
                        write_saved(key, None)
                        result = {
                            "text": "The farm changed while we were talking. Please tell me the change again."
                        }
                    else:
                        edits = {}
                        if pending["kind"] == "note":
                            item = {
                                "id": pending["id"],
                                "date": pending["date"],
                                "crop": current_farm["crop"],
                                "note": pending["value"],
                                "technique": "Field note via assistant",
                                "outcome": "unobserved",
                                "yield_kg": None,
                                "municipality": current_farm["municipality"],
                                "created_at": datetime.now(timezone.utc).isoformat(),
                                "schema_version": 2,
                                "farm_context": current_farm,
                            }
                            conn.execute(
                                "INSERT OR IGNORE INTO journals VALUES (?,?)",
                                (item["id"], json.dumps(item)),
                            )
                        else:
                            field = (
                                "crop" if pending["kind"] == "crop" else "crop_stage"
                            )
                            edits = (
                                pending["value"]
                                if pending["kind"] == "profile"
                                else {field: pending["value"]}
                            )
                            updated = validate_profile({**current_farm, **edits})
                            updated["soil_sample_point"] = sample_point_for(
                                updated, current_farm
                            )
                            updated["location"] = current_farm.get("location")
                            write_saved("farm", updated)
                        write_saved(key, None)
                        result = {
                            "text": "Saved your note."
                            if pending["kind"] == "note"
                            else "Saved your farm changes.",
                            "changed": True,
                            "updated_fields": edits,
                        }
                        write_saved(receipt_key, result)
            return reply(**result)

        intent = None
        if ai_enabled():
            context = {
                "weather": weather_context,
                "weather_data_type": history_label(climate_for(farm)),
                "farm": {
                    k: farm.get(k)
                    for k in (
                        "name",
                        "municipality",
                        "area",
                        "crop",
                        "previous_crop",
                        "crop_stage",
                        "water",
                        "terrain",
                        "ph",
                        "previous_ph",
                        "nitrogen",
                        "phosphorus",
                        "potassium",
                        "sample_date",
                        "soil_method",
                        "ash",
                        "planting_date",
                        "ph_medium",
                        "nitrogen_rating",
                        "phosphorus_rating",
                        "potassium_rating",
                    )
                },
                "pending": (
                    {"kind": pending["kind"], "value": pending.get("value")}
                    if pending
                    else None
                ),
                "today": ph_today().isoformat(),
                "drainage": chat_context.get("drainage"),
                "crop_options": chat_context.get("crop_options"),
            }
            intent = understand(message, history=history, context=context)
            if (
                intent["intent"] == "drainage"
                and pending
                and pending.get("kind") == "drainage"
            ):
                message = {
                    "good": "Drains well",
                    "poor": "Water stands",
                    "unknown": "Not sure",
                }.get(intent["value"], message)
        if pending and pending.get("kind") == "note_input" and not ai_enabled():
            intent = {"intent": "note", "value": message}
            put(key, None)
        elif (
            pending
            and pending.get("kind") == "drainage"
            and message in ("Drains well", "Water stands", "Not sure")
        ):
            drainage = {
                "Drains well": "good",
                "Water stands": "poor",
                "Not sure": "unknown",
            }[message]
            result = suggest(
                farm,
                {"drainage": drainage},
                forecast=saved_forecast(farm["latitude"], farm["longitude"]),
            )
            put(key, None)
            chat_context.update(drainage=drainage, crop_options=result["options"])
            put("chat_context:" + session, chat_context)
            options = result["options"]
            top = next((o for o in options if not o["blocked"]), None)
            text = (
                (
                    "One option to discuss is "
                    + top["crop"]
                    + ". "
                    + (" ".join(top["reasons"][:2]))
                    + " "
                    + (" ".join(top["cautions"][:2]))
                )
                if top
                else "Check drainage with a technician before choosing a crop."
            )
            return reply(
                text + " " + result["timing"],
                sources=result["sources"],
                open_page="planting",
                narrate=True,
            )
        elif intent is None:
            intent = understand(message)
        action = intent["intent"]
        value = intent["value"]
        if action == "profile":
            draft = (
                pending["value"]
                if pending
                and pending.get("kind") == "profile"
                and pending.get("farm") == farm
                else None
            )
            try:
                edits = prepare_edits(value, farm, draft)
            except ValueError as exc:
                return reply(str(exc))
            if all(farm.get(k) == v for k, v in edits.items()):
                return reply("Those details are already saved that way.")
            confirmation_id = str(uuid.uuid4())
            put(
                key,
                {
                    "kind": "profile",
                    "value": edits,
                    "farm": farm,
                    "id": confirmation_id,
                },
            )
            return reply(
                "Here’s what I’ll change:\n"
                + describe_edits(edits)
                + "\nDoes that look right?",
                choices=["Save this", "Cancel"],
                confirmation_id=confirmation_id,
                target_field=next(iter(edits)),
            )
        if action == "navigate":
            pages = {
                "farm": "your farm details",
                "forecasts": "the weather",
                "planting": "crop plans",
                "climate": "weather records",
                "journal": "your journal",
                "overview": "the farm overview",
                "learn": "methods and sources",
            }
            if value in pages:
                return reply("Here’s " + pages[value] + ".", navigate=value)
            return reply("Which part of the app would you like to open?")
        if action == "connection_ok":
            return reply("I’m here. What would you like help with?")
        if action == "cancel":
            put(key, None)
            return reply("Okay, we can leave that. What would you like to do instead?")
        if action == "confirm":
            if pending and pending.get("kind") in ("crop", "stage", "note", "profile"):
                return reply(
                    "Tap Save this to keep that change, or tell me what you’d like to adjust.",
                    choices=["Save this", "Cancel"],
                    confirmation_id=pending["id"],
                )
            return reply("What would you like me to go ahead with?")
        if action == "chat":
            extra = {}
            if pending and pending.get("kind") in ("crop", "stage", "note", "profile"):
                extra = {
                    "choices": ["Save this", "Cancel"],
                    "confirmation_id": pending["id"],
                }
            return reply(value[:6000], **extra)
        if action == "weather":
            category = (
                value
                if value in ("history", "outlook", "internal", "forecast")
                else "forecast"
            )
            weather = weather_context[category]
            if not weather["available"]:
                available = [
                    name for name, item in weather_context.items() if item["available"]
                ]
                return reply(
                    "No "
                    + category
                    + " saved yet. Available data: "
                    + ", ".join(available)
                    + ".",
                    choices=["Update weather"] if category == "forecast" else [],
                    open_page="forecasts",
                )
            label = {
                "history": "historical weather",
                "outlook": "30-day outlook",
                "internal": "app prediction",
                "forecast": "short-range forecast",
            }[category]
            text = "Here is the saved " + label + " for " + farm["municipality"] + "."
            if weather.get("mode") == "replay":
                text += " This is a historical test."
            if weather.get("start"):
                text += " Covers " + weather["start"] + " to " + weather["end"] + "."
            if weather.get("source"):
                text += " Source: " + weather["source"] + "."
            if weather["record_count"] > len(weather["days"]):
                text += (
                    " Showing the latest "
                    + str(len(weather["days"]))
                    + " recorded days in this selection."
                )
            if weather["sample"]:
                text += " These are sample values."
            if weather.get("needs_update"):
                text += " This saved issue needs an update before planning future work."
            if weather.get("note"):
                text += " " + str(weather["note"])
            return reply(
                text,
                days=weather["days"],
                choices=["Update weather"] if category == "forecast" else [],
                open_page="climate" if category == "history" else "forecasts",
                narrate=True,
            )
        if action == "farm":
            return reply(
                f"Your farm is {farm['name']} in {farm['municipality']}. {farm['area']} hectares, growing {farm['crop']}, stage: {farm['crop_stage']}. Water: {farm['water']}.",
                open_page="farm",
                narrate=True,
            )
        if action == "crops":
            if chat_context.get("drainage"):
                result = suggest(
                    farm,
                    {"drainage": chat_context["drainage"]},
                    forecast=saved_forecast(farm["latitude"], farm["longitude"]),
                )
                chat_context["crop_options"] = result["options"]
                put("chat_context:" + session, chat_context)
                top = next((o for o in result["options"] if not o["blocked"]), None)
                text = (
                    (
                        "One option is "
                        + top["crop"]
                        + ". "
                        + " ".join(top["reasons"][:2])
                        + " "
                        + " ".join(top["cautions"][:2])
                    )
                    if top
                    else "The field conditions need a closer look before picking a crop."
                )
                return reply(
                    text + " " + result["timing"],
                    sources=result["sources"],
                    open_page="planting",
                    narrate=True,
                )
            put(key, {"kind": "drainage"})
            return reply(
                "After rain, does water stand in your field?",
                choices=["Drains well", "Water stands", "Not sure", "Cancel"],
            )
        if action == "note" and not value:
            put(key, {"kind": "note_input"})
            return reply(
                "What would you like to write down? I will save the note under today’s date.",
                choices=["Cancel"],
            )
        if action in ("crop", "stage", "note"):
            if (
                action == "crop"
                and value not in CROPS
                or action == "stage"
                and value not in CROP_STAGES
            ):
                return reply(
                    "I could not match that value. Try “my crop is rice” or “newly planted”."
                )
            if not value or len(value) > 2000:
                raise ValueError("Keep the note to 2,000 characters.")
            confirmation_id = str(uuid.uuid4())
            put(
                key,
                {
                    "kind": action,
                    "value": value,
                    "farm": farm,
                    "id": confirmation_id,
                    "date": ph_today().isoformat(),
                },
            )
            return reply(
                (
                    "Save this note for today: "
                    if action == "note"
                    else "Update your "
                    + ("crop" if action == "crop" else "crop stage")
                    + " to: "
                )
                + value
                + "?",
                choices=["Save this", "Cancel"],
                confirmation_id=confirmation_id,
                target_field=(
                    "crop"
                    if action == "crop"
                    else "crop_stage"
                    if action == "stage"
                    else None
                ),
            )
        return reply(
            "I can check weather, suggest crops, update your crop or stage, and save notes. Try “my crop is rice” or tap one below.",
            choices=["Check weather", "Choose a crop", "My farm", "Save a note"],
        )

    @app.post("/api/crop-suggestions")
    def crop_suggestions():
        from crop_planning import suggest

        data = body()
        farm = get("farm", DEFAULT_FARM)
        return jsonify(
            suggest(
                farm,
                data,
                climate_for(farm),
                saved_forecast(farm["latitude"], farm["longitude"]),
            )
        )

    @app.post("/api/crop-plan")
    def crop_plan():
        from crop_planning import plan

        data = body()
        farm = get("farm", DEFAULT_FARM)
        return jsonify(plan(farm, data))

    @app.post("/api/history/import")
    def import_history():
        return jsonify(
            error="Use the source-download controls. Unverified weather uploads are disabled."
        ), 410

    @app.post("/api/journal")
    def journal():
        data = body()
        for key in ("id", "date", "crop", "note", "technique", "outcome"):
            if (
                not isinstance(data.get(key), str)
                or not data[key].strip()
                or len(data[key]) > (2000 if key == "note" else 120)
            ):
                raise ValueError(f"Invalid journal {key}.")
        if data["crop"] not in CROPS or data["outcome"] not in (
            "unobserved",
            "better",
            "same",
            "worse",
        ):
            raise ValueError("Invalid crop or outcome.")
        try:
            if date.fromisoformat(data["date"]) > ph_today():
                raise ValueError()
        except ValueError:
            raise ValueError("Journal date must be today or earlier.")
        farm = get("farm", DEFAULT_FARM)
        item = {
            k: data[k].strip()
            for k in ("id", "date", "crop", "note", "technique", "outcome")
        }
        item["yield_kg"] = number(data.get("yield_kg"), "Yield", 0, 10000000, True)
        item["created_at"] = datetime.now(timezone.utc).isoformat()
        item["municipality"] = farm["municipality"]
        item["schema_version"] = 2
        field = data.get("field", "")
        if not isinstance(field, str) or len(field) > 120:
            raise ValueError("Field name must be at most 120 characters.")
        item["field"] = field.strip()
        context = data.get("farm_context")
        if context is not None:
            if not isinstance(context, dict) or len(json.dumps(context)) > 2000:
                raise ValueError("Invalid journal farm context.")
            # Preserve the browser profile at entry time for offline notes; no NLP or inference.
            item["farm_context"] = context
        else:
            item["farm_context"] = {
                key: farm.get(key)
                for key in (
                    "name",
                    "municipality",
                    "latitude",
                    "longitude",
                    "crop_stage",
                    "planting_date",
                )
            }
        recorded = data.get("recorded_at")
        if recorded:
            try:
                stamp = datetime.fromisoformat(recorded.replace("Z", "+00:00"))
                if stamp.tzinfo is None:
                    raise ValueError()
            except (ValueError, AttributeError):
                raise ValueError("Invalid journal timestamp.")
            item["recorded_at"] = recorded
        with db() as conn:
            # Retries of an offline submission cannot create duplicate entries.
            conn.execute(
                "INSERT OR IGNORE INTO journals VALUES (?,?)",
                (item["id"], json.dumps(item)),
            )
        return jsonify(ok=True)

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
