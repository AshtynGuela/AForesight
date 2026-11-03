import json
import unittest
from datetime import date,datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch
import numpy as np
import test_app
from app import DEFAULT_FARM
from climate import demo
from modelling import build_forecast,clean_days,fit,predict,metrics
from simulation import simulate
from forecast import summarize_forecast
from advice import suggested_actions
from evaluation import archive_scores


def series(n=400):
    start=date(2024,1,1)
    return {'source':'Synthetic test only','demo':True,'latitude':13.1391,'longitude':123.7438,'days':[{'date':(start+timedelta(days=i)).isoformat(),'temp':27+np.sin(i/20),'rain':float(i%9)} for i in range(n)]}


class ForecastScienceTests(unittest.TestCase):
    def test_missing_days_are_not_imputed_or_counted_as_dry(self):
        climate=series(30)
        climate['days'].pop(4)
        dates,values,q=clean_days(climate)
        self.assertEqual(q['missing_days'],1)
        self.assertTrue(np.isnan(values[4]).all())
        summary=summarize_forecast({'days':[{'date':'2025-01-01','rain':0},{'date':'2025-01-03','rain':0},{'date':'2025-01-04','rain':0}]})
        self.assertEqual(summary['max_dry_spell_days'],2)
        self.assertIsNone(summary['rain_minus_et0'])

    def test_conflicting_duplicates_rejected(self):
        climate=series(20)
        climate['days'].append({**climate['days'][0],'rain':99})
        with self.assertRaises(ValueError):clean_days(climate)

    def test_model_at_origin_cannot_see_future_targets(self):
        dates,values,_=clean_days(series(400))
        first=fit(values,dates,250)
        altered=values.copy()
        altered[251:]=[60,1000]
        second=fit(altered,dates,250)
        np.testing.assert_allclose(predict(values,dates,250,first),predict(altered,dates,250,second))

    def test_synthetic_data_never_promotes_regression(self):
        result=build_forecast(series(400))
        self.assertFalse(result['ridge_eligible'])
        self.assertEqual(result['evaluation']['rain']['selected'],'baseline')
        self.assertEqual(len(result['days']),7)

    def test_short_series_gets_baseline_without_fake_metrics(self):
        result=build_forecast(series(30))
        self.assertIsNone(result['evaluation']['rain']['holdout']['baseline'])
        self.assertIsNone(result['days'][0]['rain_range'])
        self.assertEqual(build_forecast(series(8))['status'],'insufficient')

    def test_mape_excludes_zero_rain_and_temperature_percentages(self):
        pairs=[{'actual':[25,0],'predicted':[26,2]},{'actual':[26,2],'predicted':[25,3]}]
        self.assertEqual(metrics(pairs,1)['mape'],50)
        self.assertEqual(metrics(pairs,1)['mape_excluded'],1)
        self.assertEqual(metrics(pairs,1)['mae'],1.5)
        self.assertIsNone(metrics(pairs,0)['mape'])

    def test_real_samples_are_source_labelled_and_evaluable(self):
        root=Path(__file__).resolve().parents[1]
        for name in ('legazpi','naga'):
            climate=json.loads((root/'data'/'samples'/f'{name}.json').read_text())
            model=build_forecast(climate)
            self.assertFalse(model['demo'])
            self.assertTrue(model['ridge_eligible'])
            self.assertGreater(model['evaluation']['rain']['holdout']['baseline']['n'],40)
            self.assertIn('NASA POWER',model['source'])


class WaterBalanceTests(unittest.TestCase):
    def setUp(self):
        self.weather=series(14)
        for d in self.weather['days']:d.update(rain=0,et0=5)
        self.farm={**DEFAULT_FARM,'crop':'corn','terrain':'upland'}

    def test_water_is_conserved_and_irrigation_cannot_increase_unmet_demand(self):
        r=simulate(self.farm,self.weather,None,{'source':'history','system':'rootzone','rain_change':0,'demand_change':0,'irrigation_mm':50,'irrigation_day':3})
        for run in (r['baseline'],r['scenario']):
            self.assertTrue(all(abs(d['balance_error'])<1e-6 for d in run['days']))
            self.assertTrue(all(d['storage']>=0 for d in run['days']))
        self.assertLessEqual(r['scenario']['unmet_demand'],r['baseline']['unmet_demand'])
        self.assertEqual(r['scenario']['irrigation_m3'],500)

    def test_equal_inputs_produce_identical_plans(self):
        r=simulate(self.farm,self.weather,None,{'source':'history','system':'rootzone','rain_change':0,'demand_change':0})
        self.assertEqual(r['baseline'],r['scenario'])

    def test_paddy_balances_and_does_not_claim_root_stress(self):
        r=simulate(DEFAULT_FARM,self.weather,None,{'source':'history','system':'paddy','rain_change':0,'demand_change':0})
        self.assertGreater(r['scenario']['flag_days'],0)
        self.assertIn('does not mean',r['interpretation'])
        self.assertTrue(all(abs(d['balance_error'])<1e-6 for d in r['scenario']['days']))

    def test_gaps_invalid_soil_and_paddy_non_rice_are_rejected(self):
        for params in [{'system':'rootzone','field_capacity':.1,'wilting_point':.2},{'system':'paddy'}]:
            with self.assertRaises(ValueError):simulate(self.farm,self.weather,None,{'source':'history',**params})
        self.weather['days'].pop(4)
        with self.assertRaises(ValueError):simulate(self.farm,self.weather,None,{'source':'history','system':'rootzone'})


