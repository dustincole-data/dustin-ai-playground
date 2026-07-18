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


def build_spoken_script(feed: dict) -> str:
    """Turn every current story into a single-host natural-language rundown."""
    label = clean_spoken_text(feed.get("generatedLabel") or "today")
    parts = [
        f"Here is your complete morning briefing for {label}.",
        "I will move through every story on the site, explain what happened, and keep the useful part close.",
    ]
    story_number = 0

    for brief in feed.get("briefs") or []:
        articles = brief.get("articles") or []
        if not articles:
            continue
        section_name = SECTION_NAMES.get(brief.get("id"), clean_spoken_text(brief.get("id", "News")) or "News")
        parts.append(f"Now, {section_name}.")
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

    if story_number == 0:
        return f"There are no qualifying stories in the morning briefing for {label}."

    parts.append(
        "That is the full briefing for today. The written page has the source links and the deeper article cards if you want to dig into anything."
    )
    return "\n\n".join(parts)


def build_manifest(feed: dict, *, audio_url: str, transcript_url: str, duration_seconds: int) -> dict:
    article_count = sum(len(brief.get("articles") or []) for brief in feed.get("briefs") or [])
    return {
        "date": spoken_date(feed),
        "generatedAt": feed.get("generatedAt"),
        "generatedLabel": feed.get("generatedLabel") or spoken_date(feed),
        "audioUrl": audio_url,
        "transcriptUrl": transcript_url,
        "durationSeconds": duration_seconds,
        "articleCount": article_count,
        "voice": VOICE,
    }


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


async def synthesize(script: str, destination: Path) -> None:
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError(
            "edge-tts is not installed. Install it in the morning-brief TTS virtual environment before running this generator."
        ) from exc

    chunks = split_for_synthesis(script)
    if not chunks:
        raise RuntimeError("The spoken briefing was empty.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="morning-brief-tts-"))
    try:
        parts = [temp_dir / f"part-{index:03d}.mp3" for index in range(len(chunks))]
        await asyncio.wait_for(
            asyncio.gather(*(edge_tts.Communicate(chunk, voice=VOICE).save(str(part)) for chunk, part in zip(chunks, parts))),
            timeout=150,
        )
        concat_list = temp_dir / "concat.txt"
        concat_list.write_text("".join(f"file '{part}'\n" for part in parts), encoding="utf-8")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(destination)],
            check=True,
            text=True,
            capture_output=True,
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def audio_duration_seconds(audio_path: Path) -> int:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        check=True,
        text=True,
        capture_output=True,
    )
    return max(1, round(float(result.stdout.strip())))


def generate(feed: dict, *, audio_dir: Path, data_dir: Path) -> dict:
    date = spoken_date(feed)
    script = build_spoken_script(feed)
    audio_path = audio_dir / f"daily-brief-{date}.mp3"
    transcript_path = data_dir / f"daily-brief-{date}.txt"
    asyncio.run(synthesize(script, audio_path))
    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(script + "\n", encoding="utf-8")
    manifest = build_manifest(
        feed,
        audio_url=f"audio/{audio_path.name}",
        transcript_url=f"data/{transcript_path.name}",
        duration_seconds=audio_duration_seconds(audio_path),
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
