import json
from contextlib import closing
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import unittest
import test_app
from app import DEFAULT_FARM
from climate import demo


class ReliabilityTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def test_confirmation_retry_returns_saved_result(self):
        session = str(uuid.uuid4())
        proposal = self.client.post('/api/chat', json={'session':session,'message':'my crop is corn'}).json
        request = {'session':session,'message':'Save this','confirmation_id':proposal['confirmation_id']}
        first = self.client.post('/api/chat', json=request).json
        second = self.client.post('/api/chat', json=request).json
        self.assertTrue(first['changed'])
        self.assertEqual(first['updated_fields'], second['updated_fields'])
        self.assertTrue(second['changed'])

    def test_stale_confirmation_preserves_new_farm(self):
        session = str(uuid.uuid4())
        proposal = self.client.post('/api/chat', json={'session':session,'message':'my crop is corn'}).json
        self.client.post('/api/profile', json={**DEFAULT_FARM,'name':'Changed farm'})
        result = self.client.post('/api/chat', json={'session':session,'message':'Save this','confirmation_id':proposal['confirmation_id']}).json
        self.assertNotIn('changed', result)
        self.assertEqual(self.client.get('/api/state').json['farm']['crop'], 'rice')

    def test_sample_label(self):
        self.assertEqual(self.client.get('/api/state').json['data_labels']['history'], 'Sample data')

    def test_compact_date_rejected(self):
        response = self.client.post('/api/profile', json={**DEFAULT_FARM,'sample_date':'20260101'})
        self.assertEqual(response.status_code, 400)

    def test_old_history_cache_refreshes(self):
        payload = demo(DEFAULT_FARM['latitude'], DEFAULT_FARM['longitude'])
        request = {'start':'2025-03-01','end':'2025-03-30'}
        with patch('app.fetch_power', return_value=payload) as fetch:
            self.assertEqual(self.client.post('/api/climate', json=request).status_code, 200)
            self.client.post('/api/climate', json=request)
            self.assertEqual(fetch.call_count, 1)
            with closing(sqlite3.connect(self.path)) as connection, connection:
                key, value = connection.execute("SELECT key,value FROM state WHERE key LIKE 'period:nasa:%'").fetchone()
                cached = json.loads(value)
                cached['cached_at'] = (datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
                connection.execute('UPDATE state SET value=? WHERE key=?', (json.dumps(cached),key))
            self.client.post('/api/climate', json=request)
            self.assertEqual(fetch.call_count, 2)

    def test_model_selection_is_request_local(self):
        import os
        from assistant_chat import provider_config
        with patch.dict(os.environ, {'AGRIFORESIGHT_AI_PROVIDER':'groq','AGRIFORESIGHT_CHAT_MODEL':'groq-custom','AGRIFORESIGHT_OPENROUTER_MODEL':'nvidia/nemotron-3.5-super-vl:free','GROQ_API_KEY':'test-groq','OPENROUTER_API_KEY':'test-openrouter','AGRIFORESIGHT_AI_ENABLED':'1'}):
            seen = []
            def answer(*args, **kwargs):
                seen.append(provider_config()[:3])
                return {'intent':'chat','value':'Hello'}
            with patch('assistant_chat.understand', side_effect=answer):
                for model in ('gayuma','alon'):
                    response = self.client.post('/api/chat', json={'session':str(uuid.uuid4()),'message':'hello','model':model})
                    self.assertEqual(response.status_code, 200)
            self.assertEqual(seen[0], ('OpenRouter','test-openrouter','nvidia/nemotron-3.5-super-vl:free'))
            self.assertEqual(seen[1], ('Groq','test-groq','groq-custom'))
            self.assertEqual(provider_config()[0], 'Groq')
            response = self.client.post('/api/chat', json={'session':str(uuid.uuid4()),'message':'hello','model':'unknown'})
            self.assertEqual(response.status_code, 400)
            models = self.client.get('/api/chat/models').json
            self.assertTrue(all(item['available'] for item in models['models']))
            self.assertNotIn('test-groq', json.dumps(models))

    def test_chat_sees_outlook_and_history_without_short_forecast(self):
        import os
        payload = {'source':'Test outlook','retrieved_at':'2026-01-01T00:00:00+00:00','days':[{'date':'2026-01-02','temp':28,'rain':3}]}
        key = f"month:{DEFAULT_FARM['latitude']}:{DEFAULT_FARM['longitude']}"
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute('INSERT INTO state VALUES (?,?)', (key,json.dumps(payload)))
        contexts = []
        def answer(message, history=None, context=None):
            contexts.append(context)
            return {'intent':'weather','value':'outlook'}
        with patch.dict(os.environ, {'AGRIFORESIGHT_AI_PROVIDER':'groq','GROQ_API_KEY':'test','AGRIFORESIGHT_AI_ENABLED':'1'}), patch('assistant_chat.understand',side_effect=answer):
            response = self.client.post('/api/chat',json={'session':str(uuid.uuid4()),'message':'Explain my month forecast'}).json
        self.assertTrue(contexts[0]['weather']['outlook']['available'])
        self.assertTrue(contexts[0]['weather']['history']['sample'])
        self.assertFalse(contexts[0]['weather']['forecast']['available'])
        self.assertEqual(response['days'],payload['days'])
        self.assertIn('needs an update',response['text'])
        self.assertIn('Test outlook',response['text'])

    def test_guided_history_reads_saved_sample_records(self):
        with patch('assistant_chat.ai_enabled',return_value=False):
            response = self.client.post('/api/chat',json={'session':str(uuid.uuid4()),'message':'Show historical weather'}).json
        self.assertEqual(len(response['days']),30)
        self.assertIn('sample values',response['text'])
        self.assertEqual(response['open_page'],'climate')
