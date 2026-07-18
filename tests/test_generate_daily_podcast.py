import importlib.util
import sys
import unittest
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT / "scripts" / "generate_daily_podcast.py"


def load_module():
    spec = importlib.util.spec_from_file_location("daily_podcast", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class DailyPodcastFeatureTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.feed = {
            "generatedAt": "2026-07-18T09:00:00+00:00",
            "generatedLabel": "Jul 18, 5:00 AM ET",
            "briefs": [
                {
                    "id": "ai",
                    "articles": [
                        {
                            "title": "A new agent workflow reaches developers",
                            "summary": "The tool adds approval gates before an agent can use production systems.",
                            "whyItMatters": "That turns a demo into something an operator can review and trust.",
                            "sourceUrl": "https://example.com/ai",
                        }
                    ],
                },
                {
                    "id": "energy",
                    "articles": [
                        {
                            "title": "Utility planning shifts around data-center demand",
                            "summary": "The utility is studying grid upgrades for a large new load.",
                            "whyItMatters": "The practical question is who pays for the new capacity.",
                            "sourceUrl": "https://example.com/energy",
                        }
                    ],
                },
            ],
        }

    def test_build_spoken_script_covers_each_article_without_urls(self):
        script = self.module.build_spoken_script(self.feed)

        self.assertIn("A new agent workflow reaches developers", script)
        self.assertIn("Utility planning shifts around data-center demand", script)
        self.assertIn("That turns a demo into something an operator can review and trust", script)
        self.assertNotIn("https://", script)
        self.assertIn("AI", script)
        self.assertIn("Energy and Utilities", script)

    def test_split_for_synthesis_keeps_every_sentence_within_provider_sized_chunks(self):
        text = " ".join([f"Sentence {number}." for number in range(1, 600)])

        chunks = self.module.split_for_synthesis(text, max_characters=500)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 500 for chunk in chunks))
        self.assertEqual(" ".join(chunks).replace("  ", " "), text)

    def test_build_manifest_points_to_current_audio_and_transcript(self):
        manifest = self.module.build_manifest(
            self.feed,
            audio_url="audio/daily-brief-2026-07-18.mp3",
            transcript_url="data/daily-brief-2026-07-18.txt",
            duration_seconds=123,
        )

        self.assertEqual(manifest["audioUrl"], "audio/daily-brief-2026-07-18.mp3")
        self.assertEqual(manifest["transcriptUrl"], "data/daily-brief-2026-07-18.txt")
        self.assertEqual(manifest["durationSeconds"], 123)
        self.assertEqual(manifest["articleCount"], 2)
        self.assertEqual(manifest["generatedLabel"], "Jul 18, 5:00 AM ET")


if __name__ == "__main__":
    unittest.main()
