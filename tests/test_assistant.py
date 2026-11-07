import tempfile

import unittest

import uuid

from pathlib import Path

from app import create_app


class AssistantTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1] / "instance" / "tests"

        root.mkdir(parents=True, exist_ok=True)

        self.tmp = tempfile.TemporaryDirectory(dir=root)

        self.client = create_app(Path(self.tmp.name) / "test.sqlite3").test_client()

        self.session = str(uuid.uuid4())

    def tearDown(self):
        self.tmp.cleanup()

    def chat(self, text):
        response = self.client.post(
            "/api/chat",
            json={
                "session": self.session,
                "message": text,
                "confirmation_id": getattr(self, "confirmation", None),
            },
        )

        if response.json.get("confirmation_id"):
            self.confirmation = response.json["confirmation_id"]

        return response

    def test_crop_requires_confirmation(self):
        self.assertEqual(self.chat("my crop is corn").json["target_field"], "crop")

        self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

        saved = self.chat("Save this").json

        self.assertTrue(saved["changed"])

        self.assertEqual(saved["updated_fields"], {"crop": "corn"})

        self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "corn")

    def test_cancel(self):
        self.chat("newly planted")
        self.chat("Cancel")
        self.chat("Save this")

        self.assertEqual(
            self.client.get("/api/state").json["farm"]["crop_stage"], "unknown"
        )

    def test_note_retry_does_not_duplicate(self):
        self.chat("Save a note")
        wording = "I added fertilizer to the rice field."
        r = self.chat(wording)

        self.assertIn("Save this", r.json["choices"])

        self.chat("Save this")
        self.chat("Save this")

        notes = self.client.get("/api/state").json["journals"]
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["technique"], wording)
        self.assertEqual(notes[0]["note"], wording)

    def test_drainage_conversation(self):
        self.assertIn("Drains well", self.chat("Choose a crop").json["choices"])

        self.assertIn("sources", self.chat("Drains well").json)

    def test_simulation_removed(self):
        self.assertEqual(self.client.post("/api/simulate", json={}).status_code, 404)

    def test_invalid_session(self):
        self.assertEqual(
            self.client.post(
                "/api/chat", json={"session": "x", "message": "hello"}
            ).status_code,
            400,
        )

    def test_wrong_confirmation_cannot_write(self):
        self.chat("my crop is corn")

        self.confirmation = "wrong"

        self.chat("Save this")

        self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

    def test_conversation_remembers_without_writing(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch("assistant_chat.understand") as understand,
        ):
            understand.return_value = {
                "intent": "chat",
                "value": "What are you growing?",
            }

            self.assertEqual(self.chat("Hello").json["text"], "What are you growing?")

            understand.return_value = {
                "intent": "chat",
                "value": "Rice likes different water management at each stage.",
            }

            self.chat("Can you explain that?")

            kwargs = understand.call_args.kwargs

            self.assertTrue(
                any(turn["content"] == "Hello" for turn in kwargs["history"])
            )

            self.assertEqual(kwargs["context"]["farm"]["crop"], "rice")

            self.assertNotIn("journals", kwargs["context"])

            self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

    def test_conversational_change_still_requires_confirmation(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={"intent": "crop", "value": "corn"},
            ),
        ):
            response = self.chat("Switch it to maize please").json

            self.assertIn("Save this", response["choices"])

            self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

            self.assertEqual(
                self.chat("Save this").json["text"], "Saved your farm changes."
            )

            self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "corn")

    def test_history_and_reset_clear_pending_but_keep_farm(self):
        self.chat("my crop is corn")

        history = self.client.get(
            "/api/chat/history", query_string={"session": self.session}
        ).json["messages"]

        self.assertEqual(history[0]["text"], "my crop is corn")

        self.assertIn("confirmation_id", history[-1])

        self.client.post("/api/chat/reset", json={"session": self.session})

        self.assertEqual(
            self.client.get(
                "/api/chat/history", query_string={"session": self.session}
            ).json["messages"],
            [],
        )

        self.chat("Save this")

        self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

    def test_natural_confirmation_does_not_save_automatically(self):
        from unittest.mock import patch

        self.chat("my crop is corn")

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={"intent": "confirm", "value": ""},
            ),
        ):
            response = self.chat("yes please").json

            self.assertIn("Save this", response["choices"])

            self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

    def test_natural_cancel_clears_pending(self):
        from unittest.mock import patch

        self.chat("my crop is corn")

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={"intent": "cancel", "value": ""},
            ),
        ):
            self.chat("never mind")

        self.assertNotIn("changed", self.chat("Save this").json)

    def test_drainage_is_remembered(self):
        self.chat("Choose a crop")
        self.chat("Drains well")

        response = self.chat("Choose a crop").json

        self.assertIn("sources", response)

        self.assertNotIn("Drains well", response["choices"])

    def test_context_carries_options_for_followup(self):
        from unittest.mock import patch

        self.chat("Choose a crop")
        self.chat("Drains well")

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={
                    "intent": "chat",
                    "value": "Let’s compare those options.",
                },
            ) as understand,
        ):
            self.chat("Why that one?")

            self.assertTrue(understand.call_args.kwargs["context"]["crop_options"])

            self.assertEqual(understand.call_args.kwargs["context"]["drainage"], "good")

    def test_multiple_profile_edits_and_correction(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch("assistant_chat.understand") as understand,
        ):
            understand.return_value = {
                "intent": "profile",
                "value": '{"area":2,"crop":"corn","ph":6.2}',
            }
            first = self.chat("Set area to 2 hectares, corn, pH 6.2").json
            self.assertIn("Save this", first["choices"])
            understand.return_value = {"intent": "profile", "value": '{"area":3}'}
            corrected = self.chat("Actually 3 hectares").json
            self.assertIn("corn", corrected["text"])
            self.assertNotEqual(first["confirmation_id"], corrected["confirmation_id"])
            saved = self.chat("Save this").json
            self.assertEqual(
                saved["updated_fields"], {"area": 3.0, "crop": "corn", "ph": 6.2}
            )
            self.assertEqual(self.client.get("/api/state").json["farm"]["area"], 3.0)

    def test_invalid_profile_and_location_do_not_write(self):
        from unittest.mock import patch

        for value in ['{"area":-2}', '{"ph":99}', '{"latitude":13.5}']:
            with (
                patch("assistant_chat.ai_enabled", return_value=True),
                patch(
                    "assistant_chat.understand",
                    return_value={"intent": "profile", "value": value},
                ),
            ):
                response = self.chat("Change the farm").json
                self.assertNotIn("confirmation_id", response)
                self.assertNotIn("Save this", response["choices"])

    def test_narration_failure_keeps_real_result(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                side_effect=[{"intent": "farm", "value": ""}, ValueError("Quota")],
            ),
        ):
            result = self.chat("Tell me about my farm").json
            self.assertIn("rice", result["text"])
            self.assertEqual(result["open_page"], "farm")

    def test_narration_cannot_execute_an_edit(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                side_effect=[
                    {"intent": "farm", "value": ""},
                    {"intent": "profile", "value": '{"crop":"corn"}'},
                ],
            ),
        ):
            self.chat("Tell me about my farm")
            self.assertEqual(self.client.get("/api/state").json["farm"]["crop"], "rice")

    def test_navigation_is_allowlisted(self):
        from unittest.mock import patch

        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={"intent": "navigate", "value": "farm"},
            ),
        ):
            self.assertEqual(self.chat("Open my farm").json["navigate"], "farm")
        with (
            patch("assistant_chat.ai_enabled", return_value=True),
            patch(
                "assistant_chat.understand",
                return_value={"intent": "navigate", "value": "https://example.com"},
            ),
        ):
            self.assertNotIn("navigate", self.chat("Open something").json)
