import unittest
from unittest.mock import patch, Mock
import requests
from assistant_chat import understand, parse_reply, gemini_request

class ConnectionTests(unittest.TestCase):
    @patch.dict('os.environ', {'AGRIFORESIGHT_DEMO':'1','GEMINI_API_KEY':'test-key','AGRIFORESIGHT_AI_ENABLED':'1'}, clear=True)
    @patch('assistant_chat.requests.post')
    def test_hosted_demo_can_explicitly_enable_gemini(self, post):
        post.return_value=Mock(json=lambda: {'choices':[{'message':{'content':'{"intent":"help","value":""}'}}]})
        self.assertEqual(understand('Test Gemini')['intent'],'connection_ok')
        self.assertEqual(post.call_args.kwargs['json']['model'],'gemini-2.5-flash')
        self.assertEqual(post.call_args.kwargs['json']['response_format']['type'],'json_schema')
    @patch.dict('os.environ', {}, clear=True)
    def test_missing_key_is_visible(self):
        with self.assertRaisesRegex(ValueError,'not enabled'):understand('Test Gemini')
    @patch.dict('os.environ', {'GEMINI_API_KEY':'test-key'}, clear=True)
    @patch('assistant_chat.requests.post')
    def test_quota_error_is_visible(self, post):
        response=Mock(status_code=429)
        post.return_value.raise_for_status.side_effect=requests.HTTPError(response=response)
        with self.assertRaisesRegex(ValueError,'Quota'):understand('Test Gemini')


class ReplyTests(unittest.TestCase):
    def payload(self, content, **extra):
        return {'choices':[{'message':{'content':content}, **extra}]}
    def test_fenced_json(self):
        self.assertEqual(parse_reply(self.payload('```json\n{"intent":"farm","value":""}\n```'))['intent'],'farm')
    def test_text_parts(self):
        self.assertEqual(parse_reply(self.payload([{'type':'text','text':'{"intent":"farm","value":""}'}]))['intent'],'farm')
    def test_empty(self):
        with self.assertRaisesRegex(ValueError,'empty'):parse_reply(self.payload(None))
    def test_truncated(self):
        with self.assertRaisesRegex(ValueError,'finishing'):parse_reply(self.payload('{',finish_reason='length'))
    def test_invalid_action(self):
        with self.assertRaisesRegex(ValueError,'valid app action'):parse_reply(self.payload('{"intent":"delete","value":"all"}'))
    def test_no_answer(self):
        with self.assertRaisesRegex(ValueError,'no answer'):parse_reply({'choices':[]})


class RetryTests(unittest.TestCase):
    @patch('assistant_chat.time.sleep')
    @patch('assistant_chat.requests.post')
    def test_recovers_after_503(self, post, sleep):
        post.side_effect=[Mock(status_code=503),Mock(status_code=200)]
        self.assertEqual(gemini_request().status_code,200)
        self.assertEqual(post.call_count,2)
        sleep.assert_called_once_with(2)
    @patch('assistant_chat.time.sleep')
    @patch('assistant_chat.requests.post')
    def test_stops_after_three_attempts(self, post, sleep):
        post.return_value=Mock(status_code=503)
        self.assertEqual(gemini_request().status_code,503)
        self.assertEqual(post.call_count,3)
    @patch('assistant_chat.time.sleep')
    @patch('assistant_chat.requests.post')
    def test_does_not_retry_bad_key_or_model(self, post, sleep):
        for status in [400,401,403,404,429]:
            post.reset_mock();post.return_value=Mock(status_code=status)
            self.assertEqual(gemini_request().status_code,status)
            post.assert_called_once()
        sleep.assert_not_called()


class TransportTests(unittest.TestCase):
    @patch.dict('os.environ', {'GEMINI_API_KEY':'test-key','AGRIFORESIGHT_CHAT_MODEL':'test-model'}, clear=True)
    @patch('assistant_chat.requests.post')
    def test_transport_failures_are_distinct_and_do_not_leak_secrets(self, post):
        for error, text in [(requests.ConnectTimeout,'8 seconds'), (requests.ReadTimeout,'45-second'), (requests.exceptions.SSLError,'secure connection'), (requests.ConnectionError,'interrupted')]:
            post.reset_mock()
            post.side_effect=error('secret request details')
            with self.assertRaises(ValueError) as caught:understand('Test Gemini')
            self.assertIn(text,str(caught.exception))
            self.assertIn('test-model',str(caught.exception))
            self.assertNotIn('secret',str(caught.exception))
            post.assert_called_once()
            self.assertEqual(post.call_args.kwargs['timeout'],(8,45))
