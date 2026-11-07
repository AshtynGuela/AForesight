"""Small, dated weather summaries passed to the assistant on each message."""

from time_utils import age_seconds, ph_today


def describe_weather(payload, limit=31):
    if not payload:
        return {"available": False}
    rows = sorted(payload.get("days") or [], key=lambda row: row.get("date", ""))
    timestamp = payload.get("retrieved_at") or payload.get("issued_at")
    age = age_seconds(timestamp)
    return {
        "available": True,
        "source": payload.get("source"),
        "sample": bool(payload.get("demo")),
        "status": payload.get("status"),
        "mode": payload.get("mode"),
        "saved_at": timestamp,
        "needs_update": age is None
        or age < 0
        or age > 172800
        or bool(rows and rows[-1]["date"] < ph_today().isoformat()),
        "start": rows[0]["date"] if rows else None,
        "end": rows[-1]["date"] if rows else None,
        "record_count": len(rows),
        "days": rows[-limit:],
        "note": payload.get("note") or payload.get("message"),
    }
