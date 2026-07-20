#!/usr/bin/env python3
"""Create the downloadable daily spoken edition for the morning briefing.

The script deliberately creates a new spoken rundown from the feed fields rather
than narrating the page markup. It uses Edge's neural voices via edge-tts, which
requires no API key or recurring subscription.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "public" / "data" / "morning-briefs.json"
DEFAULT_AUDIO_DIR = ROOT / "public" / "audio"
DEFAULT_DATA_DIR = ROOT / "public" / "data"
VOICE = "en-US-AvaMultilingualNeural"
DEFAULT_LISTENER_NAME = "Dustin"
SPEECH_RATE = "+3%"
SPEECH_PITCH = "-2Hz"
LOCAL_TZ = ZoneInfo("America/New_York")
SECTION_NAMES = {
    "ai": "AI",
    "energy": "Energy and Utilities",
    "humana": "Humana and Health Insurance",
    "kentucky_healthcare": "Kentucky Healthcare",
    "analytics": "Analytics",
    "louisville": "Louisville",
}
SECTION_TRANSITIONS = {
    "ai": "Let's start with {section}.",
    "energy": "All right, let's move to {section}.",
    "humana": "Next up: {section}.",
    "kentucky_healthcare": "Now for {section}.",
    "analytics": "A quick turn to {section}.",
    "louisville": "And finally, here's what is happening around {section}.",
}
STORY_LEADS = ("First up", "Also worth knowing", "One more thing here", "Next")
TAKEAWAY_LEADS = (
    "The part I would keep an eye on is this:",
    "What that means in practice:",
    "The useful takeaway:",
)
SOURCE_LEADS = ("This one comes from", "Reporting comes from", "The source here is")


def clean_spoken_text(value: str) -> str:
    """Remove web-only artifacts while preserving the source-backed meaning."""
    value = re.sub(r"https?://\S+", "", value or "")
    value = re.sub(r"\[[^\]]+\]\([^)]*\)", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def spoken_date(feed: dict) -> str:
    raw = feed.get("generatedAt")
    if raw:
        try:
            instant = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return instant.astimezone(LOCAL_TZ).date().isoformat()
        except ValueError:
            pass
    return datetime.now(LOCAL_TZ).date().isoformat()


def trim_explanatory_lead(value: str) -> str:
    """Remove feed boilerplate that sounds stiff after a spoken transition."""
    value = clean_spoken_text(value)
    value = re.sub(r"^(?:This matters because|The practical question is)\s+", "", value, flags=re.IGNORECASE)
    if not value:
        return ""
    return value[0].upper() + value[1:]


def category_transition(section_id: str, section_name: str, listener_name: str) -> str:
    template = SECTION_TRANSITIONS.get(section_id, "Next up: {section}.")
    return template.format(listener=listener_name, section=section_name)


def build_spoken_segments(feed: dict, *, listener_name: str = DEFAULT_LISTENER_NAME) -> list[dict]:
    """Build a personalized, chapter-aware episode from grounded feed context."""
    label = clean_spoken_text(feed.get("generatedLabel") or "today")
    segments = [{
        "text": "\n\n".join([
            f"{listener_name}, here's everything you need to know this morning.",
            f"This briefing was prepared for {label}. I'll walk you through what happened and why it matters, with a little extra context where it helps.",
        ])
    }]
    story_number = 0

    for brief in feed.get("briefs") or []:
        articles = brief.get("articles") or []
        if not articles:
            continue
        section_id = brief.get("id", "")
        section_name = SECTION_NAMES.get(section_id, clean_spoken_text(section_id or "News") or "News")
        parts = [category_transition(section_id, section_name, listener_name)]
        for article_index, article in enumerate(articles):
            story_number += 1
            title = clean_spoken_text(article.get("title", "This story"))
            summary = clean_spoken_text(article.get("summary", ""))
            why = trim_explanatory_lead(article.get("whyItMatters", ""))
            context = clean_spoken_text((article.get("learningPage") or {}).get("explanationText", ""))
            source = clean_spoken_text(article.get("sourceLabel", ""))
            lead = STORY_LEADS[article_index % len(STORY_LEADS)]
            item = f"{lead}, {title}."
            if summary:
                item += f" {summary}"
            if context:
                item += f" A little context here: {context}"
            if why:
                item += f" {TAKEAWAY_LEADS[article_index % len(TAKEAWAY_LEADS)]} {why}"
            if source:
                item += f" {SOURCE_LEADS[article_index % len(SOURCE_LEADS)]} {source}."
            parts.append(item)
        segments.append({
            "chapterId": brief.get("id"),
            "chapterTitle": section_name,
            "text": "\n\n".join(parts),
        })

    if story_number == 0:
        return [{"text": f"There are no qualifying stories in the morning briefing for {label}."}]

    segments.append({
        "text": "That is the full briefing for today. The written page has the source links and the deeper article cards if you want to dig into anything."
    })
    return segments


def build_spoken_script(feed: dict, *, listener_name: str = DEFAULT_LISTENER_NAME) -> str:
    """Turn every current story into a single-host natural-language rundown."""
    return "\n\n".join(
        segment["text"] for segment in build_spoken_segments(feed, listener_name=listener_name)
    )


def build_manifest(
    feed: dict,
    *,
    audio_url: str,
    transcript_url: str,
    duration_seconds: int,
    chapters: list[dict] | None = None,
    listener_name: str = DEFAULT_LISTENER_NAME,
) -> dict:
    article_count = sum(len(brief.get("articles") or []) for brief in feed.get("briefs") or [])
    manifest = {
        "date": spoken_date(feed),
        "generatedAt": feed.get("generatedAt"),
        "generatedLabel": feed.get("generatedLabel") or spoken_date(feed),
        "audioUrl": audio_url,
        "transcriptUrl": transcript_url,
        "durationSeconds": duration_seconds,
        "articleCount": article_count,
        "voice": VOICE,
        "listenerName": listener_name,
        "narrationStyle": "personalized-conversational",
    }
    if chapters:
        manifest["chapters"] = chapters
    return manifest


def split_for_synthesis(text: str, *, max_characters: int = 2_500) -> list[str]:
    """Split a long episode into sentence-boundary chunks for parallel TTS."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) > max_characters:
            words = sentence.split()
            for word in words:
                if current and len(current) + 1 + len(word) > max_characters:
                    chunks.append(current)
                    current = ""
                current = f"{current} {word}".strip()
            continue
        if current and len(current) + 1 + len(sentence) > max_characters:
            chunks.append(current)
            current = ""
        current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current)
    return chunks


