"""Retrieve reproducible public NASA POWER examples, never farmer measurements."""
import sys
import json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from climate import fetch_power

DEST=Path(__file__).resolve().parents[1]/'data'/'samples'


def main():
    DEST.mkdir(parents=True,exist_ok=True)
    cases=[('legazpi','Legazpi example',13.1391,123.7438),('naga','Naga example',13.6218,123.1948)]
    for key,label,lat,lon in cases:
        file=DEST/f'{key}.json'
        if file.exists():
            print(f'{key}: existing snapshot retained')
            continue
        data=fetch_power(lat,lon,'2024-01-01','2026-11-01')
        data['label']=label
        data['kind']='gridded_reference'
        data['request_start']='2024-01-01'
        data['request_end']='2026-11-01'
        data['source_url']='https://power.larc.nasa.gov/docs/services/api/temporal/daily/'
        file.write_text(json.dumps(data,indent=2),encoding='utf-8')
        print(f'{key}: {len(data["days"])} valid days; {data["missing_days"]} missing')


if __name__=='__main__':
    main()
