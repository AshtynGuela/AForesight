from datetime import datetime, timedelta, timezone

PH_TIME = timezone(timedelta(hours=8))


def ph_today():
    return datetime.now(PH_TIME).date()


def age_seconds(timestamp):
    """Return the age of an aware ISO timestamp, or None for unusable metadata."""
    try:
        return (
            datetime.now(timezone.utc) - datetime.fromisoformat(timestamp)
        ).total_seconds()
    except (ValueError, TypeError):
        return None


def is_recent(timestamp, lifetime):
    age = age_seconds(timestamp)
    return age is not None and 0 <= age < lifetime
