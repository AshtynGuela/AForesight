"""Farm input validation and the dashboard summary."""
import math
from datetime import date
from forecast import summarize_forecast
from time_utils import ph_today

CROPS = ('rice', 'corn', 'mungbean', 'sweet potato')
CROP_STAGES = ('unknown', 'preparation', 'establishment', 'vegetative', 'flowering', 'maturity', 'harvest')


def number(value, name, low, high, optional=False):
    if optional and (value is None or value == ''):
        return None
    if isinstance(value, bool):
        raise ValueError(f'{name} must be a number.')
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} must be a number.')
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}.')
    return value


def validate_profile(data):
    if not isinstance(data, dict):
        raise ValueError('A farm object is required.')
    result = {}
    for key in ('name', 'municipality', 'terrain', 'water', 'crop', 'previous_crop', 'soil_method', 'sample_date', 'crop_stage', 'planting_date'):
        value = data.get(key, 'unknown' if key == 'crop_stage' else '')
        if not isinstance(value, str) or len(value) > 120:
            raise ValueError(f'Invalid {key}.')
        result[key] = value.strip()
    if not result['name'] or not result['municipality']:
        raise ValueError('Farm name and municipality are required.')
    for key, choices in {'crop': CROPS, 'previous_crop': (*CROPS, 'unknown'), 'water': ('rainfed', 'irrigated'), 'terrain': ('lowland', 'upland', 'coastal'), 'soil_method': ('unknown', 'lab', 'sensor', 'field kit'), 'crop_stage': CROP_STAGES}.items():
        if result[key] not in choices:
            raise ValueError(f'Invalid {key}.')
    if result['planting_date']:
        try:
            if date.fromisoformat(result['planting_date']) > ph_today():
                raise ValueError()
        except ValueError:
            raise ValueError('Planting date must be a valid date in the past or today.')
    for key, low, high in [('latitude', 4, 22), ('longitude', 116, 127), ('area', .01, 10000), ('ph', 0, 14), ('previous_ph', 0, 14), ('nitrogen', 0, 100000), ('phosphorus', 0, 100000), ('potassium', 0, 100000)]:
        result[key] = number(data.get(key), key, low, high, key in ('ph', 'previous_ph', 'nitrogen', 'phosphorus', 'potassium'))
    if not isinstance(data.get('ash', False), bool):
        raise ValueError('Ash exposure must be true or false.')
    result['ash'] = data.get('ash', False)
    if result['sample_date']:
        try:
            if date.fromisoformat(result['sample_date']) > ph_today():
                raise ValueError()
        except ValueError:
            raise ValueError('Soil sample date must be a valid date in the past or today.')
    return result


def recommend(farm, climate, journals=(), forecast=None):
    # Compatibility summary. Journals remain stored records for later NLP.
    from advice import suggested_actions
    days = climate['days']
    if not days:
        raise ValueError('No usable climate observations.')
    rain = sum(d['rain'] for d in days) / len(days) * 30
    temp = sum(d['temp'] for d in days) / len(days)
    relevant = [j for j in journals if j['crop'] == farm['crop']]
    return {'rain': round(rain, 1), 'temp': round(temp, 1),
            'baseline_rain': round(rain, 1), 'baseline_temp': round(temp, 1), 'risk':'Check field conditions',
            'actions':suggested_actions(farm, forecast), 'history_count':len(relevant),
            'history_note': f'{len(relevant)} notes for this crop. Saved for later, not used for forecasts or advice.',
            'source':climate['source'], 'scenario':False,
            'forecast_summary':summarize_forecast(forecast) if forecast else None}
