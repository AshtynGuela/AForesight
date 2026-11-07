import json
import sqlite3
import unittest
from contextlib import closing
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch
import requests
import test_app
from app import DEFAULT_FARM
from forecast import fetch_conditions


class ConditionsTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def payload(self):
        return {
            "source": "Open-Meteo weather model",
            "kind": "model_estimate",
            "latitude": DEFAULT_FARM["latitude"],
            "longitude": DEFAULT_FARM["longitude"],
            "temperature": 28,
            "humidity": 80,
            "soil_moisture": 0.3,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "valid_at": datetime.now(timezone.utc).isoformat(),
        }

    def test_caches_conditions_and_does_not_change_soil_tests(self):
        before = self.client.get("/api/state").json["farm"]
        with patch("app.fetch_conditions", return_value=self.payload()) as fetch:
            first = self.client.post("/api/conditions", json={})
            second = self.client.post("/api/conditions", json={})
        self.assertEqual(first.status_code, 200)
        self.assertTrue(second.json["cached"])
        self.assertEqual(fetch.call_count, 1)
        state = self.client.get("/api/state").json
        self.assertEqual(state["farm"], before)
        self.assertEqual(state["current_conditions"]["soil_moisture"], 0.3)

    def test_failed_refresh_keeps_timestamp(self):
        payload = self.payload()
        payload["retrieved_at"] = (
            datetime.now(timezone.utc) - timedelta(hours=3)
        ).isoformat()
        key = f"conditions:v1:{DEFAULT_FARM['latitude']}:{DEFAULT_FARM['longitude']}"
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute("INSERT INTO state VALUES (?,?)", (key, json.dumps(payload)))
        with patch("app.fetch_conditions", side_effect=requests.Timeout):
            response = self.client.post("/api/conditions", json={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json["conditions"]["retrieved_at"], payload["retrieved_at"]
        )
        self.assertIn("warning", response.json)

    def test_failure_without_cache_is_clear(self):
        with patch("app.fetch_conditions", side_effect=requests.Timeout):
            response = self.client.post("/api/conditions", json={})
        self.assertEqual(response.status_code, 502)

    def test_partial_estimates_and_fraction_units(self):
        response = Mock()
        response.json.return_value = {
            "utc_offset_seconds": 28800,
            "current": {
                "time": "2026-11-07T12:30",
                "temperature_2m": 28,
                "relative_humidity_2m": True,
                "soil_moisture_0_to_1cm": 0.328,
            },
        }
        with patch("forecast.requests.get", return_value=response):
            data = fetch_conditions(13, 123)
        self.assertEqual(data["soil_moisture"], 0.328)
        self.assertIsNone(data["humidity"])
        self.assertTrue(data["valid_at"].endswith("+08:00"))
        self.assertEqual(data["soil_depth_cm"], [0, 1])

    def test_free_backup_has_real_air_values_and_no_invented_soil_moisture(self):
        response = Mock()
        response.headers = {}
        stamp = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        response.json.return_value = {
            "properties": {
                "timeseries": [
                    {
                        "time": stamp.isoformat(),
                        "data": {
                            "instant": {
                                "details": {
                                    "air_temperature": 27.5,
                                    "relative_humidity": 82,
                                }
                            }
                        },
                    },
                    {
                        "time": (stamp + timedelta(days=1)).isoformat(),
                        "data": {
                            "instant": {
                                "details": {
                                    "air_temperature": 50,
                                    "relative_humidity": 10,
                                }
                            }
                        },
                    },
                ]
            }
        }
        with patch(
            "forecast.requests.get", side_effect=[requests.Timeout(), response]
        ) as fetch:
            data = fetch_conditions(13.139123, 123.743812)
        self.assertEqual(data["temperature"], 27.5)
        self.assertEqual(data["humidity"], 82)
        self.assertIsNone(data["soil_moisture"])
        self.assertIn("MET Norway", data["source"])
        self.assertGreaterEqual(
            (
                datetime.fromisoformat(data["cache_until"])
                - datetime.fromisoformat(data["retrieved_at"])
            ).total_seconds(),
            10800,
        )
        self.assertEqual(
            fetch.call_args.kwargs["params"], {"lat": 13.1391, "lon": 123.7438}
        )

    def test_provider_failure_survives_state_refresh_and_briefly_backs_off(self):
        with patch("app.fetch_conditions", side_effect=requests.Timeout) as fetch:
            first = self.client.post("/api/conditions", json={})
            second = self.client.post("/api/conditions", json={})
        self.assertEqual(first.status_code, 502)
        self.assertEqual(second.json, first.json)
        self.assertEqual(fetch.call_count, 1)
        status = self.client.get("/api/state").json["current_conditions_status"]
        self.assertEqual(status["message"], first.json["error"])
        self.assertEqual(status["code"], "conditions_timeout")

    def test_backup_cache_does_not_poll_before_its_allowed_refresh(self):
        payload = self.payload()
        payload["source"] = "MET Norway (CC BY 4.0)"
        payload["retrieved_at"] = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat()
        payload["cache_until"] = (
            datetime.now(timezone.utc) + timedelta(hours=2)
        ).isoformat()
        key = f"conditions:v1:{DEFAULT_FARM['latitude']}:{DEFAULT_FARM['longitude']}"
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute("INSERT INTO state VALUES (?,?)", (key, json.dumps(payload)))
        with patch("app.fetch_conditions") as fetch:
            response = self.client.post("/api/conditions", json={})
        self.assertTrue(response.json["cached"])
        fetch.assert_not_called()
