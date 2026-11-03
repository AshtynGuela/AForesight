"""PH-only point-in-polygon lookup."""
import json
from functools import lru_cache
from pathlib import Path
from engine import number

DATA = Path(__file__).parent / 'data' / 'boundaries'


def coordinates(data):
    # A coarse prefilter only. Polygon containment below enforces coverage.
    return (number(data.get('latitude'), 'Latitude', 4, 22),
            number(data.get('longitude'), 'Longitude', 116, 127))


def in_ring(x, y, ring):
    inside = False
    for a, b in zip(ring, ring[1:]):
        ax, ay = a[:2]
        bx, by = b[:2]
        cross = (x-ax)*(by-ay) - (y-ay)*(bx-ax)
        if abs(cross) < 1e-12 and min(ax,bx) <= x <= max(ax,bx) and min(ay,by) <= y <= max(ay,by):
            return True
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            inside = not inside
    return inside


def polygons(geometry):
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates']]
    if geometry['type'] == 'MultiPolygon':
        return geometry['coordinates']
    return []


def contains(geometry, longitude, latitude):
    return any(in_ring(longitude, latitude, polygon[0]) and not any(in_ring(longitude, latitude, hole) for hole in polygon[1:]) for polygon in polygons(geometry))


@lru_cache(maxsize=3)
def load_level(level):
    features = json.loads((DATA / f'{level}.geojson').read_text(encoding='utf-8'))['features']
    for feature in features:
        points = [point for poly in polygons(feature['geometry']) for ring in poly for point in ring]
        feature['_bounds'] = (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
    return features


def match(level, latitude, longitude):
    for f in load_level(level):
        left, bottom, right, top = f['_bounds']
        if left <= longitude <= right and bottom <= latitude <= top and contains(f['geometry'], longitude, latitude):
            return f
    return None


@lru_cache(maxsize=256)
def lookup(latitude, longitude):
    coordinates({'latitude': latitude, 'longitude': longitude})
    municipality = match('ADM3', latitude, longitude)
    if not municipality:
        raise ValueError('No Philippine municipality covers this point in the bundled dataset. Check latitude/longitude order and the pin. Offshore, outside-PH or boundary-gap points cannot be saved.')
    region = match('ADM1', latitude, longitude)
    province = match('ADM2', latitude, longitude)
    metadata = json.loads((DATA / 'metadata.json').read_text(encoding='utf-8'))
    return {
        'country': 'Philippines', 'country_code': 'PH', 'latitude': latitude, 'longitude': longitude,
        'municipality': municipality['properties']['shapeName'],
        'province': province['properties']['shapeName'] if province else '',
        'region': region['properties']['shapeName'] if region else '',
        'boundary_id': municipality['properties']['shapeID'],
        'boundary_year': metadata['ADM3']['boundaryYearRepresented'],
        'source': 'geoBoundaries gbOpen / NAMRIA, PSA and OCHA Philippines',
        'license': metadata['ADM3']['boundaryLicense'],
        'geometry': municipality['geometry'],
        'note': 'Approximate boundary match.'
    }
