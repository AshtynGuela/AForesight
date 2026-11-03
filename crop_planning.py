"""Source-linked planning checks; no yield or nutrient-dose predictions."""
from datetime import date,timedelta
from engine import CROPS,number

SOURCES=[{'title':'DA: mungbean production guide','url':'https://hvcdp.da.gov.ph/wp-content/uploads/2022/05/Mungbean-Production-Guide.pdf'}, {'title':'UPLB: cropping calendars and irrigation requirements','url':'https://amtec.uplb.edu.ph/wp-content/uploads/2019/07/PAES602-IrrigationWaterRequirements.pdf'}, {'title':'PhilRice: rainy-season preparation','url':'https://www.philrice.gov.ph/recommended-varieties-technologies-rainy-season/'}]

def plan(farm,data):
    crop=data.get('crop');previous=data.get('previous_crop',farm.get('crop','unknown'))
    if crop not in CROPS or previous not in (*CROPS,'unknown'):raise ValueError('Choose a crop from the list.')
    try:start=date.fromisoformat(data.get('start',''))
    except (ValueError,TypeError):raise ValueError('Pick a planting date.')
    duration=number(data.get('duration',100),'Days to harvest',45,240)
    if not duration.is_integer():raise ValueError('Use whole days for crop duration.')
    drainage=data.get('drainage','unknown')
    if drainage not in ('good','poor','unknown'):raise ValueError('Choose a drainage condition.')
    checks=[]
    if previous==crop:checks.append('You picked the same crop again. Discuss a crop from another family with your technician, especially if pests or disease carried over.')
    elif previous in ('rice','corn') and crop=='mungbean':checks.append('Mungbean is an option after rice or corn when the field drains well and there is enough soil moisture. Check the market and seed supply first.')
    else:checks.append('Changing crops may help diversify the field. Check shared pests, soil conditions and local demand before settling on this sequence.')
    if crop in ('corn','mungbean','sweet potato') and drainage!='good':checks.append('Check drainage before committing to this crop. Standing water can make an upland crop a poor fit; a rotation alone will not fix the drainage.')
    if farm['water']=='rainfed':checks.append('Walk the field after rain and check moisture below the surface. Confirm the rains are settling in before planting; one wet day is not enough.')
    else:checks.append('Confirm the irrigation schedule and available supply through establishment and flowering with your water provider.')
    if crop=='rice':checks.append('Coordinate planting with nearby rice farmers. Prepare bunds and outlets and choose a locally recommended variety with your technician.')
    if crop=='mungbean':checks.append('Plan for a dry harvest window. Mungbean does poorly with prolonged waterlogging. Do not assume it removes the need for soil testing or fertilizer advice.')
    checks+=['Use a soil test before deciding on fertilizer or amendments.','Check the short-range weather again just before planting. A 30-day outlook cannot confirm a safe planting day.']
    end=start+timedelta(days=int(duration))
    return {'crop':crop,'previous_crop':previous,'start':start.isoformat(),'harvest':end.isoformat(),'checks':checks,'sources':SOURCES,'calendar':[
        {'date':(start-timedelta(days=14)).isoformat(),'task':'Check seeds, drainage, water access and soil test results.'},
        {'date':start.isoformat(),'task':'Tentative planting day — confirm moisture and the latest forecast first.'},
        {'date':(start+timedelta(days=7)).isoformat(),'task':'Walk the field. Check establishment, gaps and uneven moisture.'},
        {'date':end.isoformat(),'task':'Estimated harvest planning date — check the crop itself before harvesting.'}],
        'note':'The harvest date uses the duration you entered. Variety, planting method and weather can shift it. This is a draft plan, not a crop growth prediction.'}


