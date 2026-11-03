from datetime import datetime, timedelta, timezone

PH_TIME = timezone(timedelta(hours=8))


def ph_today():
    return datetime.now(PH_TIME).date()
