import unittest
from unittest.mock import patch, Mock
from datetime import datetime, timezone
import requests
from location import lookup, in_ring, contains
from forecast import fetch_forecast
import test_app


class GeographyTests(unittest.TestCase):
    def test_philippine_locations_outside_bicol_are_supported(self):
        for point, expected in [((13.1391,123.7438),'Legazpi City'), ((10.3157,123.8854),'Cebu City'), ((7.1907,125.4553),'Davao City')]:
            result = lookup(*point)
            self.assertEqual(result['municipality'], expected)
            self.assertEqual(result['country_code'], 'PH')
            self.assertEqual(result['boundary_year'], '2020')

    def test_foreign_and_sea_points_are_not_assigned_nearest_ph_city(self):
        for point in [(5.98,116.07), (13.5,123.7438), (35.68,139.69), (float('nan'),123)]:
            with self.assertRaises(ValueError):
                lookup(*point)

    def test_polygon_holes_and_edges(self):
        outer = [[0,0],[10,0],[10,10],[0,10],[0,0]]
        hole = [[4,4],[6,4],[6,6],[4,6],[4,4]]
        shape = {'type':'Polygon', 'coordinates':[outer,hole]}
        self.assertTrue(contains(shape,2,2))
        self.assertFalse(contains(shape,5,5))
        self.assertFalse(contains(shape,11,5))
        self.assertTrue(contains(shape,0,5))


class EnrichmentTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def test_location_preview_does_not_change_saved_farm(self):
        before = self.client.get('/api/state').get_json()['farm']
        result = self.client.post('/api/location',json={'latitude':10.3157,'longitude':123.8854})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.get_json()['location']['municipality'],'Cebu City')
        self.assertEqual(before,self.client.get('/api/state').get_json()['farm'])

    def test_profile_cannot_spoof_location_or_save_offshore(self):
        from app import DEFAULT_FARM
        self.assertEqual(self.client.post('/api/profile',json={**DEFAULT_FARM,'location':{'country':'Fake'}}).status_code,200)
        saved = self.client.get('/api/state').get_json()['farm']
        self.assertEqual(saved['location']['country'],'Philippines')
        self.assertEqual(self.client.post('/api/profile',json={**DEFAULT_FARM,'latitude':5.98,'longitude':116.07}).status_code,400)
        self.assertEqual(saved,self.client.get('/api/state').get_json()['farm'])

    def test_forecast_cache_and_coordinate_isolation(self):
        from app import DEFAULT_FARM
        fixture = {'latitude':DEFAULT_FARM['latitude'],'longitude':DEFAULT_FARM['longitude'],'retrieved_at':datetime.now(timezone.utc).isoformat(),'days':[{'date':'2026-11-03','rain':2}]}
        with patch('app.fetch_forecast',return_value=fixture) as fetch:
            self.assertEqual(self.client.post('/api/forecast',json={}).status_code,200)
            self.assertTrue(self.client.post('/api/forecast',json={}).get_json()['cached'])
            self.assertEqual(fetch.call_count,1)
        self.client.post('/api/profile',json={**DEFAULT_FARM,'latitude':10.3157,'longitude':123.8854})
        self.assertIsNone(self.client.get('/api/state').get_json()['forecast'])

    def test_forecast_failure_is_explicit(self):
        with patch('app.fetch_forecast',side_effect=requests.Timeout()):
            self.assertEqual(self.client.post('/api/forecast',json={}).status_code,502)
        self.assertIsNone(self.client.get('/api/state').get_json()['forecast'])

    def test_forecast_missing_values_are_not_zero(self):
        response = Mock()
        response.json.return_value = {'elevation':150,'daily':{'time':['2026-11-03','2026-11-04'],'temperature_2m_max':[30,None],'precipitation_sum':[5,None]}}
        with patch('forecast.requests.get',return_value=response):
            result = fetch_forecast(13.1391,123.7438)
        self.assertIsNone(result['days'][1]['rain'])
        self.assertIsNone(result['days'][0]['probability'])
        self.assertEqual(result['elevation'],150)
