"""Daily scenario ledgers. All soil/management numbers are explicit assumptions."""
from datetime import date, timedelta
from engine import number

FAO = 'https://www.fao.org/4/x0490e/x0490e0e.htm'


def simulate(farm, climate, forecast, data):
    source = data.get('source','forecast')
    if source not in ('forecast','history','internal'):
        raise ValueError('Select a forecast or historical weather window.')
    weather = climate if source == 'history' else forecast
    if not weather or len(weather.get('days',[])) < 7:
        raise ValueError('Load at least 7 daily weather records first.')
    if source=='history' and (data.get('start') or data.get('end')):
        from periods import validate_period,period_days
        validate_period(data.get('start'),data.get('end'))
        days=period_days(weather,{'start':data['start'],'end':data['end']})
        expected=(date.fromisoformat(data['end'])-date.fromisoformat(data['start'])).days+1
        if len(days)!=expected:raise ValueError('The selected simulation period has missing days. Load or edit the missing records first.')
    else:
        days = weather['days'][-14:] if source == 'history' else weather['days'][:7]
    if len(days)<7:raise ValueError('Choose at least seven continuous days for a water simulation.')
    if any(date.fromisoformat(b['date'])-date.fromisoformat(a['date']) != timedelta(days=1) for a,b in zip(days,days[1:])):
        raise ValueError('This weather window has missing dates. Select a continuous period; missing rain is not treated as zero.')
    for row in days:
        number(row.get('rain'),'Daily rain',0,3000)
    mode = data.get('system','paddy' if farm['crop']=='rice' and farm['terrain']=='lowland' else 'rootzone')
    if mode not in ('paddy','rootzone'):
        raise ValueError('Choose paddy or root-zone balance.')
    if mode == 'paddy' and farm['crop'] != 'rice':
        raise ValueError('The paddy ledger is for rice. Choose root-zone balance for this crop.')
    p = {k:number(data.get(k,default),k,lo,hi) for k,default,lo,hi in [
        ('rain_change',0,-100,100),('demand_change',0,-50,100),('kc',1,.1,2),('fallback_et0',4,0,15),
        ('effective_rain',80,0,100),('irrigation_mm',0,0,150),('irrigation_day',3,1,len(days)),('efficiency',80,1,100),
        ('field_capacity',.30,.05,.65),('wilting_point',.15,0,.6),('root_depth',.4,.05,2),('depletion_fraction',.5,.1,.8),('initial_depletion',30,0,100),
        ('pond_mm',30,0,150),('bund_mm',100,10,300),('seepage_mm',3,0,30)]}
    if not p['irrigation_day'].is_integer():
        raise ValueError('Irrigation day must be a whole day.')
    if p['field_capacity'] <= p['wilting_point']:
        raise ValueError('Field capacity must exceed wilting point.')
    if p['pond_mm'] > p['bund_mm']:
        raise ValueError('Starting pond depth cannot exceed bund capacity.')
    taw = 1000*(p['field_capacity']-p['wilting_point'])*p['root_depth']
    raw = p['depletion_fraction']*taw
    fallback = sum(row.get('et0') is None for row in days)

    def run(changed):
        depletion, pond = taw*p['initial_depletion']/100, p['pond_mm']
        rows=[]
        for i,weather_day in enumerate(days,1):
            rain = weather_day['rain'] * (1+p['rain_change']/100 if changed else 1)
            et0 = number(weather_day.get('et0') if weather_day.get('et0') is not None else p['fallback_et0'],'Daily ET0',0,30)
            demand = et0*p['kc']*(1+p['demand_change']/100 if changed else 1)
            gross = p['irrigation_mm'] if changed and i == p['irrigation_day'] else 0
            irrigation = gross*p['efficiency']/100
            effective = rain*p['effective_rain']/100
            if mode == 'rootzone':
                before=depletion
                potential=before-effective-irrigation
                drainage=max(0,-potential)
                available_depletion=max(0,potential)
                ks=1 if available_depletion<=raw else max(0,(taw-available_depletion)/(taw-raw))
                actual=min(demand*ks,max(0,taw-available_depletion))
                depletion=min(taw,available_depletion+actual)
                shortage=demand-actual
                flag=depletion>raw
                storage=taw-depletion
                # Storage + drainage + ET balances incoming effective water.
                balance=(taw-before)+effective+irrigation-actual-drainage-storage
            else:
                start_pond=pond
                incoming=pond+effective+irrigation
                overflow=max(0,incoming-p['bund_mm'])
                incoming=min(p['bund_mm'],incoming)
                actual=min(incoming,demand)
                incoming-=actual
                seepage=min(incoming,p['seepage_mm'])
                pond=incoming-seepage
                drainage=overflow+seepage
                shortage=demand-actual
                storage=pond
                flag=pond<=0
                balance=start_pond+effective+irrigation-actual-drainage-pond
            rows.append({'date':weather_day['date'],'rain':round(rain,2),'et0':round(et0,2),'demand':round(demand,2),'actual_et':round(actual,2),'irrigation':round(gross,2),'storage':round(storage,2),'drainage':round(drainage,2),'unmet_demand':round(shortage,2),'flag':bool(flag),'balance_error':round(balance,8)})
        return {'days':rows,'rain_total':round(sum(r['rain'] for r in rows),2),'flag_days':sum(r['flag'] for r in rows),'demand_total':round(sum(r['demand'] for r in rows),2),'unmet_demand':round(sum(r['unmet_demand'] for r in rows),2),'irrigation_m3':round(p['irrigation_mm']*farm['area']*10 if changed else 0,4),'drainage_total':round(sum(r['drainage'] for r in rows),2),'ending_storage':rows[-1]['storage']}
    baseline, scenario=run(False),run(True)
    return {'system':mode,'source':weather['source'],'weather_start':days[0]['date'],'weather_end':days[-1]['date'],'demo':weather.get('demo',False),'assumptions':p,'taw':round(taw,2),'raw':round(raw,2),'fallback_et0_days':fallback,'baseline':baseline,'scenario':scenario,
            'interpretation':f'The changed scenario has {scenario["flag_days"]} flagged day(s), compared with {baseline["flag_days"]} in the baseline. '+('A flag means modelled depletion exceeds the chosen readily available water threshold. Check soil moisture before acting.' if mode=='rootzone' else 'A flag means the simulated pond is empty. It does not mean the rice root zone is dry or predict crop damage.'),
            'limitations':'A daily planning calculation, not a yield, survival or flood forecast. Soil parameters, Kc, effective rainfall, seepage and irrigation are user assumptions. Daily ordering assumes rain/irrigation before evapotranspiration; no lateral flow or groundwater input. ET demand is changed directly; temperature is not used to invent ET0.',
            'reference':{'title':'FAO 56, Chapter 8: soil water availability and balance','url':FAO}}
