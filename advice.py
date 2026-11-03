"""Small source-linked decision rules. Weather triggers are screening choices."""
from datetime import datetime, timezone
from time_utils import ph_today

SOURCES = {
    'rice': {'title':'DA-PhilRice: water-saving practices and critical rice stages','url':'https://www.philrice.gov.ph/water-saving-practices-advised-as-el-nino-threat-looms/'},
    'rice_field': {'title':'DA-PhilRice: rainy-season field preparation','url':'https://www.philrice.gov.ph/recommended-varieties-technologies-rainy-season/'},
    'rice_growth': {'title':'DA-PhilRice: rice growing and water management','url':'https://www.philrice.gov.ph/wp-content/uploads/2023/05/Rice-Breeding-Manual_May-2023.pdf'},
    'corn': {'title':'TNAU extension: maize water management','url':'https://agritech.tnau.ac.in/agriculture/agri_irrigationmgt_maize.html'},
    'balance': {'title':'FAO 56: soil water availability and water stress','url':'https://www.fao.org/4/x0490e/x0490e0e.htm'},
    'weather': {'title':'PAGASA: ten-day regional agricultural weather','url':'https://www.pagasa.dost.gov.ph/ten-day-regional-agri-weather'},
    'soil': {'title':'BSWM: soil and water laboratory services','url':'https://www.bswm.da.gov.ph/process/laboratory-services/'}
}


def suggested_actions(farm, forecast, *, allow_past=False,label=None):
    actions=[]
    def add(title,action,why,when,source,priority='Check',basis='Based on farming guidance. Have a look at the field too.'):
        actions.append({'title':title,'action':action,'why':why,'when':when,'priority':priority,'reference':SOURCES[source],'basis':basis})
    usable=[]
    if forecast and not forecast.get('demo'):
        try:
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(forecast['retrieved_at'])).total_seconds()
            if allow_past or 0<=age<=172800:
                usable=[d for d in forecast['days'] if d['date']>=ph_today().isoformat()]
                if allow_past:usable=forecast['days']
        except (ValueError,KeyError,TypeError):
            pass
    if not usable:
        add('Get the latest weather','Update the weather before planning work that depends on rain.','There’s no usable forecast saved from the last 48 hours. Past averages don’t tell us what’s coming next.','Before your next job in the field','weather',basis='The weather needs updating. This doesn’t mean something is wrong in the field.')
    else:
        usable=sorted(usable,key=lambda d:d['date'])
        rain=[d for d in usable if isinstance(d.get('rain'),(int,float))]
        dry=[]
        for i in range(max(0,len(usable)-2)):
            window=usable[i:i+3]
            from datetime import date,timedelta
            if all(isinstance(d.get('rain'),(int,float)) and d['rain']<1 for d in window) and all(date.fromisoformat(b['date'])-date.fromisoformat(a['date'])==timedelta(days=1) for a,b in zip(window,window[1:])):
                dry=window
                break
        if dry:
            add('Check water supply for the dry window','Check whether the soil is drying and whether water is available. Use a field reading to decide if it needs watering.',f'{label or forecast.get("source","Selected weather")} has three consecutive days below 1 mm rain/day, starting {dry[0]["date"]}. The 3-day trigger is an app screening rule, not a drought diagnosis.',dry[0]['date'],'balance','Plan',basis='The weather trigger is a screening assumption; FAO supports checking root-zone water availability, not this specific weather threshold.')
        wet=[d for d in rain if d['rain']>=20]
        if wet:
            add('Check the drains before the wetter days','Check for blocked drains and outlets. Have a look at PAGASA’s warnings before heading out.',f'{len(wet)} day(s) reach the app review threshold of 20 mm/day. Forecast rainfall alone cannot establish flooding.',wet[0]['date'],'weather','Plan',basis='20 mm/day is a review trigger chosen for this app, not a PAGASA warning category.')
        if rain:
            total=sum(d['rain'] for d in rain)
            if farm['water']=='rainfed':
                add('Check the soil before planning water','Check the soil and drains before planting or watering. If you rely on rain, see what water you can store for the days ahead.',f'{label or forecast.get("source","Selected weather")}: {total:.1f} mm across {len(rain)} available days; the farm is rainfed. A total alone does not establish crop water supply.',f'{usable[0]["date"]} to {usable[-1]["date"]}','balance')
            else:
                add('Check your irrigation plan','See how wet the soil is, how much water you have and where it might be leaking. Ask your technician about the next watering.',f'{label or forecast.get("source","Selected weather")}: {total:.1f} mm across {len(rain)} available days; the farm has irrigation.',f'{usable[0]["date"]} to {usable[-1]["date"]}','balance')
    if farm['crop']=='rice' and farm.get('crop_stage')=='flowering':
        add('Keep an eye on water while rice is flowering','Check the field and your water supply. Ask your technician about watering before letting flowering rice dry out.','The saved crop is rice and the farmer-selected stage is flowering.','During flowering','rice','Priority')
    elif farm['crop']=='rice' and farm['water']=='irrigated' and farm.get('crop_stage')=='vegetative':
        add('Ask about using less irrigation water','Ask your technician if alternate wetting and drying would suit this field. You’ll need a water tube and a suitable schedule; the rain forecast alone isn’t enough.','The saved crop is irrigated rice in the vegetative stage; water-table depth and salinity are not available.','Before changing the irrigation schedule','rice')
    stage=farm.get('crop_stage','unknown')
    if farm['crop']=='rice' and stage=='establishment':
        add('Walk the newly planted field','Look for uneven water, washed-out plants and gaps. Check inlets and outlets before adding water.','You recorded newly planted rice. Young plants need field observation; a rainfall total cannot show their condition.','After planting and after rain','rice_growth','Check')
    if farm['crop']=='rice' and farm['water']=='irrigated' and stage not in ('maturity','harvest'):
        add('Check bunds and water leaks','Walk the field edges and repair visible leaks before your next watering.','The saved field has irrigated rice. Keeping bunds in good condition can reduce avoidable water losses.','Before the next watering','rice_field')
    if stage in ('maturity','harvest'):
        add('Prepare for harvest and drying','Check grain maturity in the field. Arrange labour, transport and a covered drying space; use the weather to choose a work window.','You recorded a crop nearing harvest. Rainfall alone cannot set the harvest date.','Before harvest','rice_field' if farm['crop']=='rice' else 'weather')
    if farm['crop']=='corn' and stage=='flowering':
        add('Check flowering corn for water shortage','Check soil moisture near the roots and confirm water access with your technician. Keep drainage open as well.','You recorded flowering corn, a water-sensitive stage. This general extension guidance is not a local irrigation dose.','During flowering','corn','Priority')
    if farm['crop'] in ('corn','mungbean') and usable and any(d.get('rain',0)>=20 for d in usable):
        add('Look for water standing around roots','Check low spots and clear blocked existing drains where safe. Ask your technician before changing field drainage.','Wetter days are shown for an upland crop. The app cannot tell whether this field will flood.','Before and after the wetter days','balance','Plan')
    if stage in ('establishment','vegetative'):
        add('Check a few plants across the field','Walk several parts of the farm. Note wilting, unusual leaf colour or damaged plants in your journal, and ask a technician if symptoms persist.','Early field observations help follow changes. The app does not identify pests, nutrient deficiencies or microbiome health from weather.','On your next field visit','rice_growth' if farm['crop']=='rice' else 'soil')
    if farm.get('crop_stage','unknown')=='unknown':
        add('Record the crop stage','Choose the current crop stage in My farm & soil.','Water-management priorities differ across growth stages. No crop-specific irrigation timing is inferred without the stage.','Before using stage-specific guidance','balance',basis='Missing input; no crop stress is inferred.')
    if farm.get('ph') is None and farm.get('soil_method')=='unknown':
        add('Get a soil test before choosing fertilizer','Get a soil sample tested and keep the lab’s results and advice together.','There’s no soil pH or test method saved yet. Weather and a map can’t tell us which nutrients are missing.','Before choosing fertilizer or amendments','soil',basis='Measurement requirement; no nutrient dose is calculated.')
    if allow_past:
        for action in actions:
            action['context']='Looking back or trying a plan? This uses your saved crop stage, not the stage from those past dates. It isn’t a current alert.'
    if not actions:
        add('Have a look around the field first','Check the soil, the crop and your water supply before changing your plan.','There isn’t enough information yet to suggest an exact water or fertilizer amount.','Before your next job in the field','balance')
    order={'Priority':0,'Plan':1,'Check':2}
    return sorted(actions,key=lambda a:order.get(a['priority'],2))