class ForecastArchiveTests(unittest.TestCase):
    def test_provider_difference_is_not_scored_without_later_reference(self):
        data={'days':[{'date':'2025-01-03','temp':25,'rain':1}]}
        payload={'days':[{'date':'2025-01-04','temp':26,'rain':2}]}
        snapshots=[{'kind':kind,'issued_at':'2025-01-03T00:00:00+00:00','payload':payload}for kind in('internal','open_meteo')]
        self.assertEqual(archive_scores(snapshots,{**data,'source':'test'})['matched_forecasts'],0)
        data['days'].append({'date':'2025-01-04','temp':24,'rain':0})
        self.assertEqual(archive_scores(snapshots,{**data,'source':'test'})['scores']['internal']['temp']['mae'],2)

    def test_same_day_or_after_target_issues_are_not_scored(self):
        payload={'days':[{'date':'2025-01-04','temp':26,'rain':2}]}
        snapshots=[{'kind':kind,'issued_at':'2025-01-04T00:00:00+00:00','payload':payload}for kind in('internal','open_meteo')]
        self.assertEqual(archive_scores(snapshots,{'days':[{'date':'2025-01-04','temp':24,'rain':1}],'source':'test'})['matched_forecasts'],0)


class PlanningAPITests(unittest.TestCase):
    setUp=test_app.PrototypeTests.setUp
    tearDown=test_app.PrototypeTests.tearDown

    def test_import_does_not_accept_duplicate_dates_or_change_journal(self):
        csv='date,temp,rain\n'+'\n'.join(f'2025-01-{i:02d},27,0'for i in range(1,15))
        self.assertEqual(self.client.post('/api/history/import',json={'csv':csv}).status_code,200)
        self.assertIn('unverified',self.client.get('/api/state').get_json()['climate']['source'])
        self.assertEqual(self.client.post('/api/history/import',json={'csv':csv+'\n2025-01-01,28,1'}).status_code,400)
        self.assertEqual(self.client.get('/api/state').get_json()['journals'],[])

    def test_model_sample_does_not_change_profile_or_active_weather(self):
        before=self.client.get('/api/state').get_json()
        response=self.client.post('/api/model',json={'dataset':'legazpi'})
        self.assertEqual(response.status_code,200)
        after=self.client.get('/api/state').get_json()
        self.assertEqual(before['farm'],after['farm'])
        self.assertEqual(before['climate'],after['climate'])

    def test_journal_context_is_preserved_but_not_used_for_advice(self):
        before=self.client.get('/api/state').get_json()['recommendation']['actions']
        entry={'id':'context-1','date':'2025-01-01','crop':'rice','note':'Unprocessed field note','technique':'test','outcome':'unobserved','farm_context':{'municipality':'Original offline place'},'recorded_at':'2025-01-01T02:00:00Z'}
        self.assertEqual(self.client.post('/api/journal',json=entry).status_code,200)
        state=self.client.get('/api/state').get_json()
        self.assertEqual(state['journals'][0]['farm_context']['municipality'],'Original offline place')
        self.assertEqual(before,state['recommendation']['actions'])

    def test_weather_actions_have_sources_and_ignore_stale_forecasts(self):
        stale={'retrieved_at':'2020-01-01T00:00:00+00:00','days':[{'date':'2020-01-02','rain':100}]}
        actions=suggested_actions(DEFAULT_FARM,stale)
        self.assertTrue(all(a.get('reference')for a in actions))
        self.assertFalse(any('drainage' in a['title']for a in actions))