def plan_synthesis_chunks(segments: list[dict], *, max_characters: int = 2_500) -> list[dict]:
    """Split segments for TTS while retaining the first chunk of every topic."""
    plan: list[dict] = []
    for segment in segments:
        chunks = split_for_synthesis(segment.get("text", ""), max_characters=max_characters)
        for index, chunk in enumerate(chunks):
            plan.append({
                "text": chunk,
                "chapterId": segment.get("chapterId"),
                "chapterTitle": segment.get("chapterTitle"),
                "chapterStart": bool(segment.get("chapterId")) and index == 0,
            })
    return plan


def is_complete_audio_part(path: Path, expected_text: str = "") -> bool:
    """Return true when Edge wrote a plausibly complete playable chunk."""
    if not path.exists() or path.stat().st_size <= 0:
        return False
    try:
        duration = audio_duration(path)
        minimum_duration = max(0.5, len(expected_text) / 26)
        return duration >= minimum_duration
    except (OSError, ValueError, subprocess.SubprocessError):
        return False


async def save_tts_parts(
    plan: list[dict],
    parts: list[Path],
    communicate_factory,
    *,
    max_concurrency: int = 1,
    max_attempts: int = 3,
    request_timeout: float = 150,
    inter_request_delay: float = 2.5,
    completed_part=None,
) -> None:
    """Save TTS chunks serially by default so Edge does not stall the batch."""
    semaphore = asyncio.Semaphore(max(1, max_concurrency))
    completed_part = completed_part or is_complete_audio_part

    async def save_one(item: dict, part: Path) -> None:
        for attempt in range(1, max_attempts + 1):
            try:
                async with semaphore:
                    try:
                        request = communicate_factory(
                            item["text"],
                            voice=VOICE,
                            rate=SPEECH_RATE,
                            pitch=SPEECH_PITCH,
                        ).save(str(part))
                        await asyncio.wait_for(request, timeout=request_timeout)
                    finally:
                        if inter_request_delay > 0:
                            await asyncio.sleep(inter_request_delay)
                return
            except Exception:
                if completed_part(part, item["text"]):
                    return
                if attempt >= max_attempts:
                    raise
                await asyncio.sleep(attempt * 1.25)

    await asyncio.gather(*(save_one(item, part) for item, part in zip(plan, parts)))


