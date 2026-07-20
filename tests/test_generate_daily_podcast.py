import asyncio
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
                            "sourceLabel": "Example AI News",
                            "learningPage": {
                                "explanationText": "Approval gates require a person to authorize sensitive actions before the agent continues."
                            },
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

    def test_spoken_intro_addresses_dustin_and_sets_a_natural_tone(self):
        script = self.module.build_spoken_script(self.feed)

        self.assertTrue(script.startswith("Dustin, here's everything you need to know this morning."))
        self.assertIn("I'll walk you through what happened and why it matters", script)

    def test_spoken_category_transitions_use_dustins_name_without_rigid_page_copy(self):
        segments = self.module.build_spoken_segments(self.feed)
        topic_segments = [segment for segment in segments if segment.get("chapterId")]
        spoken_topics = "\n".join(segment["text"] for segment in topic_segments)

        self.assertTrue(all("Dustin" in segment["text"].split("\n\n", 1)[0] for segment in topic_segments))
        self.assertNotIn("Now, AI.", topic_segments[0]["text"])
        self.assertNotIn("Here is the rundown", spoken_topics)
        self.assertNotIn("The practical takeaway", spoken_topics)

    def test_spoken_story_uses_grounded_explanatory_context(self):
        script = self.module.build_spoken_script(self.feed)

        self.assertIn(
            "Approval gates require a person to authorize sensitive actions before the agent continues.",
            script,
        )
        self.assertIn("That turns a demo into something an operator can review and trust.", script)

    def test_listener_name_can_be_changed_without_rewriting_the_episode(self):
        script = self.module.build_spoken_script(self.feed, listener_name="Alex")

        self.assertTrue(script.startswith("Alex, here's everything you need to know this morning."))
        self.assertNotIn("Dustin", script)

    def test_split_for_synthesis_keeps_every_sentence_within_provider_sized_chunks(self):
        text = " ".join([f"Sentence {number}." for number in range(1, 600)])

        chunks = self.module.split_for_synthesis(text, max_characters=500)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 500 for chunk in chunks))
        self.assertEqual(" ".join(chunks).replace("  ", " "), text)

    def test_build_spoken_segments_creates_chapters_for_nonempty_topics(self):
        segments = self.module.build_spoken_segments(self.feed)

        topic_segments = [segment for segment in segments if segment.get("chapterId")]
        self.assertEqual([segment["chapterId"] for segment in topic_segments], ["ai", "energy"])
        self.assertEqual([segment["chapterTitle"] for segment in topic_segments], ["AI", "Energy and Utilities"])
        self.assertTrue(topic_segments[0]["text"].startswith("Dustin, let's start with AI."))

    def test_plan_synthesis_chunks_preserves_topic_boundaries(self):
        segments = self.module.build_spoken_segments(self.feed)
        chunks = self.module.plan_synthesis_chunks(segments, max_characters=90)

        ai_chunks = [chunk for chunk in chunks if chunk.get("chapterId") == "ai"]
        energy_chunks = [chunk for chunk in chunks if chunk.get("chapterId") == "energy"]
        self.assertGreater(len(ai_chunks), 1)
        self.assertGreater(len(energy_chunks), 1)
        self.assertTrue(ai_chunks[0]["chapterStart"])
        self.assertFalse(any(chunk["chapterStart"] for chunk in ai_chunks[1:]))
        self.assertTrue(energy_chunks[0]["chapterStart"])

    def test_synthesis_serializes_edge_requests_to_avoid_provider_stalls(self):
        active = 0
        highest = 0
        calls = []

        class FakeCommunicate:
            def __init__(self, text, **kwargs):
                self.text = text
                self.kwargs = kwargs

            async def save(self, destination):
                nonlocal active, highest
                active += 1
                highest = max(highest, active)
                calls.append((self.text, destination, self.kwargs))
                await asyncio.sleep(0.01)
                active -= 1

        plan = [{"text": f"Chunk {index}."} for index in range(8)]
        parts = [Path(f"/tmp/part-{index}.mp3") for index in range(8)]

        asyncio.run(self.module.save_tts_parts(
            plan, parts, FakeCommunicate, max_concurrency=1, inter_request_delay=0
        ))

        self.assertEqual(len(calls), 8)
        self.assertEqual(highest, 1)

    def test_synthesis_paces_requests_to_avoid_edge_rate_limits(self):
        starts = []

        class FastCommunicate:
            def __init__(self, text, **kwargs):
                pass

            async def save(self, destination):
                starts.append(asyncio.get_running_loop().time())

        asyncio.run(self.module.save_tts_parts(
            [{"text": f"Chunk {index}."} for index in range(3)],
            [Path(f"/tmp/paced-{index}.mp3") for index in range(3)],
            FastCommunicate,
            inter_request_delay=0.01,
        ))

        self.assertGreaterEqual(starts[1] - starts[0], 0.009)
        self.assertGreaterEqual(starts[2] - starts[1], 0.009)

    def test_synthesis_accepts_a_complete_audio_file_when_edge_hangs_after_writing(self):
        attempts = 0
        destination = Path("/tmp/complete-after-timeout.mp3")
        destination.unlink(missing_ok=True)

        class WritesThenHangs:
            def __init__(self, text, **kwargs):
                pass

            async def save(self, output):
                nonlocal attempts
                attempts += 1
                Path(output).write_bytes(b"complete audio")
                await asyncio.sleep(0.05)

        asyncio.run(self.module.save_tts_parts(
            [{"text": "A completed chunk."}],
            [destination],
            WritesThenHangs,
            request_timeout=0.01,
            max_attempts=3,
            inter_request_delay=0,
            completed_part=lambda path: path.stat().st_size > 0,
        ))

        self.assertEqual(attempts, 1)
        destination.unlink(missing_ok=True)

    def test_synthesis_retries_a_stalled_edge_request(self):
        attempts = 0

        class SometimesStalls:
            def __init__(self, text, **kwargs):
                pass

            async def save(self, destination):
                nonlocal attempts
                attempts += 1
                if attempts == 1:
                    await asyncio.sleep(0.05)

        asyncio.run(self.module.save_tts_parts(
            [{"text": "A chunk."}],
            [Path("/tmp/retry.mp3")],
            SometimesStalls,
            request_timeout=0.01,
            max_attempts=2,
            inter_request_delay=0,
        ))

        self.assertEqual(attempts, 2)

    def test_build_manifest_points_to_current_audio_and_transcript(self):
        manifest = self.module.build_manifest(
            self.feed,
            audio_url="audio/daily-brief-2026-07-18.mp3",
            transcript_url="data/daily-brief-2026-07-18.txt",
            duration_seconds=123,
            chapters=[{"id": "ai", "title": "AI", "startSeconds": 12}],
        )

        self.assertEqual(manifest["audioUrl"], "audio/daily-brief-2026-07-18.mp3")
        self.assertEqual(manifest["transcriptUrl"], "data/daily-brief-2026-07-18.txt")
        self.assertEqual(manifest["durationSeconds"], 123)
        self.assertEqual(manifest["articleCount"], 2)
        self.assertEqual(manifest["generatedLabel"], "Jul 18, 5:00 AM ET")
        self.assertEqual(manifest["listenerName"], "Dustin")
        self.assertEqual(manifest["narrationStyle"], "personalized-conversational")
        self.assertEqual(manifest["chapters"][0], {"id": "ai", "title": "AI", "startSeconds": 12})


if __name__ == "__main__":
    unittest.main()
