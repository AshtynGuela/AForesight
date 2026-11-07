import unittest
import test_app
from app import DEFAULT_FARM


class SoilReportTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def test_categories_are_saved_without_inventing_numeric_readings(self):
        farm = {
            **DEFAULT_FARM,
            "nitrogen_rating": "low",
            "phosphorus_rating": "medium",
            "potassium_rating": "high",
            "ph_medium": "water",
            "soil_method": "field kit",
            "sample_date": "2026-01-01",
        }
        result = self.client.post("/api/profile", json=farm)
        self.assertEqual(result.status_code, 200)
        saved = self.client.get("/api/state").json["farm"]
        self.assertEqual(saved["nitrogen_rating"], "low")
        self.assertIsNone(saved["nitrogen"])
        for key, value in [("nitrogen_rating", "adequate"), ("ph_medium", "guessed")]:
            self.assertEqual(
                self.client.post("/api/profile", json={**farm, key: value}).status_code,
                400,
            )

    def test_location_changes_retain_the_report_original_field(self):
        first = self.client.post(
            "/api/profile",
            json={
                **DEFAULT_FARM,
                "ph": 6.2,
                "soil_method": "lab",
                "sample_date": "2026-01-01",
            },
        ).json["farm"]
        moved = self.client.post(
            "/api/profile/location", json={"latitude": 13.6218, "longitude": 123.1948}
        ).json["farm"]
        self.assertEqual(moved["ph"], 6.2)
        self.assertEqual(moved["soil_sample_point"], first["soil_sample_point"])
        saved = self.client.post("/api/profile", json=moved).json["farm"]
        self.assertEqual(saved["soil_sample_point"], first["soil_sample_point"])
        updated = self.client.post("/api/profile", json={**saved, "ph": 6.3}).json[
            "farm"
        ]
        self.assertEqual(
            updated["soil_sample_point"], {"latitude": 13.6218, "longitude": 123.1948}
        )
