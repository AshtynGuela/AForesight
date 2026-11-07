import unittest
from unittest.mock import patch
import requests
import test_app


class ForecastCooldownTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def test_busy_provider_is_not_called_again_during_cooldown(self):
        response = requests.Response()
        response.status_code = 429
        response.headers["Retry-After"] = "900"
        with patch(
            "app.fetch_forecast", side_effect=requests.HTTPError(response=response)
        ) as fetch:
            first = self.client.post("/api/forecast", json={})
            second = self.client.post("/api/forecast", json={})
        self.assertEqual(first.status_code, 502)
        self.assertEqual(second.status_code, 503)
        self.assertIn("retry_at", second.json)
        self.assertEqual(fetch.call_count, 1)
        self.assertIsNone(self.client.get("/api/state").json["forecast"])
