"""Optional weather enrichment, kept separate from measured soil and history."""

import math
from datetime import datetime, timezone, date, timedelta
import requests


def finite(value, low, high):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and low <= value <= high
    )


def summarize_forecast(forecast):
    """Return descriptive forecast indicators, not crop-specific prescriptions."""
    days = forecast.get("days", []) if isinstance(forecast, dict) else []
    usable = []
    seen = set()
    for day in days:
        try:
            parsed = date.fromisoformat(day["date"])
        except (KeyError, TypeError, ValueError):
            continue
        if finite(day.get("rain"), 0, 3000) and parsed not in seen:
            usable.append(day)
            seen.add(parsed)
    usable.sort(key=lambda d: d["date"])
    if not usable:
        return None
    rain = [day["rain"] for day in usable]
    high = [day["high"] for day in usable if finite(day.get("high"), -60, 65)]
    et0 = [day["et0"] for day in usable if finite(day.get("et0"), 0, 100)]
    dry_spell_days = 0
    current = 0
    previous = None
    for row in usable:
        day = date.fromisoformat(row["date"])
        if previous is None or day - previous != timedelta(days=1):
            current = 0
        current = current + 1 if row["rain"] < 1 else 0
        dry_spell_days = max(dry_spell_days, current)
        previous = day
    return {
        "days": len(usable),
        "rain_total": round(sum(rain), 1),
        "et0_total": round(sum(et0), 1) if len(et0) == len(usable) else None,
        "rain_minus_et0": round(sum(rain) - sum(et0), 1)
        if len(et0) == len(usable)
        else None,
        "max_dry_spell_days": dry_spell_days,
        "heat_days": sum(1 for value in high if value >= 35),
        "method": "Dry spell counts consecutive forecast days with <1 mm rain; heat day is max temperature >=35 °C.",
    }


def fetch_forecast(latitude, longitude):
    response = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "timezone": "Asia/Manila",
            "forecast_days": 7,
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
            "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration",
        },
        timeout=(8, 25),
    )
    response.raise_for_status()
    data = response.json()
    daily = data["daily"]
    rows = []
    seen = set()
    fields = {
        "temp": ("temperature_2m_mean", -60, 65),
        "high": ("temperature_2m_max", -60, 65),
        "low": ("temperature_2m_min", -60, 65),
        "rain": ("precipitation_sum", 0, 3000),
        "probability": ("precipitation_probability_max", 0, 100),
        "et0": ("et0_fao_evapotranspiration", 0, 100),
    }
    for i, day in enumerate(daily["time"]):
        try:
            date.fromisoformat(day)
        except (TypeError, ValueError):
            continue
        if day in seen:
            continue
        seen.add(day)
        row = {"date": day}
        for key, (parameter, low, high) in fields.items():
            values = daily.get(parameter, [])
            value = values[i] if i < len(values) else None
            row[key] = value if finite(value, low, high) else None
        rows.append(row)
    rows.sort(key=lambda row: row["date"])
    if not rows or not any(
        r["high"] is not None and r["rain"] is not None for r in rows
    ):
        raise ValueError("No usable forecast data.")
    elevation = data.get("elevation")
    return {
        "source": "Open-Meteo",
        "latitude": latitude,
        "longitude": longitude,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "Asia/Manila",
        "elevation": elevation if finite(elevation, -500, 9000) else None,
        "days": rows,
    }


def fetch_archived_forecast(latitude, longitude, start, end):
    response = requests.get(
        "https://historical-forecast-api.open-meteo.com/v1/forecast",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start,
            "end_date": end,
            "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration",
            "timezone": "Asia/Manila",
        },
        timeout=(8, 40),
    )
    response.raise_for_status()
    daily = response.json()["daily"]
    rows = []
    for i, day in enumerate(daily["time"]):
        row = {"date": day}
        for key, field, low, high in [
            ("temp", "temperature_2m_mean", -60, 65),
            ("rain", "precipitation_sum", 0, 3000),
            ("high", "temperature_2m_max", -60, 65),
            ("low", "temperature_2m_min", -60, 65),
            ("et0", "et0_fao_evapotranspiration", 0, 30),
        ]:
            values = daily.get(field, [])
            value = values[i] if i < len(values) else None
            row[key] = value if finite(value, low, high) else None
        rows.append(row)
    if not rows:
        raise ValueError("Archived model output is unavailable for these dates.")
    return {
        "source": "Open-Meteo archived model output",
        "kind": "historical_model_output",
        "latitude": latitude,
        "longitude": longitude,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "days": rows,
        "note": "Stitched archived model output, not a fixed-issue or equal-lead forecast. Comparison is descriptive.",
    }


def fetch_month_outlook(latitude, longitude):
    response = requests.get(
        "https://seasonal-api.open-meteo.com/v1/seasonal",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "timezone": "Asia/Manila",
            "forecast_days": 30,
            "models": "ecmwf_ec46_ensemble_mean",
            "daily": "temperature_2m_mean,precipitation_sum",
        },
        timeout=(8, 40),
    )
    response.raise_for_status()
    daily = response.json()["daily"]
    rows = []
    for i, day in enumerate(daily["time"]):
        temp = daily.get("temperature_2m_mean", [])
        rain = daily.get("precipitation_sum", [])
        rows.append(
            {
                "date": day,
                "temp": temp[i] if i < len(temp) and finite(temp[i], -60, 65) else None,
                "rain": rain[i] if i < len(rain) and finite(rain[i], 0, 3000) else None,
            }
        )
    if not rows or not any(r["rain"] is not None for r in rows):
        raise ValueError("No usable month outlook returned.")
    return {
        "source": "ECMWF EC46 ensemble mean via Open-Meteo",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "days": rows,
        "note": "Broad area outlook at about 36 km resolution. Not bias-corrected for this farm. Use weekly patterns for planning; daily amounts are uncertain.",
    }


def fetch_conditions(latitude, longitude):
    """Nearby model estimates; these are separate from user-entered soil tests."""
    response = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": latitude,
            "longitude": longitude,
            "timezone": "Asia/Manila",
            "current": "temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm",
            "temperature_unit": "celsius",
        },
        timeout=(8, 25),
    )
    response.raise_for_status()
    payload = response.json()
    current = payload["current"]
    stamp = datetime.fromisoformat(current["time"])
    stamp = stamp.replace(
        tzinfo=timezone(timedelta(seconds=payload["utc_offset_seconds"]))
    )
    fields = [
        ("temperature", "temperature_2m", -60, 65),
        ("humidity", "relative_humidity_2m", 0, 100),
        ("soil_moisture", "soil_moisture_0_to_1cm", 0, 1),
    ]
    values = {}
    for name, parameter, low, high in fields:
        value = current.get(parameter)
        values[name] = value if finite(value, low, high) else None
    if all(value is None for value in values.values()):
        raise ValueError("No usable current estimates returned.")
    return {
        **values,
        "latitude": latitude,
        "longitude": longitude,
        "source": "Open-Meteo weather model",
        "kind": "model_estimate",
        "source_url": "https://open-meteo.com/en/docs",
        "valid_at": stamp.isoformat(),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "soil_depth_cm": [0, 1],
        "soil_moisture_unit": "m³/m³",
    }
