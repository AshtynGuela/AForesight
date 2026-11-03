import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
import requests
from app import create_app, DEFAULT_FARM
from engine import validate_profile, recommend
from climate import demo, fetch_power
from forecast import summarize_forecast


class PrototypeTests(unittest.TestCase):
    def setUp(self):
        temp_root = Path(__file__).resolve().parents[1] / 'instance' / 'tests'
        temp_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=temp_root)
        self.path = Path(self.temp.name) / 'test.sqlite3'
        self.client = create_app(self.path).test_client()

    def tearDown(self):
        self.temp.cleanup()

    def test_initial_state_is_explicit_demo(self):
        state = self.client.get('/api/state').get_json()
        self.assertTrue(state['climate']['demo'])
        self.assertIsNone(state['farm']['ph'])
        self.assertIn('Synthetic', state['recommendation']['source'])

    def test_profile_persists_across_app_restart(self):
        farm = {**DEFAULT_FARM, 'ph': 5.2, 'previous_ph': 6.2, 'ash': True}
        self.assertEqual(self.client.post('/api/profile', json=farm).status_code, 200)
        state = create_app(self.path).test_client().get('/api/state').get_json()
        self.assertEqual(state['farm']['ph'], 5.2)
        self.assertTrue(state['farm']['ash'])

    def test_invalid_profile_never_replaces_saved_profile(self):
        for invalid in [15, -1, 'NaN', 'Infinity', True]:
            self.assertEqual(self.client.post('/api/profile', json={**DEFAULT_FARM, 'ph': invalid}).status_code, 400)
        self.assertIsNone(self.client.get('/api/state').get_json()['farm']['ph'])

    def test_crop_stage_and_planting_date_are_validated_and_persisted(self):
        farm = {**DEFAULT_FARM, 'crop_stage': 'flowering', 'planting_date': '2026-01-15'}
        self.assertEqual(self.client.post('/api/profile', json=farm).status_code, 200)
        saved = self.client.get('/api/state').get_json()['farm']
        self.assertEqual(saved['crop_stage'], 'flowering')
        self.assertEqual(saved['planting_date'], '2026-01-15')
        self.assertEqual(self.client.post('/api/profile', json={**farm, 'planting_date': '2099-01-01'}).status_code, 400)

    def test_simulation_does_not_mutate_weather(self):
        before = self.client.get('/api/state').get_json()['climate']
        response = self.client.post('/api/simulate',json={'source':'history','system':'paddy','rain_change':-50})
        self.assertEqual(response.status_code,404)
        self.assertEqual(response.status_code,404)
        self.assertEqual(before,self.client.get('/api/state').get_json()['climate'])

    def test_journal_retries_are_idempotent(self):
        entry = dict(id='offline-entry-1', date='2025-03-01', crop='rice', note='<script>example</script>', technique='mulch', outcome='better', yield_kg=100)
        for _ in range(2):
            self.assertEqual(self.client.post('/api/journal', json=entry).status_code, 200)
        state = self.client.get('/api/state').get_json()
        self.assertEqual(len(state['journals']), 1)
        self.assertEqual(state['recommendation']['history_count'], 1)
        self.assertIn('not used for forecasts', state['recommendation']['history_note'])

    def test_bad_journal_and_dates(self):
        self.assertEqual(self.client.post('/api/journal', json={}).status_code, 400)
        for data in [{'start':'2025-03-30','end':'2025-03-01'}, {'start':'bad','end':'bad'}, {'start':'2025-03-01','end':'2025-03-02'}]:
            self.assertEqual(self.client.post('/api/climate', json=data).status_code, 400)

    def test_nasa_failure_does_not_replace_data(self):
        with patch('app.fetch_power', side_effect=requests.Timeout()):
            self.assertEqual(self.client.post('/api/climate', json={'start':'2025-03-01','end':'2025-03-30'}).status_code, 502)
        self.assertTrue(self.client.get('/api/state').get_json()['climate']['demo'])

    def test_nasa_cache_and_coordinate_change(self):
        climate = {**demo(DEFAULT_FARM['latitude'], DEFAULT_FARM['longitude']), 'demo':False, 'source':'test NASA fixture'}
        with patch('app.fetch_power', return_value=climate) as fetch:
            for _ in range(2):
                self.assertEqual(self.client.post('/api/climate', json={'start':'2025-03-01','end':'2025-03-30'}).status_code, 200)
            self.assertEqual(fetch.call_count, 1)
        self.assertEqual(self.client.post('/api/profile', json={**DEFAULT_FARM, 'latitude': 13.6218, 'longitude': 123.1948}).status_code, 200)
        self.assertTrue(self.client.get('/api/state').get_json()['climate']['demo'])

    def test_nasa_missing_values_and_absent_days(self):
        response = Mock()
        response.json.return_value = {'properties': {'parameter': {'T2M':{'20250301':28,'20250302':-999,'20250303':29}, 'PRECTOTCORR':{'20250301':2,'20250302':0,'20250303':-999}}}}
        with patch('climate.requests.get', return_value=response):
            result = fetch_power(13, 123, '2025-03-01', '2025-03-04')
        self.assertEqual(len(result['days']), 1)
        self.assertEqual(result['missing_days'], 3)

    def test_sms_is_removed(self):
        self.assertEqual(self.client.post('/api/sms', json={'text':'weather'}).status_code,404)

    def test_forecast_summary_adds_descriptive_risk_indicators(self):
        forecast = {'days': [
            {'date':'2026-11-03','rain': 0, 'high': 36, 'et0': 4},
            {'date':'2026-11-04','rain': 0, 'high': 35, 'et0': 4},
            {'date':'2026-11-05','rain': 0, 'high': 30, 'et0': 4},
            {'date':'2026-11-06','rain': 5, 'high': 30, 'et0': 4},
        ]}
        summary = summarize_forecast(forecast)
        self.assertEqual(summary['max_dry_spell_days'], 3)
        self.assertEqual(summary['heat_days'], 2)
        self.assertEqual(summary['rain_minus_et0'], -11)

    def test_loaded_forecast_reaches_source_linked_actions(self):
        from datetime import datetime, timezone, timedelta
        from time_utils import ph_today
        forecast = {'source': 'test forecast', 'latitude': DEFAULT_FARM['latitude'], 'longitude': DEFAULT_FARM['longitude'],
                    'retrieved_at': datetime.now(timezone.utc).isoformat(), 'days': [
                        {'date': ph_today().isoformat(), 'rain': 0, 'high': 36, 'et0': 4},
                        {'date': (ph_today()+timedelta(days=1)).isoformat(), 'rain': 0, 'high': 35, 'et0': 4},
                        {'date': (ph_today()+timedelta(days=2)).isoformat(), 'rain': 0, 'high': 30, 'et0': 4},
                    ]}
        self.assertEqual(self.client.post('/api/profile', json={**DEFAULT_FARM, 'crop_stage': 'flowering'}).status_code, 200)
        with patch('app.fetch_forecast', return_value=forecast):
            self.assertEqual(self.client.post('/api/forecast', json={}).status_code, 200)
        recommendation = self.client.get('/api/state').get_json()['recommendation']
        self.assertEqual(recommendation['forecast_summary']['max_dry_spell_days'], 3)
        self.assertTrue(any('dry window' in action['title'] for action in recommendation['actions']))
        self.assertTrue(any('flowering' in action['why'] for action in recommendation['actions']))
        self.assertTrue(all(action.get('reference') for action in recommendation['actions']))

    def test_cross_origin_and_non_json_writes_rejected(self):
        self.assertEqual(self.client.post('/api/profile', data='x').status_code, 415)
        self.assertEqual(self.client.post('/api/profile', json=DEFAULT_FARM, headers={'Origin':'https://example.com'}).status_code, 403)

    def test_shell_assets_served(self):
        for path in ['/', '/sw.js', '/static/app.js', '/static/style.css', '/static/manifest.json']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            response.close()


if __name__ == '__main__':
    unittest.main()