def suggest(farm,data,climate=None,forecast=None):
    """Transparent screening ranks, not learned yield predictions or probabilities."""
    from datetime import datetime,timezone
    from time_utils import ph_today
    from forecast import finite
    drainage=data.get('drainage','unknown')
    if drainage not in ('good','poor','unknown'):raise ValueError('Choose a drainage condition.')
    # We are planning after the current crop, not replacing it mid-season.
    previous=farm.get('crop','unknown')
    earlier=farm.get('previous_crop','unknown')
    today=ph_today();weather=[]
    try:
        age=(datetime.now(timezone.utc)-datetime.fromisoformat(forecast['retrieved_at'])).total_seconds()
        if 0<=age<=172800 and not forecast.get('demo'):
            weather=[d for d in forecast['days'] if today.isoformat()<=d['date']<=(today+timedelta(days=6)).isoformat() and finite(d.get('rain'),0,3000)]
    except (TypeError,KeyError,ValueError):pass
    weather=list({d['date']:d for d in weather}.values())
    complete=len(weather)==7
    wet=any(d['rain']>=20 for d in weather)
    dry=complete and sum(d['rain'] for d in weather)<7
    gaps=[]
    if drainage=='unknown':gaps.append('Tell us whether water stands in the field after rain.')
    if farm.get('ph') is None:gaps.append('Add a dated soil test when you have one.')
    if not complete:gaps.append('Update the forecast for a full seven-day planting check.')
    gaps.append('Check seed availability, variety, buyer demand and local pest history before choosing.')
    options=[]
    families={'rice':'grass','corn':'grass','mungbean':'legume','sweet potato':'convolvulaceae'}
    for crop in CROPS:
        score=0;reasons=[];cautions=[];blocked=False
        if crop==previous:
            score-=3;cautions.append('This repeats your current crop. Check for carry-over pests and diseases.')
        elif families.get(crop)!=families.get(previous):
            score+=2;reasons.append('A different crop family from your current crop gives you a rotation option.')
        else:cautions.append('Rice and corn are both grasses, so this is not a different-family rotation.')
        if crop==earlier:score-=1;cautions.append('This also appeared as your previous crop; check the longer field history.')
        if crop=='mungbean' and previous in ('rice','corn'):
            score+=2;reasons.append('Philippine guidance supports mungbean after rice or corn when drainage and moisture suit it.')
        if crop!='rice':
            if drainage=='poor':blocked=True;cautions.append('Standing water is a major concern. Fix or assess drainage before choosing this upland crop.')
            elif drainage=='good':score+=2;reasons.append('You reported good drainage, which helps this upland crop.')
            else:cautions.append('Drainage is still unknown, so suitability is conditional.')
        if crop=='rice':
            if farm['terrain']=='lowland' and farm['water']=='irrigated':score+=3;reasons.append('Your lowland setting and irrigation access support considering rice.')
            else:cautions.append('Confirm a rice variety and establishment method suited to your terrain and water supply.')
        if farm['water']=='rainfed':
            cautions.append('Water depends on rain. Confirm stored soil moisture and water through establishment.')
            if crop=='rice':score-=2
        if crop=='mungbean' and wet:score-=2;cautions.append('The saved near-term forecast includes a day with at least 20 mm rain. Check drainage and delay committing if water stands.')
        if dry:
            cautions.append('Less than 7 mm is forecast over seven days. Check soil moisture and backup water before planting.')
            if farm['water']=='rainfed':score-=2
        if farm.get('ph') is not None:
            cautions.append(f"Saved soil pH: {farm['ph']}. Check the test date and method with a technician before choosing amendments; pH alone does not establish crop suitability.")
        if farm.get('ash'):cautions.append('Ash exposure is recorded. Get the affected soil checked before committing to a crop.')
        if farm['terrain']=='coastal':cautions.append('Check irrigation-water and soil salinity; coastal location alone does not measure it.')
        options.append({'crop':crop,'score':score,'status':'Resolve drainage first' if blocked else 'Worth discussing' if score>0 else 'Needs a closer check','blocked':blocked,'reasons':reasons,'cautions':cautions})
    # Scores are rule totals, not probabilities. Drainage blocks take precedence.
    options.sort(key=lambda x:(x['blocked'],-x['score'],x['crop']))
    active=farm.get('crop_stage') in ('establishment','vegetative','flowering')
    timing='Your current crop is still growing. These are options for after harvest; confirm when the field will be free.' if active else 'Check soil moisture, field readiness and the latest forecast before choosing a planting day.'
    if wet:timing+=' Wetter days are shown soon. Check outlets and avoid planting into standing water.'
    if dry:timing+=' The coming week looks dry under the app screening rule; confirm water before planting.'
    return {'options':options,'timing':timing,'missing':gaps,'inputs':{'current_crop':previous,'previous_crop':earlier,'terrain':farm['terrain'],'water':farm['water'],'drainage':drainage,'forecast_days_used':len(weather),'forecast_source':forecast.get('source') if weather else None},'sources':SOURCES,'method':'Rules compare rotation families, drainage, terrain and water access. Ranking weights and rain triggers are prototype screening choices, not validated suitability percentages. Soil readings trigger review, not nutrient prescriptions. Journals are not used.'}
