"""Chronological, direct 1–7 day forecasts; no journal text is used."""
import math
from datetime import date, timedelta, datetime, timezone
import numpy as np

VERSION = 'ridge-direct-v2'


def clean_days(climate):
    records, rejected, duplicates = {}, 0, 0
    for row in climate.get('days', []):
        try:
            day = date.fromisoformat(row['date'])
            temp, rain = row['temp'], row['rain']
            if isinstance(temp, bool) or isinstance(rain, bool) or not math.isfinite(temp) or not math.isfinite(rain) or not -60 <= temp <= 65 or not 0 <= rain <= 3000:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            rejected += 1
            continue
        if day in records:
            duplicates += 1
            # Conflicting duplicates are never silently averaged.
            if records[day] != [temp, rain]:
                raise ValueError('Conflicting readings share a date. Resolve duplicate dates before forecasting.')
        records[day] = [temp, rain]
    if not records:
        raise ValueError('No valid temperature/rainfall pairs are available.')
    start, end = min(records), max(records)
    dates = [start + timedelta(days=i) for i in range((end-start).days+1)]
    values = np.array([records.get(day, [np.nan, np.nan]) for day in dates], dtype=float)
    return dates, values, {'valid_days': len(records), 'calendar_days': len(dates), 'missing_days': len(dates)-len(records), 'invalid_rows': rejected, 'duplicate_rows': duplicates}


def features(values, dates, origin, horizon):
    if origin < 13 or not np.isfinite(values[origin-13:origin+1]).all():
        return None
    window = values[origin-13:origin+1]
    target = dates[origin] + timedelta(days=horizon)
    angle = target.timetuple().tm_yday * 2 * math.pi / 365.25
    return np.array([window[-1,0], window[-7,0], window[-3:,0].mean(), window[-7:,0].mean(), window[:,0].mean(), np.log1p(window[-1,1]), window[-3:,1].mean(), window[-7:,1].mean(), window[:,1].mean(), math.sin(angle), math.cos(angle), horizon/7], dtype=float)


def design(values, dates):
    xs, ys, targets = [], [], []
    for origin in range(13, len(values)-1):
        for h in range(1, 8):
            target = origin+h
            if target >= len(values):
                break
            x = features(values, dates, origin, h)
            if x is not None and np.isfinite(values[target]).all():
                xs.append(x)
                ys.append(values[target])
                targets.append(target)
    return np.array(xs), np.array(ys), np.array(targets)


def fit(values, dates, cutoff, prepared=None):
    x,y,targets = prepared if prepared is not None else design(values,dates)
    mask=targets<=cutoff
    x,y=x[mask],y[mask]
    if len(x) < 180:
        return None
    mean, std = x.mean(axis=0), x.std(axis=0)
    std[std < 1e-8] = 1
    z = np.column_stack([np.ones(len(x)), (x-mean)/std])
    penalty = np.eye(z.shape[1]) * 20.0
    penalty[0,0] = 0
    weights = np.linalg.solve(z.T @ z + penalty, z.T @ y)
    return mean, std, weights


def predict(values, dates, origin, model=None):
    baseline = values[origin-13:origin+1].mean(axis=0)
    rows = []
    for h in range(1,8):
        if model is None:
            result = baseline.copy()
        else:
            mean, std, weights = model
            x = features(values, dates, origin, h)
            result = np.r_[1, (x-mean)/std] @ weights
        result[0] = np.clip(result[0], -60, 65)
        result[1] = np.clip(result[1], 0, 3000)
        rows.append(result)
    return np.array(rows)


def metrics(pairs, variable):
    if not pairs:
        return None
    actual = np.array([p['actual'][variable] for p in pairs])
    predicted = np.array([p['predicted'][variable] for p in pairs])
    errors = predicted-actual
    wet = actual >= 1
    return {'n': len(errors), 'mae': round(float(np.abs(errors).mean()),3), 'rmse': round(float(np.sqrt((errors**2).mean())),3), 'bias': round(float(errors.mean()),3), 'mape': round(float((np.abs(errors[wet])/actual[wet]).mean()*100),2) if variable == 1 and wet.any() else None, 'mape_excluded': int((~wet).sum()) if variable == 1 else len(errors)}


