import unittest
from unittest.mock import Mock, patch
import requests
import test_app
from app import DEFAULT_FARM
from street_photos import fetch_street_photo


class StreetPhotoTests(unittest.TestCase):
    setUp = test_app.PrototypeTests.setUp
    tearDown = test_app.PrototypeTests.tearDown

    def row(self, **changes):
        return {
            "lat": 13.1392,
            "lng": 123.7438,
            "visibility": "public",
            "status": "active",
            "autoImgProcessingResult": "BLURRED",
            "imageThUrl": "https://cdn.kartaview.org/thumbnail",
            "imageProcUrl": "https://cdn.kartaview.org/processed",
            "shotDate": "2023-06-06 02:14:43.000",
            **changes,
        }

    def fetch(self, rows):
        response = Mock()
        response.json.return_value = {
            "status": {"apiCode": 600},
            "result": {"data": rows},
        }
        with patch("street_photos.requests.get", return_value=response):
            return fetch_street_photo(13.1391, 123.7438)

    def test_selects_nearby_public_processed_photo_and_preserves_capture_date(self):
        result = self.fetch([self.row(lat=13.1400), self.row()])
        self.assertEqual(result["photo"]["distance_m"], 11)
        self.assertEqual(result["photo"]["captured_on"], "2023-06-06")
        self.assertEqual(
            result["photo"]["full_image_url"], "https://cdn.kartaview.org/processed"
        )
        self.assertEqual(result["photo"]["license"], "CC BY-SA 4.0")

    def test_rejects_distant_private_unblurred_and_untrusted_images(self):
        rows = [
            self.row(lat=14),
            self.row(lat="NaN"),
            self.row(visibility="private"),
            self.row(autoImgProcessingResult="NONE"),
            self.row(shotDate="bad"),
            self.row(imageThUrl="http://cdn.kartaview.org/unsafe"),
            self.row(imageThUrl="https://cdn.kartaview.org.evil.test/a"),
            self.row(imageThUrl="https://localhost/a"),
        ]
        self.assertIsNone(self.fetch(rows)["photo"])

    def test_empty_coverage_is_distinct_from_provider_failure(self):
        self.assertIsNone(self.fetch([])["photo"])
        response = Mock()
        response.json.return_value = {
            "status": {"apiCode": 400},
            "result": {"data": []},
        }
        with (
            patch("street_photos.requests.get", return_value=response),
            self.assertRaises(ValueError),
        ):
            fetch_street_photo(13.1391, 123.7438)

    def test_malformed_provider_reply_is_a_recoverable_failure(self):
        for payload in [
            [],
            {"status": []},
            {"status": {"apiCode": 600}, "result": None},
        ]:
            response = Mock()
            response.json.return_value = payload
            with (
                patch("street_photos.requests.get", return_value=response),
                self.assertRaises(ValueError),
            ):
                fetch_street_photo(13.1391, 123.7438)

    def test_route_caches_per_saved_point_without_changing_farm(self):
        result = self.fetch([self.row()])
        before = self.client.get("/api/state").json["farm"]
        with patch("app.fetch_street_photo", return_value=result) as fetch:
            first = self.client.post("/api/location-photo", json={})
            second = self.client.post("/api/location-photo", json={})
            self.assertEqual(first.status_code, 200)
            self.assertTrue(second.json["cached"])
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(self.client.get("/api/state").json["farm"], before)
            self.client.post("/api/profile", json={**DEFAULT_FARM, "latitude": 13.1413})
            self.client.post("/api/location-photo", json={})
            self.assertEqual(fetch.call_count, 2)

    def test_caches_outages_briefly_and_does_not_claim_no_coverage(self):
        with patch("app.fetch_street_photo", side_effect=requests.Timeout) as fetch:
            first = self.client.post("/api/location-photo", json={})
            second = self.client.post("/api/location-photo", json={})
        self.assertTrue(first.json["unavailable"])
        self.assertIsNone(first.json["photo"])
        self.assertTrue(second.json["cached"])
        self.assertEqual(fetch.call_count, 1)
