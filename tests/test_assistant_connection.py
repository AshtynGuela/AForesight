import unittest
from unittest.mock import patch, Mock
import requests
from assistant_chat import understand

class ConnectionTests(unittest.TestCase):
    @patch.dict('os.environ', {'AGRIFORESIGHT_DEMO':'1','GEMINI_API_KEY':'test-key','AGRIFORESIGHT_AI_ENABLED':'1'}, clear=True)
    @patch('assistant_chat.requests.post')
    def test_hosted_demo_can_explicitly_enable_gemini(self, post):
        post.return_value=Mock(json=lambda: {'choices':[{'message':{'content':'{"intent":"help","value":""}'}}]})
        self.assertEqual(understand('Test Gemini')['intent'],'connection_ok')
        self.assertEqual(post.call_args.kwargs['json']['model'],'gemini-2.5-flash')
    @patch.dict('os.environ', {}, clear=True)
    def test_missing_key_is_visible(self):
        with self.assertRaisesRegex(ValueError,'not enabled'):understand('Test Gemini')
    @patch.dict('os.environ', {'GEMINI_API_KEY':'test-key'}, clear=True)
    @patch('assistant_chat.requests.post')
    def test_quota_error_is_visible(self, post):
        response=Mock(status_code=429)
        post.return_value.raise_for_status.side_effect=requests.HTTPError(response=response)
        with self.assertRaisesRegex(ValueError,'Quota'):understand('Test Gemini')
