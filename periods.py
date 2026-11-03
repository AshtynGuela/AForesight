"""Shared historical analysis windows and date validation."""
from datetime import date,timedelta
from time_utils import ph_today


def validate_period(start,end,max_days=366):
    try:
        a,b=date.fromisoformat(start),date.fromisoformat(end)
    except (ValueError,TypeError):
        raise ValueError('Use valid start and end dates.')
    if a>b or b>=ph_today() or a<date(1983,1,1) or (b-a).days>=max_days:
        raise ValueError(f'Choose 1–{max_days} historical days from 1983 onward, ending before today.')
    return a,b


def period_days(climate,period):
    return [r for r in climate['days'] if period['start']<=r['date']<=period['end']]