def evaluate(values, dates, origins, use_ridge, prepared=None):
    result = {'baseline': [], 'ridge': []}
    for origin in origins:
        if features(values, dates, origin, 1) is None:
            continue
        model = fit(values, dates, origin,prepared) if use_ridge else None
        for name in ('baseline', 'ridge') if model is not None else ('baseline',):
            prediction = predict(values, dates, origin, model if name == 'ridge' else None)
            for h in range(1,8):
                if origin+h < len(values) and np.isfinite(values[origin+h]).all():
                    result[name].append({'date': dates[origin+h].isoformat(), 'origin': dates[origin].isoformat(), 'lead': h, 'actual': values[origin+h].tolist(), 'predicted': prediction[h-1].tolist()})
    return result


def build_forecast(climate, method='auto'):
    if method not in ('auto','baseline','ridge'):
        raise ValueError('Choose automatic, baseline or ridge forecasting.')
    dates, values, quality = clean_days(climate)
    quality['upstream_missing_days'] = climate.get('missing_days',quality['missing_days'])
    usable = [i for i in range(13,len(values)) if features(values,dates,i,1) is not None]
    if not usable:
        return {'status':'insufficient', 'message':'Load at least 14 consecutive days of paired rainfall and temperature. Missing days are not filled.', 'quality':quality, 'days':[], 'version':VERSION}
    end = usable[-1]
    # Never pretend a gap at the end was observed.
    dates, values = dates[:end+1], values[:end+1]
    quality['training_end'] = dates[-1].isoformat()
    quality['trailing_days_excluded'] = quality['calendar_days']-len(dates)
    ridge_ok = not climate.get('demo',False) and quality['valid_days'] >= 365 and len(values) >= 365
    if method=='ridge' and not ridge_ok:
        raise ValueError('Ridge needs at least 365 valid non-synthetic days. Load training history before the test period.')
    prepared=design(values,dates) if ridge_ok else None
    validation, holdout = {'baseline':[], 'ridge':[]}, {'baseline':[], 'ridge':[]}
    selected = ['baseline','baseline']
    if len(values) >= 180:
        n = len(values)
        validation = evaluate(values,dates,range(n-113,n-57,7),ridge_ok,prepared)
        holdout = evaluate(values,dates,range(n-57,n-7,7),ridge_ok,prepared)
        for v in range(2):
            a, b = metrics(validation['baseline'],v), metrics(validation['ridge'],v)
            if a and b and b['mae'] < a['mae'] * .98:
                selected[v] = 'ridge'
    automatic=selected.copy()
    if method!='auto':
        selected=[method,method]
    model = fit(values,dates,len(values)-1,prepared) if 'ridge' in selected else None
    if method=='ridge' and model is None:
        raise ValueError('Too few complete input windows to fit ridge. Check missing dates or use the baseline.')
    baseline = predict(values,dates,len(values)-1)
    ridge = predict(values,dates,len(values)-1,model) if model is not None else baseline
    output = []
    for h in range(1,8):
        row = {'date':(dates[-1]+timedelta(days=h)).isoformat()}
        for v,key in enumerate(('temp','rain')):
            prediction = float((ridge if selected[v] == 'ridge' else baseline)[h-1,v])
            residuals = [abs(p['actual'][v]-p['predicted'][v]) for p in holdout[selected[v]] if p['lead'] == h]
            # Same-lead residual spread is descriptive, not a calibrated confidence claim.
            spread = float(np.quantile(residuals,.9)) if len(residuals) >= 5 else None
            row[key] = round(prediction,2)
            row[key+'_range'] = [round(max(0 if v else -60,prediction-spread),2),round(prediction+spread,2)] if spread is not None else None
        output.append(row)
    evaluation = {}
    for v,key in enumerate(('temp','rain')):
        evaluation[key] = {'selected':selected[v], 'selection_mae':{name:metrics(pairs,v) for name,pairs in validation.items()}, 'holdout':{name:metrics(pairs,v) for name,pairs in holdout.items()}}
    return {'status':'ready', 'version':VERSION, 'mode':'forward', 'method_override':method, 'automatic_selection':automatic, 'issued_at':datetime.now(timezone.utc).isoformat(), 'source':climate['source'], 'demo':climate.get('demo',False), 'latitude':climate['latitude'], 'longitude':climate['longitude'], 'quality':quality, 'days':output, 'evaluation':evaluation, 'ridge_eligible':ridge_ok,
            'method':'Direct 1–7 day ridge regression vs trailing 14-day mean. Selection uses earlier rolling validation; later weekly origins are held out. Ridge must improve validation MAE by at least 2%. Each origin fits only past targets.',
            'range_note':'Ranges show the 90th percentile of absolute same-lead holdout errors (at least 5 errors). They are descriptive error bands, not calibrated probabilities.',
            'reference_note':('NASA POWER is a gridded historical reference, not a farm weather station. ' if 'NASA' in climate['source'] else 'Source records are not independently verified. ')+'Internal forecasts start after the latest complete 14-day input window; old inputs produce old forecast dates.'}


