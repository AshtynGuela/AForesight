import json
import sqlite3
from contextlib import closing
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
import requests
import test_app
from app import DEFAULT_FARM
from climate import demo


class SourcedHistoryTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def fixture(self):
        # Test-only adapter response, never written into the user's app database.
        return {
            **demo(DEFAULT_FARM["latitude"], DEFAULT_FARM["longitude"]),
            "source": "NASA adapter fixture",
            "demo": False,
            "kind": "gridded_reference",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        }

    def test_legacy_demo_in_database_is_not_displayed(self):
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute(
                "INSERT INTO state VALUES (?,?)",
                (
                    "climate",
                    json.dumps(
                        demo(DEFAULT_FARM["latitude"], DEFAULT_FARM["longitude"])
                    ),
                ),
            )
        state = self.client.get("/api/state").json
        self.assertEqual(state["climate"]["days"], [])
        self.assertEqual(state["data_labels"]["history"], "No sourced history")
        self.assertIsNone(state["recommendation"]["temp"])

    def test_download_preserves_coordinates_and_caches_provider_data(self):
        before = self.client.get("/api/state").json["farm"]
        with patch("app.fetch_power", return_value=self.fixture()) as fetch:
            first = self.client.post("/api/history/sourced", json={})
            second = self.client.post("/api/history/sourced", json={})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(fetch.call_count, 1)
        state = self.client.get("/api/state").json
        self.assertEqual(state["farm"], before)
        self.assertFalse(state["climate"]["demo"])

    def test_secondary_source_and_failures_never_substitute_sample_values(self):
        with (
            patch("app.fetch_power", side_effect=requests.Timeout()),
            patch("app.fetch_archive", return_value=self.fixture()),
        ):
            self.assertEqual(
                self.client.post("/api/history/sourced", json={}).status_code, 200
            )
        self.assertTrue(self.client.get("/api/state").json["climate"]["days"])

    def test_outage_on_new_install_stays_empty(self):
        with (
            patch("app.fetch_power", side_effect=requests.Timeout()),
            patch("app.fetch_archive", side_effect=requests.Timeout()),
        ):
            self.assertEqual(
                self.client.post("/api/history/sourced", json={}).status_code, 502
            )
        self.assertEqual(self.client.get("/api/state").json["climate"]["days"], [])

    def test_sample_routes_cannot_reintroduce_demo(self):
        for mode in ("demo", "sample"):
            self.assertEqual(
                self.client.post(
                    "/api/climate", json={"mode": mode, "dataset": "legazpi"}
                ).status_code,
                400,
            )
