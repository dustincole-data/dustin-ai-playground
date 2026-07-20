#!/usr/bin/env python3
"""Create the downloadable daily spoken edition for the morning briefing.

The script deliberately creates a new spoken rundown from the feed fields rather
than narrating the page markup. It uses Edge's neural voices via edge-tts, which
requires no API key or recurring subscription.
"""

from __future__ import annotations

import argparse
import asyncio
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
LOCAL_TZ = ZoneInfo("America/New_York")
SECTION_NAMES = {
    "ai": "AI",
    "energy": "Energy and Utilities",
    "humana": "Humana and Health Insurance",
    "kentucky_healthcare": "Kentucky Healthcare",
    "analytics": "Analytics",
    "louisville": "Louisville",
}


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


def build_spoken_segments(feed: dict) -> list[dict]:
    """Build the episode as chapter-aware segments without changing its spoken copy."""
    label = clean_spoken_text(feed.get("generatedLabel") or "today")
    segments = [{
        "text": "\n\n".join([
            f"Here is your complete morning briefing for {label}.",
            "I will move through every story on the site, explain what happened, and keep the useful part close.",
        ])
    }]
    story_number = 0

    for brief in feed.get("briefs") or []:
        articles = brief.get("articles") or []
        if not articles:
            continue
        section_name = SECTION_NAMES.get(brief.get("id"), clean_spoken_text(brief.get("id", "News")) or "News")
        parts = [f"Now, {section_name}."]
        for article in articles:
            story_number += 1
            title = clean_spoken_text(article.get("title", "This story"))
            summary = clean_spoken_text(article.get("summary", ""))
            why = clean_spoken_text(article.get("whyItMatters", ""))
            source = clean_spoken_text(article.get("sourceLabel", ""))
            lead = "First" if story_number == 1 else "Next"
            item = f"{lead}, {title}."
            if summary:
                item += f" Here is the rundown. {summary}"
            if why:
                item += f" The practical takeaway: {why}"
            if source:
                item += f" This was reported by {source}."
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


def build_spoken_script(feed: dict) -> str:
    """Turn every current story into a single-host natural-language rundown."""
    return "\n\n".join(segment["text"] for segment in build_spoken_segments(feed))


def build_manifest(
    feed: dict,
    *,
    audio_url: str,
    transcript_url: str,
    duration_seconds: int,
    chapters: list[dict] | None = None,
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
        await asyncio.wait_for(
            asyncio.gather(*(edge_tts.Communicate(item["text"], voice=VOICE).save(str(part)) for item, part in zip(plan, parts))),
            timeout=150,
        )

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


def generate(feed: dict, *, audio_dir: Path, data_dir: Path) -> dict:
    date = spoken_date(feed)
    segments = build_spoken_segments(feed)
    script = "\n\n".join(segment["text"] for segment in segments)
    audio_path = audio_dir / f"daily-brief-{date}.mp3"
    transcript_path = data_dir / f"daily-brief-{date}.txt"
    chapters = asyncio.run(synthesize_segments(segments, audio_path))
    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(script + "\n", encoding="utf-8")
    manifest = build_manifest(
        feed,
        audio_url=f"audio/{audio_path.name}",
        transcript_url=f"data/{transcript_path.name}",
        duration_seconds=audio_duration_seconds(audio_path),
        chapters=chapters,
    )
    (data_dir / "daily-podcast.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the daily MP3 spoken edition from morning-briefs.json.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    feed = json.loads(args.input.read_text(encoding="utf-8"))
    manifest = generate(feed, audio_dir=args.audio_dir, data_dir=args.data_dir)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