def simulation_actions(farm,result):
    scenario=result['scenario'];baseline=result['baseline'];actions=[]
    def add(title,action,why,priority='Check'):
        actions.append({'title':title,'action':action,'why':why,'when':result['weather_start']+' to '+result['weather_end'],'priority':priority,'reference':SOURCES['balance'],'basis':'This comes from the settings in your test. Check them against the field.'})
    if scenario['flag_days']:
        if result['system']=='paddy':
            add('Check the pond and water inlet','Check the actual pond depth and water supply. An empty pond in this test doesn’t tell us the roots are dry.',f'The changed plan has {scenario["flag_days"]} empty-pond days, compared with {baseline["flag_days"]} in the baseline.','Plan')
        else:
            add('Have a look at the soil on these days','Check moisture near the roots on these days. Discuss watering with your technician if the field is drying.',f'The changed plan crosses the chosen depletion threshold on {scenario["flag_days"]} day(s), compared with {baseline["flag_days"]}.','Plan')
    else:
        add('Check how wet the field is to start with','Does the starting soil moisture or pond depth match your field? Check that before using this plan.','No days were marked for a check with these settings. The crop could still have problems the calculation doesn’t cover.')
    if scenario['drainage_total']>0:
        add('Check where water is leaving the field','Look for leaks and water running out of the field. Check the water-loss settings with your technician before adding more.',f'The changed water ledger removes {scenario["drainage_total"]:.1f} mm through represented drainage/seepage losses.')
    if result['fallback_et0_days']:
        add('Check the assumed daily water use','Use representative ET₀ data or check the assumed daily demand with your technician.',f'{result["fallback_et0_days"]} day(s) use the manually assumed ET₀ value; changing it can change the result.')
    if scenario['irrigation_m3']>0:
        add('Confirm that this water is available','Check the pump, delivery time and water source before relying on this amount.','The water amount covers the whole saved farm area and uses the chosen delivery efficiency.')
    if scenario['flag_days']>baseline['flag_days']:
        add('Try a different watering date','Compare another date or amount, then check the result against field moisture.','This plan produces more days needing a field check than the unchanged plan.','Plan')
    actions.extend(a for a in suggested_actions(farm,None) if a['title']!='Get the latest weather')
    for action in actions:
        action['context']='This is a practice plan using your saved crop stage. Check what’s actually happening in the field.'
    return sorted(actions,key=lambda a:{'Priority':0,'Plan':1,'Check':2}.get(a['priority'],2))