async def synthesize_segments(segments: list[dict], destination: Path) -> list[dict]:
    """Synthesize chapter-aware chunks and return measured topic offsets."""
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError(
            "edge-tts is not installed. Install it in the morning-brief TTS virtual environment before running this generator."
        ) from exc

    plan = plan_synthesis_chunks(segments)
    if not plan:
        raise RuntimeError("The spoken briefing was empty.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="morning-brief-tts-"))
    try:
        parts = [temp_dir / f"part-{index:03d}.mp3" for index in range(len(plan))]
        await save_tts_parts(plan, parts, edge_tts.Communicate)

        chapters: list[dict] = []
        elapsed = 0.0
        for item, part in zip(plan, parts):
            if item["chapterStart"]:
                chapters.append({
                    "id": item["chapterId"],
                    "title": item["chapterTitle"],
                    "startSeconds": round(elapsed, 1),
                })
            elapsed += audio_duration(part)

        concat_list = temp_dir / "concat.txt"
        concat_list.write_text("".join(f"file '{part}'\n" for part in parts), encoding="utf-8")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(destination)],
            check=True,
            text=True,
            capture_output=True,
        )
        return chapters
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


async def synthesize(script: str, destination: Path) -> None:
    """Backward-compatible synthesis entry point for callers without chapters."""
    await synthesize_segments([{"text": script}], destination)


def audio_duration(audio_path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        check=True,
        text=True,
        capture_output=True,
    )
    return max(0.0, float(result.stdout.strip()))


def audio_duration_seconds(audio_path: Path) -> int:
    return max(1, round(audio_duration(audio_path)))


def versioned_audio_url(audio_path: Path) -> str:
    """Cache-bust same-day audio revisions using the generated file content."""
    with audio_path.open("rb") as audio_file:
        revision = hashlib.file_digest(audio_file, "sha256").hexdigest()[:12]
    return f"audio/{audio_path.name}?v={revision}"


def generate(
    feed: dict,
    *,
    audio_dir: Path,
    data_dir: Path,
    listener_name: str = DEFAULT_LISTENER_NAME,
) -> dict:
    date = spoken_date(feed)
    segments = build_spoken_segments(feed, listener_name=listener_name)
    script = "\n\n".join(segment["text"] for segment in segments)
    audio_path = audio_dir / f"daily-brief-{date}.mp3"
    transcript_path = data_dir / f"daily-brief-{date}.txt"
    chapters = asyncio.run(synthesize_segments(segments, audio_path))
    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(script + "\n", encoding="utf-8")
    manifest = build_manifest(
        feed,
        audio_url=versioned_audio_url(audio_path),
        transcript_url=f"data/{transcript_path.name}",
        duration_seconds=audio_duration_seconds(audio_path),
        chapters=chapters,
        listener_name=listener_name,
    )
    (data_dir / "daily-podcast.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the daily MP3 spoken edition from morning-briefs.json.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--listener-name", default=DEFAULT_LISTENER_NAME)
    args = parser.parse_args()

    feed = json.loads(args.input.read_text(encoding="utf-8"))
    manifest = generate(
        feed,
        audio_dir=args.audio_dir,
        data_dir=args.data_dir,
        listener_name=args.listener_name.strip() or DEFAULT_LISTENER_NAME,
    )
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
