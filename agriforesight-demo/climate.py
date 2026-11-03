"""NASA adapter: explicit provenance, missing-value handling and a separate demo."""
from datetime import date, timedelta, datetime, timezone
import requests

NASA_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point'


def demo(latitude, longitude):
    start = date(2025, 3, 1)
    return {'source': 'Synthetic demo — not observed weather', 'demo': True, 'latitude': latitude, 'longitude': longitude, 'retrieved_at': None, 'days': [{'date': (start + timedelta(days=i)).isoformat(), 'rain': [0, 2, 0, 7, 1, 0, 4][i % 7], 'temp': round(28 + (i % 6) * .35, 1)} for i in range(30)], 'missing_days': 0}


def fetch_power(latitude, longitude, start, end):
    response = requests.get(NASA_URL, params={'parameters': 'T2M,PRECTOTCORR', 'community': 'AG', 'latitude': latitude, 'longitude': longitude, 'start': start.replace('-', ''), 'end': end.replace('-', ''), 'format': 'JSON'}, timeout=(8, 35))
    response.raise_for_status()
    payload = response.json()
    params = payload['properties']['parameter']
    days = []
    current, stop = date.fromisoformat(start), date.fromisoformat(end)
    missing = 0
    while current <= stop:
        key = current.strftime('%Y%m%d')
        temp, rain = params['T2M'].get(key), params['PRECTOTCORR'].get(key)
        if isinstance(temp, (int, float)) and isinstance(rain, (int, float)) and not isinstance(temp,bool) and not isinstance(rain,bool) and -60 <= temp <= 65 and 0 <= rain <= 3000:
            days.append({'date': current.isoformat(), 'temp': temp, 'rain': rain})
        else:
            missing += 1
        current += timedelta(days=1)
    if not days:
        raise ValueError('NASA returned no usable observations for this period.')
    return {'source': 'NASA POWER — gridded historical data', 'kind':'gridded_reference', 'demo': False, 'latitude': latitude, 'longitude': longitude, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'request_start':start, 'request_end':end, 'time_standard':'Local Solar Time', 'days': days, 'missing_days': missing}


def fetch_archive(latitude,longitude,start,end):
    response=requests.get('https://archive-api.open-meteo.com/v1/archive',params={'latitude':latitude,'longitude':longitude,'start_date':start,'end_date':end,'daily':'temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration','timezone':'Asia/Manila','models':'era5'},timeout=(8,45))
    response.raise_for_status()
    payload=response.json()['daily'];rows=[]
    for i,day in enumerate(payload['time']):
        temp=payload['temperature_2m_mean'][i];rain=payload['precipitation_sum'][i]
        if isinstance(temp,(int,float)) and isinstance(rain,(int,float)) and -60<=temp<=65 and 0<=rain<=3000:
            et0=payload.get('et0_fao_evapotranspiration',[None]*len(payload['time']))[i]
            rows.append({'date':day,'temp':temp,'rain':rain,'et0':et0 if isinstance(et0,(int,float)) and 0<=et0<=30 else None})
    if not rows:raise ValueError('Archive returned no usable daily records.')
    return {'source':'ERA5 reanalysis via Open-Meteo archive','kind':'gridded_reference','demo':False,'latitude':latitude,'longitude':longitude,'days':rows,'missing_days':(date.fromisoformat(end)-date.fromisoformat(start)).days+1-len(rows),'retrieved_at':datetime.now(timezone.utc).isoformat(),'request_start':start,'request_end':end,'time_standard':'Asia/Manila'}
