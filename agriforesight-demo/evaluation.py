"""Score only saved future forecasts against later-arriving historical references."""
from datetime import datetime, timedelta, timezone
from modelling import metrics


def archive_scores(snapshots, climate):
    reference={d['date']:d for d in climate['days']}
    grouped={}
    for snapshot in snapshots:
        issued=datetime.fromisoformat(snapshot['issued_at'])
        issue_day=issued.astimezone(timezone(timedelta(hours=8))).date().isoformat()
        for row in snapshot['payload']['days']:
            if row['date']<=issue_day or row['date'] not in reference:
                continue
            # Last saved issue per provider and issue day, without treating updates as independent days.
            key=(issue_day,row['date'],snapshot['kind'])
            if key not in grouped or issued>grouped[key][0]:
                grouped[key]=(issued,row)
    paired=[]
    for issue_day,target,kind in grouped:
        if kind!='internal' or (issue_day,target,'open_meteo') not in grouped:
            continue
        a=grouped[(issue_day,target,'internal')][1]
        b=grouped[(issue_day,target,'open_meteo')][1]
        ref=reference[target]
        if any(row.get(k) is None for row in (a,b,ref) for k in ('temp','rain')):
            continue
        paired.append({'date':target,'issue_day':issue_day,'actual':[ref['temp'],ref['rain']],'internal':[a['temp'],a['rain']],'open_meteo':[b['temp'],b['rain']]})
    scores={kind:{key:metrics([{'actual':p['actual'],'predicted':p[kind]} for p in paired],v) for v,key in enumerate(('temp','rain'))} for kind in ('internal','open_meteo')}
    return {'matched_forecasts':len(paired),'unique_target_days':len({p['date'] for p in paired}),'scores':scores,'reference':climate['source'],'message':'Both forecasts must be saved on the same issue day, before the target day; later historical references must cover the target. Differences between providers alone are not errors. Multiple lead times can refer to the same target day.'}