def replay_period(climate,start,end,method='auto'):
    a,b=date.fromisoformat(start),date.fromisoformat(end)
    if a>b or (b-a).days>365:
        raise ValueError('Choose a historical test period of at most 366 days.')
    before={**climate,'days':[r for r in climate['days'] if r['date']<start]}
    if len(before['days'])<14:
        raise ValueError('The test needs at least 14 consecutive days BEFORE its start. Load the period with training history, not October alone.')
    selection=build_forecast(before,method)
    if selection['status']!='ready':
        raise ValueError(selection['message'])
    dates,values,quality=clean_days(climate)
    indexes={d:i for i,d in enumerate(dates)}
    chosen=[selection['evaluation'][k]['selected'] for k in ('temp','rain')]
    prepared=design(values,dates) if 'ridge' in chosen else None
    rows=[]; pairs=[]; current=a
    while current<=b:
        origin=indexes.get(current-timedelta(days=1))
        row={'date':current.isoformat(),'origin':(current-timedelta(days=1)).isoformat(),'temp':None,'rain':None,'temp_range':None,'rain_range':None,'actual_temp':None,'actual_rain':None}
        target=indexes.get(current)
        if target is not None and np.isfinite(values[target]).all():
            row['actual_temp'],row['actual_rain']=values[target].tolist()
        if origin is not None and features(values,dates,origin,1) is not None:
            base=predict(values,dates,origin)[0]
            fitted=fit(values,dates,origin,prepared) if prepared is not None else None
            ridge=predict(values,dates,origin,fitted)[0] if fitted is not None else base
            result=[float((ridge if chosen[v]=='ridge' else base)[v]) for v in range(2)]
            row.update(temp=round(result[0],2),rain=round(result[1],2))
            if row['actual_temp'] is not None:
                pairs.append({'actual':[row['actual_temp'],row['actual_rain']],'predicted':result})
        rows.append(row);current+=timedelta(days=1)
    if not any(row['temp'] is not None for row in rows):
        raise ValueError('No usable daily input windows cover this test period. Load the period with earlier training history.')
    return {**selection,'mode':'replay','days':rows,'period':{'start':start,'end':end},'quality':{**quality,'training_end':selection['quality']['training_end']},'replay_metrics':{key:metrics(pairs,v) for v,key in enumerate(('temp','rain'))},'message':'Rolling one-day-ahead historical test. Each day uses only earlier records; this is not a month-long forecast issued on the first day. Missing input windows remain blank.'}
