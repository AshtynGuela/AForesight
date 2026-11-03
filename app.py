"""Local, single-farm Flask API. Run with: python app.py."""
import json
import hashlib
import csv
import io
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from datetime import date, datetime, timezone, timedelta
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
import requests
from engine import validate_profile, recommend, number, CROPS
from climate import demo, fetch_power, fetch_archive
from location import lookup, coordinates
from forecast import fetch_forecast, fetch_archived_forecast
from modelling import build_forecast, replay_period, clean_days, VERSION
from evaluation import archive_scores
from time_utils import ph_today
from periods import validate_period, period_days
from advice import suggested_actions, simulation_actions

ROOT = Path(__file__).parent
DEFAULT_FARM = {'name': 'My Bicol farm', 'municipality': 'Legazpi, Albay', 'latitude': 13.1391, 'longitude': 123.7438, 'area': 1, 'terrain': 'lowland', 'water': 'rainfed', 'crop': 'rice', 'previous_crop': 'corn', 'crop_stage': 'unknown', 'planting_date': '', 'ph': None, 'previous_ph': None, 'nitrogen': None, 'phosphorus': None, 'potassium': None, 'ash': False, 'soil_method': 'unknown', 'sample_date': ''}


def create_app(database=None):
    app = Flask(__name__, static_folder='static', static_url_path='/static')
    app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024
    db_path = Path(database or os.environ.get('AGRIFORESIGHT_DB', ROOT / 'instance' / 'farm.sqlite3'))
    db_path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def db():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    with db() as conn:
        conn.executescript('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS journals (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS forecast_issues (id TEXT PRIMARY KEY, kind TEXT, latitude REAL, longitude REAL, issued_at TEXT, payload TEXT);')

    def get(key, default=None):
        with db() as conn:
            row = conn.execute('SELECT value FROM state WHERE key=?', (key,)).fetchone()
        return json.loads(row['value']) if row else default

    def put(key, value):
        with db() as conn:
            conn.execute('INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, json.dumps(value)))

    def entries():
        with db() as conn:
            return [json.loads(r['payload']) for r in conn.execute('SELECT payload FROM journals ORDER BY rowid DESC')]

    def climate_for(farm):
        climate = get('climate')
        if climate and (climate['latitude'], climate['longitude']) == (farm['latitude'], farm['longitude']):
            return climate
        return demo(farm['latitude'], farm['longitude'])

    def model_key(climate):
        digest=hashlib.sha256(json.dumps(climate,sort_keys=True).encode()).hexdigest()
        return f'model:{VERSION}:{digest}'

    def saved_forecast(latitude, longitude):
        # Preserve older cached weather when the newer mean-temperature request is unavailable.
        return get(f'forecast:v2:{latitude}:{longitude}') or get(f'forecast:{latitude}:{longitude}')

    def archive(kind, payload):
        if payload.get('demo') or not payload.get('days'):
            return
        issued=payload.get('issued_at') or payload.get('retrieved_at')
        if not issued:
            return
        encoded=json.dumps(payload,sort_keys=True)
        identifier=hashlib.sha256((kind+encoded).encode()).hexdigest()
        with db() as conn:
            conn.execute('INSERT OR IGNORE INTO forecast_issues VALUES (?,?,?,?,?,?)',(identifier,kind,payload['latitude'],payload['longitude'],issued,encoded))

    def scores(farm, climate):
        with db() as conn:
            rows=conn.execute('SELECT * FROM forecast_issues WHERE latitude=? AND longitude=? ORDER BY issued_at DESC LIMIT 1000',(farm['latitude'],farm['longitude'])).fetchall()
        snapshots=[{**dict(row),'payload':json.loads(row['payload'])} for row in rows]
        return archive_scores(snapshots,climate)

    def dataset(name, farm):
        if name in (None,'current'):
            return climate_for(farm)
        if name not in ('legazpi','naga'):
            raise ValueError('Unknown sample dataset.')
        return json.loads((ROOT/'data'/'samples'/f'{name}.json').read_text(encoding='utf-8'))

    def active_period(farm):
        period=get('analysis_period')
        return period if period and (period['latitude'],period['longitude'])==(farm['latitude'],farm['longitude']) else None

    def period_advice(farm,climate,forecast):
        period=active_period(farm)
        days=period_days(climate,period) if period else []
        if days:
            return suggested_actions(farm,{**climate,'days':days},allow_past=True,label='Historical review: '+period['start']+' to '+period['end'])
        return suggested_actions(farm,forecast)

    @app.post('/api/period')
    def set_period():
        data=body();a,b=validate_period(data.get('start'),data.get('end'))
        farm=get('farm',DEFAULT_FARM)
        provider=data.get('provider','nasa')
        if provider not in ('nasa','era5','saved'):
            raise ValueError('Choose NASA POWER, ERA5 or saved records.')
        if provider=='saved':
            climate=climate_for(farm)
            if not any(a.isoformat()<=r['date']<=b.isoformat() for r in climate['days']):
                raise ValueError('Saved records do not cover this period. Load NASA POWER/ERA5 or import records for these dates.')
        else:
            training_start=(a-timedelta(days=730)).isoformat()
            key=f'period:{provider}:{farm["latitude"]}:{farm["longitude"]}:{training_start}:{b.isoformat()}'
            climate=get(key)
            if climate is None:
                try:
                    climate=(fetch_power if provider=='nasa' else fetch_archive)(farm['latitude'],farm['longitude'],training_start,b.isoformat())
                except (requests.RequestException,KeyError,ValueError,TypeError):
                    return jsonify(error='The weather service could not load this period. Previous records are kept. Try the other source or saved/imported data.'),502
                put(key,climate)
        put('climate',climate)
        period={'start':a.isoformat(),'end':b.isoformat(),'latitude':farm['latitude'],'longitude':farm['longitude'],'provider':provider}
        put('analysis_period',period)
        return jsonify(period=period)

    @app.post('/api/history/record')
    def edit_weather_record():
        data=body();farm=get('farm',DEFAULT_FARM);climate=climate_for(farm)
        a,_=validate_period(data.get('date'),data.get('date'))
        operation=data.get('operation','upsert')
        if operation not in ('upsert','delete'):raise ValueError('Choose save or delete.')
        records={r['date']:r for r in climate['days']}
        before=records.get(a.isoformat())
        if operation=='delete':
            if before is None:raise ValueError('No record exists on this date.')
            del records[a.isoformat()]
        else:
            records[a.isoformat()]={'date':a.isoformat(),'temp':number(data.get('temp'),'Mean temperature',-60,65),'rain':number(data.get('rain'),'Daily rain',0,3000)}
        if len(records)<7:raise ValueError('Keep at least seven daily records.')
        if (date.fromisoformat(max(records))-date.fromisoformat(min(records))).days>1826:raise ValueError('Keep the dataset within five years; load another period first.')
        timestamp=datetime.now(timezone.utc).isoformat()
        put('history_backup:'+timestamp,climate)
        base=climate.get('base_source',climate['source'])
        days=sorted(records.values(),key=lambda r:r['date'])
        updated={**climate,'base_source':base,'source':'Edited '+base+' — includes unverified user values','kind':'user_edited','days':days,'missing_days':(date.fromisoformat(days[-1]['date'])-date.fromisoformat(days[0]['date'])).days+1-len(days),'edited_at':timestamp,'edits':climate.get('edits',[])+[{'date':a.isoformat(),'before':before,'after':records.get(a.isoformat()),'at':timestamp}]}
        put('climate',updated)
        return jsonify(ok=True)

    @app.get('/api/history/backups')
    def history_backups():
        farm=get('farm',DEFAULT_FARM)
        with db() as conn:rows=conn.execute("SELECT key,value FROM state WHERE key LIKE 'history_backup:%' ORDER BY key DESC LIMIT 30").fetchall()
        backups=[]
        for row in rows:
            climate=json.loads(row['value'])
            if (climate['latitude'],climate['longitude'])==(farm['latitude'],farm['longitude']):backups.append({'id':row['key'],'source':climate['source'],'start':climate['days'][0]['date'],'end':climate['days'][-1]['date']})
        return jsonify(backups=backups)

    @app.post('/api/history/restore')
    def restore_history():
        identifier=body().get('id','')
        if not isinstance(identifier,str) or not identifier.startswith('history_backup:'):raise ValueError('Choose a valid saved backup.')
        climate=get(identifier);farm=get('farm',DEFAULT_FARM)
        if not climate or (climate['latitude'],climate['longitude'])!=(farm['latitude'],farm['longitude']):raise ValueError('Backup unavailable for this farm location.')
        put('history_backup:'+datetime.now(timezone.utc).isoformat(),climate_for(farm))
        put('climate',climate)
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
        if request.method == 'POST' and not request.is_json:
            return jsonify(error='Send application/json.'), 415
        if request.method == 'POST' and request.headers.get('Origin') and request.headers['Origin'] != request.host_url.rstrip('/'):
            return jsonify(error='Cross-origin writes are disabled.'), 403

    def body():
        data = request.get_json()
        if not isinstance(data, dict):
            raise ValueError('A JSON object is required.')
        return data

    @app.get('/healthz')
    def health():
        with db() as conn:
            conn.execute('SELECT 1').fetchone()
        return jsonify(status='ok')

    @app.get('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.get('/sw.js')
    def service_worker():
        return send_from_directory(app.static_folder, 'sw.js', max_age=0)

    @app.get('/api/state')
    def state():
        farm = get('farm', DEFAULT_FARM)
        climate = climate_for(farm)
        journals = entries()
        forecast = saved_forecast(farm['latitude'],farm['longitude'])
        internal = get(model_key(climate))
        period=active_period(farm)
        selected_days=period_days(climate,period) if period else []
        summary=recommend(farm,{**climate,'days':selected_days} if selected_days else climate,journals=journals,forecast=forecast)
        summary['actions']=period_advice(farm,climate,forecast)
        analysis=None;session=get('model_session')
        if session and session.get('climate_key')==model_key(climate):
            result=get(session['key'])
            matches=session['mode']=='forward' or (period and session.get('start')==period['start'] and session.get('end')==period['end'])
            if result and matches:
                provider=forecast if session['mode']=='forward' else get(f'comparison:{farm["latitude"]}:{farm["longitude"]}:{session["start"]}:{session["end"]}')
                analysis={'internal':result,'provider':provider,'actions':suggested_actions(farm,{**result,'source':'Internal '+session['mode'],'retrieved_at':result.get('issued_at')},allow_past=session['mode']=='replay',label='Historical test' if session['mode']=='replay' else 'Internal forecast')}
        return jsonify(demo_mode=os.environ.get('AGRIFORESIGHT_DEMO')=='1', farm=farm, climate=climate, weather_actions=suggested_actions(farm,forecast), analysis_period=period, analysis=analysis, journals=journals, forecast=forecast, internal=internal, saved_evaluation=scores(farm,climate), recommendation=summary)

    @app.errorhandler(FileNotFoundError)
    def missing_boundaries(error):
        return jsonify(error='Location dataset is unavailable. Run scripts/download_boundaries.py, then restart Flask.'), 503

    @app.post('/api/location')
    def location_route():
        latitude, longitude = coordinates(body())
        return jsonify(location=lookup(latitude, longitude))

    @app.post('/api/forecast')
    def forecast_route():
        body()
        farm = get('farm', DEFAULT_FARM)
        lookup(farm['latitude'], farm['longitude'])
        key = f'forecast:v2:{farm["latitude"]}:{farm["longitude"]}'
        forecast = get(key)
        if forecast and 0 <= (datetime.now(timezone.utc) - datetime.fromisoformat(forecast['retrieved_at'])).total_seconds() < 10800:
            return jsonify(forecast=forecast, cached=True)
        try:
            forecast = fetch_forecast(farm['latitude'], farm['longitude'])
        except (requests.RequestException, ValueError, KeyError, TypeError):
            return jsonify(error='Forecast provider is unavailable. Any previous forecast is retained with its original dates.'), 502
        put(key, forecast)
        archive('open_meteo', forecast)
        return jsonify(forecast=forecast, cached=False)

    @app.post('/api/profile')
    def profile():
        farm = validate_profile(body())
        farm['location'] = lookup(farm['latitude'], farm['longitude'])
        put('farm', farm)
        return jsonify(farm=farm)

    @app.post('/api/climate')
    def climate_route():
        data = body()
        farm = get('farm', DEFAULT_FARM)
        if data.get('mode') == 'demo':
            climate = demo(farm['latitude'], farm['longitude'])
        else:
            start, end = data.get('start', ''), data.get('end', '')
            try:
                a, b = date.fromisoformat(start), date.fromisoformat(end)
            except (ValueError, TypeError):
                raise ValueError('Use valid start and end dates.')
            if a > b or b >= ph_today() or a < date(1981, 1, 1) or not 6 <= (b-a).days <= 1095:
                raise ValueError('Choose 7–1096 historical days from 1981 onward, ending before today.')
            key = f'power:{farm["latitude"]}:{farm["longitude"]}:{start}:{end}'
            climate = get(key)
            if climate is None:
                try:
                    climate = fetch_power(farm['latitude'], farm['longitude'], start, end)
                except (requests.RequestException, KeyError, ValueError) as error:
                    reason=getattr(error.args[0], 'reason', None) if error.args else None
                    app.logger.warning('NASA history request failed (%s / %s).', type(error).__name__, type(reason).__name__)
                    message = 'NASA POWER could not be reached. Check the internet connection and retry; previous records are kept. Public samples remain available in Forecasts and Simulations.' if isinstance(error,requests.ConnectionError) else 'NASA POWER could not supply usable data. Previous records are kept; try another historical period.'
                    return jsonify(error=message), 502
                put(key, climate)
        put('climate', climate)
        return jsonify(climate=climate)

    @app.post('/api/model')
    def internal_forecast_route():
        data=body()
        farm=get('farm',DEFAULT_FARM)
        climate=dataset(data.get('dataset','current'),farm)
        mode=data.get('mode','forward');method=data.get('method','auto')
        if mode not in ('forward','replay'):raise ValueError('Choose forward forecast or historical test.')
        period=active_period(farm)
        start=data.get('start') or (period or {}).get('start')
        end=data.get('end') or (period or {}).get('end')
        if mode=='replay':validate_period(start,end)
        key=model_key(climate)+f':{mode}:{method}'+(f':{start}:{end}' if mode=='replay' else '')
        result=get(key)
        if result is None:
            result=replay_period(climate,start,end,method) if mode=='replay' else build_forecast(climate,method)
            put(key,result)
        provider=saved_forecast(climate['latitude'],climate['longitude']) if mode=='forward' else get(f'comparison:{climate["latitude"]}:{climate["longitude"]}:{start}:{end}')
        if data.get('dataset','current')=='current' and result.get('status')=='ready' and mode=='forward' and method=='auto':
            put(model_key(climate),result);archive('internal',result)
        context={**result,'source':'Internal '+('historical test' if mode=='replay' else 'forecast'),'retrieved_at':result.get('issued_at')}
        actions=suggested_actions(farm,context,allow_past=mode=='replay',label='Historical test' if mode=='replay' else 'Internal forecast')
        if data.get('dataset','current')=='current' and result.get('status')=='ready':
            put('model_session',{'key':key,'climate_key':model_key(climate),'mode':mode,'method':method,'start':start,'end':end})
        return jsonify(internal=result, provider=provider, actions=actions, saved_evaluation=scores(climate,climate), dataset_label=climate.get('label',climate['source']))

    @app.post('/api/comparison')
    def comparison_route():
        data=body();farm=get('farm',DEFAULT_FARM);climate=dataset(data.get('dataset','current'),farm)
        a,b=validate_period(data.get('start'),data.get('end'))
        key=f'comparison:{climate["latitude"]}:{climate["longitude"]}:{a.isoformat()}:{b.isoformat()}'
        provider=get(key)
        if provider is None:
            try:provider=fetch_archived_forecast(climate['latitude'],climate['longitude'],a.isoformat(),b.isoformat())
            except (requests.RequestException,KeyError,ValueError,TypeError):return jsonify(error='Archived model output could not be loaded. Internal historical testing and reference data are still available.'),502
            put(key,provider)
        return jsonify(provider=provider)

    @app.post('/api/month-outlook')
    def month_outlook():
        from forecast import fetch_month_outlook
        body();farm=get('farm',DEFAULT_FARM)
        key=f"month:{farm['latitude']}:{farm['longitude']}"
        old=get(key)
        if old and (datetime.now(timezone.utc)-datetime.fromisoformat(old['retrieved_at'])).total_seconds()<21600:return jsonify(old)
        try:result=fetch_month_outlook(farm['latitude'],farm['longitude'])
        except (requests.RequestException,ValueError,KeyError,TypeError):
            if old:return jsonify({**old,'note':old['note']+' Update failed; showing the saved issue.'})
            return jsonify(error='The month outlook could not be loaded. Try again later.'),502
        put(key,result);return jsonify(result)

    @app.post('/api/chat')
    def chat():
        from assistant_chat import understand, ai_enabled
        from crop_planning import suggest
        from engine import CROP_STAGES
        import uuid
        data=body();message=data.get('message','');session=data.get('session','')
        try:session=str(uuid.UUID(session))
        except (ValueError,TypeError,AttributeError):raise ValueError('Start a new chat and try again.')
        if not isinstance(message,str) or not 1<=len(message.strip())<=2000:raise ValueError('Write a short message, up to 2,000 characters.')
        message=message.strip();farm=get('farm',DEFAULT_FARM);key='chat:'+session;pending=get(key)
        mode='AI-assisted' if ai_enabled() else 'Guided assistant'
        def reply(text,choices=None,**extra):return jsonify(text=text,choices=choices or [],mode=mode,**extra)
        if message=='Cancel':put(key,None);return reply('Okay, cancelled. What would you like to do?')
        if message=='Save this':
            if not pending or pending.get('kind') not in ('crop','stage','note'):return reply('There is no change waiting to be saved.')
            if data.get('confirmation_id')!=pending['id']:return reply('Use Save this on the latest change, or tell me the change again.')
            if pending['farm']!=farm:put(key,None);return reply('The farm changed while we were talking. Please tell me the change again.')
            if pending['kind']=='note':
                item={'id':pending['id'],'date':pending['date'],'crop':farm['crop'],'note':pending['value'],'technique':'Field note via assistant','outcome':'unobserved','yield_kg':None,'municipality':farm['municipality'],'created_at':datetime.now(timezone.utc).isoformat(),'schema_version':2,'farm_context':farm}
                with db() as conn:conn.execute('INSERT OR IGNORE INTO journals VALUES (?,?)',(item['id'],json.dumps(item)))
            else:
                field='crop' if pending['kind']=='crop' else 'crop_stage'
                updated=validate_profile({**farm,field:pending['value']});updated['location']=farm.get('location');put('farm',updated)
            put(key,None);return reply('Saved. Your records are updated.',changed=True,updated_fields=({field:pending['value']} if pending['kind']!='note' else {}))
        if pending and pending.get('kind')=='note_input':
            intent={'intent':'note','value':message};put(key,None)
        elif pending and pending.get('kind')=='drainage' and message in ('Drains well','Water stands','Not sure'):
            drainage={'Drains well':'good','Water stands':'poor','Not sure':'unknown'}[message]
            result=suggest(farm,{'drainage':drainage},forecast=saved_forecast(farm['latitude'],farm['longitude']));put(key,None)
            options=result['options'];top=next((o for o in options if not o['blocked']),None)
            text=(('One option to discuss is '+top['crop']+'. '+(' '.join(top['reasons'][:2]))+' '+(' '.join(top['cautions'][:2]))) if top else 'Check drainage with a technician before choosing a crop.')
            return reply(text+' '+result['timing'],sources=result['sources'],open_page='planting')
        else:intent=understand(message)
        action=intent['intent'];value=intent['value']
        if action=='connection_ok':return reply('Gemini connection worked. Google returned a valid reply using '+value+'. No farm records were changed.')
        if action=='weather':
            forecast=saved_forecast(farm['latitude'],farm['longitude'])
            if not forecast:return reply('No forecast saved yet. Tap Update weather to get one for your farm.',choices=['Update weather'])
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(forecast['retrieved_at'])).total_seconds()
            if age>172800 or age<0:return reply('The saved forecast needs an update before planning. Tap Update weather.',choices=['Update weather'])
            days=[d for d in forecast['days'] if d['date']>=ph_today().isoformat()][:3]
            if not days:return reply('The saved forecast is out of date. Tap Update weather.',choices=['Update weather'])
            return reply('Here is the saved weather for '+farm['municipality']+'. Saved '+forecast['retrieved_at'][:10]+'. Check the field too; rain can vary nearby.',days=days,choices=['Update weather'],open_page='forecasts')
        if action=='farm':return reply(f"Your farm is {farm['name']} in {farm['municipality']}. {farm['area']} hectares, growing {farm['crop']}, stage: {farm['crop_stage']}. Water: {farm['water']}.",open_page='farm')
        if action=='crops':put(key,{'kind':'drainage'});return reply('After rain, does water stand in your field?',choices=['Drains well','Water stands','Not sure','Cancel'])
        if action=='note' and not value:put(key,{'kind':'note_input'});return reply('What would you like to write down? I will save the note under today’s date.',choices=['Cancel'])
        if action in ('crop','stage','note'):
            if action=='crop' and value not in CROPS or action=='stage' and value not in CROP_STAGES:return reply('I could not match that value. Try “my crop is rice” or “newly planted”.')
            if not value or len(value)>2000:raise ValueError('Keep the note to 2,000 characters.')
            confirmation_id=str(uuid.uuid4())
            put(key,{'kind':action,'value':value,'farm':farm,'id':confirmation_id,'date':ph_today().isoformat()})
            return reply(('Save this note for today: ' if action=='note' else 'Update your '+('crop' if action=='crop' else 'crop stage')+' to: ')+value+'?',choices=['Save this','Cancel'],confirmation_id=confirmation_id,target_field=('crop' if action=='crop' else 'crop_stage' if action=='stage' else None))
        return reply('I can check weather, suggest crops, update your crop or stage, and save notes. Try “my crop is rice” or tap one below.',choices=['Check weather','Choose a crop','My farm','Save a note'])

    @app.post('/api/crop-suggestions')
    def crop_suggestions():
        from crop_planning import suggest
        data=body();farm=get('farm',DEFAULT_FARM)
        return jsonify(suggest(farm,data,climate_for(farm),saved_forecast(farm['latitude'],farm['longitude'])))

    @app.post('/api/crop-plan')
    def crop_plan():
        from crop_planning import plan
        data=body();farm=get('farm',DEFAULT_FARM)
        return jsonify(plan(farm,data))

    @app.post('/api/history/import')
    def import_history():
        data=body()
        text=data.get('csv','')
        if not isinstance(text,str) or len(text)>300000:
            raise ValueError('CSV must be smaller than 300 KB.')
        rows=list(csv.DictReader(io.StringIO(text.lstrip('\ufeff'))))
        if not 14<=len(rows)<=1826:
            raise ValueError('Import 14–1826 daily rows with date,temp,rain headers.')
        seen=set()
        days=[]
        for row in rows:
            try:
                day=date.fromisoformat(row['date'])
            except (KeyError,ValueError,TypeError):
                raise ValueError('Each row needs an ISO date (YYYY-MM-DD).')
            if day>=ph_today() or day<date(1981,1,1) or day in seen:
                raise ValueError('Dates must be unique, historical and from 1981 onward.')
            seen.add(day)
            days.append({'date':day.isoformat(),'temp':number(row.get('temp'),'Daily temperature (C)',-60,65),'rain':number(row.get('rain'),'Daily rain (mm)',0,3000)})
        days.sort(key=lambda r:r['date'])
        if (date.fromisoformat(days[-1]['date'])-date.fromisoformat(days[0]['date'])).days>1826:
            raise ValueError('Keep the import within five years.')
        farm=get('farm',DEFAULT_FARM)
        climate={'source':'Uploaded daily records — user supplied, unverified','kind':'user_supplied','demo':False,'latitude':farm['latitude'],'longitude':farm['longitude'],'days':days,'missing_days':(date.fromisoformat(days[-1]['date'])-date.fromisoformat(days[0]['date'])).days+1-len(days),'retrieved_at':datetime.now(timezone.utc).isoformat()}
        put('climate',climate)
        put('analysis_period',None)
        return jsonify(climate=climate)

    @app.post('/api/journal')
    def journal():
        data = body()
        for key in ('id', 'date', 'crop', 'note', 'technique', 'outcome'):
            if not isinstance(data.get(key), str) or not data[key].strip() or len(data[key]) > (2000 if key == 'note' else 120):
                raise ValueError(f'Invalid journal {key}.')
        if data['crop'] not in CROPS or data['outcome'] not in ('unobserved', 'better', 'same', 'worse'):
            raise ValueError('Invalid crop or outcome.')
        try:
            if date.fromisoformat(data['date']) > ph_today():
                raise ValueError()
        except ValueError:
            raise ValueError('Journal date must be today or earlier.')
        farm = get('farm', DEFAULT_FARM)
        item = {k: data[k].strip() for k in ('id', 'date', 'crop', 'note', 'technique', 'outcome')}
        item['yield_kg'] = number(data.get('yield_kg'), 'Yield', 0, 10000000, True)
        item['created_at'] = datetime.now(timezone.utc).isoformat()
        item['municipality'] = farm['municipality']
        item['schema_version'] = 2
        context = data.get('farm_context')
        if context is not None:
            if not isinstance(context,dict) or len(json.dumps(context))>2000:
                raise ValueError('Invalid journal farm context.')
            # Preserve the browser profile at entry time for offline notes; no NLP or inference.
            item['farm_context'] = context
        else:
            item['farm_context'] = {key:farm.get(key) for key in ('name','municipality','latitude','longitude','crop_stage','planting_date')}
        recorded=data.get('recorded_at')
        if recorded:
            try:
                stamp=datetime.fromisoformat(recorded.replace('Z','+00:00'))
                if stamp.tzinfo is None:
                    raise ValueError()
            except (ValueError,AttributeError):
                raise ValueError('Invalid journal timestamp.')
            item['recorded_at']=recorded
        with db() as conn:
            # Retries of an offline submission cannot create duplicate entries.
            conn.execute('INSERT OR IGNORE INTO journals VALUES (?,?)', (item['id'], json.dumps(item)))
        return jsonify(ok=True)

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5000, debug=False)
