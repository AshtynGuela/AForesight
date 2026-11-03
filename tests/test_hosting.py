import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app import create_app
from assistant_chat import understand

class HostingTests(unittest.TestCase):
    def test_demo_health_and_state(self):
        root=Path(__file__).resolve().parents[1]/'instance'/'tests'
        root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as folder, patch.dict(os.environ,{'AGRIFORESIGHT_DEMO':'1'}):
            client=create_app(Path(folder)/'farm.sqlite3').test_client()
            self.assertEqual(client.get('/healthz').json,{'status':'ok'})
            self.assertTrue(client.get('/api/state').json['demo_mode'])

    def test_demo_never_calls_paid_classifier(self):
        with patch.dict(os.environ,{'AGRIFORESIGHT_DEMO':'1','OPENAI_API_KEY':'test','AGRIFORESIGHT_CHAT_MODEL':'test'}), patch('assistant_chat.requests.post') as provider:
            self.assertEqual(understand('hello there')['intent'],'help')
            provider.assert_not_called()
