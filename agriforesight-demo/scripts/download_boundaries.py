"""Refresh the local PH-only boundary snapshot, with source metadata preserved."""
import json
from datetime import datetime, timezone
from pathlib import Path
import requests

DEST = Path(__file__).resolve().parents[1] / 'data' / 'boundaries'


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    metadata = {}
    for level in ('ADM1', 'ADM2', 'ADM3'):
        endpoint = f'https://www.geoboundaries.org/api/current/gbOpen/PHL/{level}/'
        response = requests.get(endpoint, timeout=40)
        response.raise_for_status()
        info = response.json()
        response = requests.get(info['simplifiedGeometryGeoJSON'], timeout=90)
        response.raise_for_status()
        geo = response.json()
        if geo.get('type') != 'FeatureCollection' or not geo.get('features'):
            raise ValueError('Invalid boundary collection; existing file retained.')
        target = DEST / f'{level}.geojson'
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(geo, separators=(',', ':')), encoding='utf-8')
        temporary.replace(target)
        metadata[level] = {**info, 'api_url': endpoint, 'downloaded_at': datetime.now(timezone.utc).isoformat(), 'geometry': 'simplified'}
        print(f'{level}: {len(geo["features"])} areas; {target.stat().st_size:,} bytes')
    (DEST / 'metadata.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
