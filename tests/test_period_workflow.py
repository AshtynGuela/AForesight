import json
import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
import test_app
from app import DEFAULT_FARM
from modelling import replay_period
from advice import suggested_actions


class PeriodWorkflowTests(unittest.TestCase):
    setUp=test_app.PrototypeTests.setUp
    tearDown=test_app.PrototypeTests.tearDown

    def seed(self):
        climate=json.loads((Path(__file__).resolve().parents[1]/'data/samples/legazpi.json').read_text(encoding='utf-8'))
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute('INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',('climate',json.dumps(climate)))
        return climate

    def apply_october(self):
        return self.client.post('/api/period',json={'start':'2026-10-01','end':'2026-10-31','provider':'saved'})

    def test_october_replay_is_daily_varying_and_has_31_reference_pairs(self):
        climate=self.seed()
        result=replay_period(climate,'2026-10-01','2026-10-31','baseline')
        self.assertEqual(len(result['days']),31)
        self.assertEqual(result['days'][0]['origin'],'2026-09-30')
        self.assertEqual(result['days'][-1]['date'],'2026-10-31')
        self.assertGreater(len({r['temp'] for r in result['days']}),10)
        self.assertGreater(len({r['rain'] for r in result['days']}),10)
        self.assertEqual(result['replay_metrics']['temp']['n'],31)

    def test_future_reference_change_cannot_alter_earlier_predictions(self):
        climate=self.seed()
        before=replay_period(climate,'2026-10-01','2026-10-12','baseline')
        altered=json.loads(json.dumps(climate))
        for row in altered['days']:
            if row['date']>='2026-10-10':row.update(temp=50,rain=800)
        after=replay_period(altered,'2026-10-01','2026-10-12','baseline')
        self.assertEqual([(r['temp'],r['rain'])for r in before['days'][:10]],[(r['temp'],r['rain'])for r in after['days'][:10]])

    def test_period_controls_overview_and_full_month_simulation(self):
        self.seed();self.assertEqual(self.apply_october().status_code,200)
        state=self.client.get('/api/state').get_json()
        self.assertEqual(state['analysis_period']['end'],'2026-10-31')
        self.assertTrue(all(a.get('context') for a in state['recommendation']['actions']))
        self.assertEqual(self.client.post('/api/simulate',json={}).status_code,404)

    def test_record_edit_changes_model_input_and_backup_restores_it(self):
        climate=self.seed();self.apply_october()
        original=next(r for r in climate['days']if r['date']=='2026-10-15')
        self.assertEqual(self.client.post('/api/history/record',json={'date':'2026-10-15','temp':29,'rain':99}).status_code,200)
        state=self.client.get('/api/state').get_json()
        self.assertEqual(next(r['rain'] for r in state['climate']['days']if r['date']=='2026-10-15'),99)
        self.assertIn('unverified',state['climate']['source'])
        self.assertIsNone(state['internal'])
        backups=self.client.get('/api/history/backups').get_json()['backups']
        self.assertTrue(backups)
        self.assertEqual(self.client.post('/api/history/restore',json={'id':backups[0]['id']}).status_code,200)
        restored=self.client.get('/api/state').get_json()
        self.assertEqual(next(r for r in restored['climate']['days']if r['date']=='2026-10-15'),original)
        self.assertEqual(restored['farm'],state['farm'])

    def test_missing_period_is_not_silently_replaced_with_2025(self):
        self.assertEqual(self.apply_october().status_code,400)
        self.assertIsNone(self.client.get('/api/state').get_json()['analysis_period'])

    def test_download_includes_training_and_does_not_change_farm(self):
        climate=self.seed();farm=self.client.get('/api/state').get_json()['farm']
        with patch('app.fetch_power',return_value=climate) as fetch:
            response=self.client.post('/api/period',json={'start':'2026-10-01','end':'2026-10-31','provider':'nasa'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(fetch.call_args.args[-2],'2024-10-01')
        self.assertEqual(fetch.call_args.args[-1],'2026-10-31')
        self.assertEqual(self.client.get('/api/state').get_json()['farm'],farm)

    def test_alternative_source_and_archived_comparison_are_explicit(self):
        climate=self.seed()
        with patch('app.fetch_archive',return_value={**climate,'source':'ERA5 fixture'}) as fetch:
            self.assertEqual(self.client.post('/api/period',json={'start':'2026-10-01','end':'2026-10-31','provider':'era5'}).status_code,200)
            self.assertEqual(fetch.call_count,1)
        provider={'source':'Archived test model','days':[]}
        with patch('app.fetch_archived_forecast',return_value=provider):
            self.assertEqual(self.client.post('/api/comparison',json={'start':'2026-10-01','end':'2026-10-31'}).get_json()['provider'],provider)

    def test_forecast_test_returns_actions_and_never_archives_replay_as_future(self):
        self.seed();self.apply_october()
        result=self.client.post('/api/model',json={'mode':'replay','method':'baseline','start':'2026-10-01','end':'2026-10-31'}).get_json()
        self.assertEqual(result['internal']['mode'],'replay')
        self.assertTrue(result['actions'])
        self.assertTrue(all(a.get('reference')for a in result['actions']))
        restored=self.client.get('/api/state').get_json()['analysis']
        self.assertEqual(restored['internal']['period']['start'],'2026-10-01')
        self.assertEqual(len(restored['internal']['days']),31)
        with closing(sqlite3.connect(self.path)) as conn, conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM forecast_issues WHERE kind='internal'").fetchone()[0],0)

    def test_moderate_weather_still_produces_contextual_water_action(self):
        climate=self.seed()
        actions=suggested_actions({**DEFAULT_FARM,'water':'irrigated','crop':'corn','crop_stage':'vegetative'},climate,allow_past=True,label='October review')
        self.assertTrue(any('irrigation plan' in a['title']for a in actions))
        self.assertTrue(all(a.get('context')for a in actions))
