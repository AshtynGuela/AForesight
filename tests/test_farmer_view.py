import unittest
from datetime import datetime, timezone
from app import DEFAULT_FARM
from advice import suggested_actions


class FarmerViewTests(unittest.TestCase):
    def weather(self, rain=25):
        return {
            "source": "test reference",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "days": [
                {"date": f"2026-10-{i:02d}", "rain": rain, "temp": 28, "et0": 4}
                for i in range(1, 8)
            ],
        }

    def test_stage_changes_field_checks(self):
        young = suggested_actions({**DEFAULT_FARM, "crop_stage": "establishment"}, None)
        harvest = suggested_actions({**DEFAULT_FARM, "crop_stage": "maturity"}, None)
        self.assertTrue(any("newly planted" in a["title"] for a in young))
        self.assertFalse(any("newly planted" in a["title"] for a in harvest))
        self.assertTrue(any("harvest" in a["title"] for a in harvest))

    def test_corn_wet_weather_and_flowering_are_distinct_checks(self):
        actions = suggested_actions(
            {**DEFAULT_FARM, "crop": "corn", "crop_stage": "flowering"},
            self.weather(),
            allow_past=True,
        )
        self.assertTrue(any("flowering corn" in a["title"] for a in actions))
        self.assertTrue(any("standing around roots" in a["title"] for a in actions))
        self.assertTrue(all(a.get("reference") and a.get("context") for a in actions))

    def test_synthetic_weather_never_triggers_drainage_advice(self):
        actions = suggested_actions(
            {**DEFAULT_FARM, "crop": "mungbean"},
            {**self.weather(), "demo": True},
            allow_past=True,
        )
        self.assertFalse(any("standing around roots" in a["title"] for a in actions))
