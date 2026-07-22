#!/usr/bin/env python3
"""Generate DustinColeData Morning Briefs from free RSS/Google News feeds.

Outputs public/data/morning-briefs.json. Only dated, source-linked items from
the last LOOKBACK_HOURS are treated as news. If an OpenAI key is available
(OPENAI_API_KEY env or ~/.openai/api_key), summaries, why-it-matters lines,
glossaries, and learning pages are written by an LLM (gpt-5.4-mini by default);
without a key the script falls back to the original template text.
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

LOOKBACK_HOURS = int(os.environ.get("MORNING_BRIEF_LOOKBACK_HOURS", "24"))
MAX_ITEMS_PER_BRIEF = int(os.environ.get("MORNING_BRIEF_MAX_ITEMS", "5"))
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "morning-briefs.json"
AI_BRIEF_OUTPUT_DIR = Path("/home/hermes/.hermes/cron/output/70407e2b6f3b")
# A vetted Daily AI Briefing older than this is treated as stale and the AI
# section falls back to the trusted-source RSS track instead of re-serving it.
AI_BRIEF_MAX_AGE_HOURS = int(os.environ.get("MORNING_BRIEF_AI_MAX_AGE_HOURS", "36"))
USER_AGENT = "Mozilla/5.0 (compatible; DustinColeDataMorningBrief/1.0; +https://dustincoledata.com)"

# Optional LLM enrichment (summaries, why-it-matters, glossary, learning page).
# Key discovery: env var first, then the local key file. If neither exists the
# script degrades to the original template-based text, so the cron never breaks.
OPENAI_MODEL = os.environ.get("MORNING_BRIEF_LLM_MODEL", "gpt-5.4-mini")


def load_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    key_file = Path.home() / ".openai" / "api_key"
    try:
        if key_file.exists():
            return key_file.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return ""


OPENAI_KEY = load_openai_key()
LLM_STATS = {"ok": 0, "fail": 0}

NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(hours=LOOKBACK_HOURS)
LOCAL_TZ = ZoneInfo("America/New_York")

GOOGLE_NEWS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

BRIEFS = [
    {
        "id": "ai",
        "name": "AI",
        "headline": "AI Brief",
        # The AI section leads with the vetted Daily AI Briefing output when it
        # is fresh, then tops up from this trusted-source RSS track so the
        # section never goes stale if the briefing cron misses a day.
        "queries": [
            '(OpenAI OR Anthropic OR "Google DeepMind" OR Claude OR Gemini OR ChatGPT) (model OR launch OR release OR agent OR update OR pricing) when:1d',
            '("AI agent" OR "AI agents" OR agentic OR "enterprise AI" OR "AI coding") (workflow OR tool OR platform OR enterprise OR developer) when:1d',
            '("artificial intelligence" OR "generative AI") (regulation OR policy OR analytics OR governance OR adoption) when:1d',
        ],
        "fallbackQueries": [
            '(OpenAI OR Anthropic OR "Google DeepMind" OR Claude OR Gemini OR ChatGPT) (model OR launch OR release OR agent) when:7d',
            '("AI agent" OR agentic OR "enterprise AI") when:7d',
        ],
    },
    {
        "id": "energy",
        "name": "Energy / Utilities",
        "headline": "Morning Energy Brief",
        "queries": [
            '("LG&E" OR "Louisville Gas and Electric" OR "Kentucky Utilities" OR "PPL") (utility OR utilities OR power OR electricity OR rates OR grid) when:1d',
            '("LG&E" OR "Kentucky Utilities" OR "PPL") ("data center" OR "data centers" OR "AI load" OR "power demand") when:1d',
            '("Kentucky" "data center" utility power rates) when:1d',
            '("PPL" "Kentucky" "Public Service Commission") when:1d',
            '(site:wdrb.com OR site:wuky.org OR site:wfpl.org OR site:kentuckylantern.com OR site:utilitydive.com) (Kentucky utility OR data center OR LG&E OR PPL) when:1d',
        ],
        "fallbackQueries": [
            '("LG&E" OR "Louisville Gas and Electric" OR "Kentucky Utilities" OR "PPL") (utility OR utilities OR power OR electricity OR rates OR grid) when:7d',
            '("LG&E" OR "Kentucky Utilities" OR "PPL") ("data center" OR "power demand") when:7d',
        ],
    },
    {
        "id": "humana",
        "name": "Humana / Health Insurance",
        "headline": "Humana / Health Insurance",
        "queries": [
            '(Humana OR "Humana Inc") (health insurance OR Medicare Advantage OR Medicaid OR insurer OR CMS OR claims OR pharmacy) when:1d',
            '(Humana OR "Humana Inc") (earnings OR guidance OR enrollment OR prior authorization OR value-based care) when:1d',
        ],
        "fallbackQueries": [
            '(Humana OR "Humana Inc") (health insurance OR Medicare Advantage OR Medicaid OR insurer OR CMS OR claims OR pharmacy) when:7d',
            '(Humana OR "Humana Inc") (earnings OR guidance OR enrollment OR prior authorization OR value-based care) when:7d',
        ],
        "broadFallbackQueries": [
            '("US health insurance" OR "health insurers" OR "Medicare Advantage" OR Medicaid OR CMS) (prior authorization OR rates OR enrollment OR claims OR pharmacy) when:1d',
            '("US health insurance" OR "health insurers" OR "Medicare Advantage" OR Medicaid OR CMS) (prior authorization OR rates OR enrollment OR claims OR pharmacy) when:7d',
        ],
        "primaryTerms": ["humana", "humana inc"],
    },
    {
        "id": "kentucky_healthcare",
        "name": "Kentucky Healthcare / US Healthcare",
        "headline": "Kentucky Healthcare",
        "queries": [
            '(Kentucky healthcare OR "Kentucky health care" OR "Kentucky hospitals" OR "Kentucky Medicaid" OR "Louisville healthcare") when:1d',
            '(Kentucky hospital OR "University of Kentucky healthcare" OR "UofL Health" OR Baptist Health Kentucky OR Norton Healthcare) when:1d',
        ],
        "fallbackQueries": [
            '(Kentucky healthcare OR "Kentucky health care" OR "Kentucky hospitals" OR "Kentucky Medicaid" OR "Louisville healthcare") when:7d',
            '(Kentucky hospital OR "University of Kentucky healthcare" OR "UofL Health" OR Baptist Health Kentucky OR Norton Healthcare) when:7d',
        ],
        "broadFallbackQueries": [
            '("US healthcare" OR "US health care" OR hospitals OR Medicaid OR Medicare) (policy OR funding OR workforce OR access OR costs) when:1d',
            '("US healthcare" OR "US health care" OR hospitals OR Medicaid OR Medicare) (policy OR funding OR workforce OR access OR costs) when:7d',
        ],
        "primaryTerms": ["kentucky", "louisville", "uofl", "norton healthcare", "baptist health", "uk healthcare", "university of kentucky"],
    },
    {
        "id": "analytics",
        "name": "Analytics",
        "headline": "Analytics Brief",
        "queries": [
            '(business analytics OR data analytics OR "Power BI" OR Tableau OR Snowflake OR Databricks OR "data governance" OR "data platform") when:1d',
            '(analytics dashboard OR BI reporting OR "data quality" OR "data warehouse" OR "lakehouse") when:1d',
        ],
        "fallbackQueries": [
            '(business analytics OR data analytics OR "Power BI" OR Tableau OR Snowflake OR Databricks OR "data governance" OR "data platform") when:7d',
            '(analytics dashboard OR BI reporting OR "data quality" OR "data warehouse" OR "lakehouse") when:7d',
        ],
    },
    {
        "id": "louisville",
        "name": "Louisville, Kentucky",
        "headline": "Louisville Brief",
        "queries": [
            '(Louisville Kentucky OR "Louisville Metro" OR "Jefferson County Kentucky") (business OR development OR health OR data center OR utility OR politics OR economy) when:1d',
            '(site:wdrb.com OR site:wfpl.org OR site:courier-journal.com OR site:louisvillepublicmedia.org) Louisville Kentucky when:1d',
        ],
        "fallbackQueries": [
            '(Louisville Kentucky OR "Louisville Metro" OR "Jefferson County Kentucky") (business OR development OR health OR data center OR utility OR politics OR economy) when:7d',
            '(site:wdrb.com OR site:wfpl.org OR site:courier-journal.com OR site:louisvillepublicmedia.org) Louisville Kentucky when:7d',
        ],
    },
]

GLOSSARY = {
    "AMI": "Advanced metering infrastructure: smart meters plus the communications and data systems around them.",
    "KPSC": "Kentucky Public Service Commission, the state regulator for investor-owned utilities in Kentucky.",
    "PSC": "Public Service Commission, a state utility regulator.",
    "MW": "Megawatt: a unit of electric demand or generation capacity.",
    "GW": "Gigawatt: 1,000 megawatts of electric demand or generation capacity.",
    "interconnection": "The process for connecting a generator, data center, or other large load to the electric grid.",
    "data center": "A large building full of servers. For utilities, it can mean a big new electricity customer that may need grid upgrades.",
    "large load": "A customer or facility that uses enough electricity to affect utility planning, grid equipment, or rates.",
    "rate case": "A formal utility-regulator process that decides how much a utility can charge customers and what costs it can recover.",
    "ratepayer": "A utility customer who pays electric, gas, or water bills.",
    "NIL": "Name, image, and likeness compensation for college athletes.",
    "transfer portal": "The NCAA system where athletes signal intent to transfer and can be recruited by other schools.",
    "NL-to-SQL": "Natural-language-to-SQL: asking a data question in plain English and having software generate a SQL query.",
    "agentic": "AI software that can plan and take steps toward a task instead of only answering one prompt.",
    "agent": "An AI helper that can take steps, use tools, or follow a workflow instead of only producing one answer.",
    "MCP": "Model Context Protocol: a standard way for AI tools to connect to outside apps, files, and services.",
    "model": "The AI system doing the predicting or writing, like Claude, GPT, or Gemini.",
    "governance": "Rules, approvals, monitoring, and controls that keep AI or data use safe and reliable.",
    "workflow": "A repeatable sequence of steps people or software use to get work done.",
}

STOPWORDS = {"the", "a", "an", "and", "or", "to", "of", "in", "for", "on", "with", "as", "at", "by", "from"}

SOURCE_BLOCKLIST = {
    "harianbasis.co",
    "saturdayblitz.com",
    "saturday blitz",
    "aol.com",
    "tradingview",
    "fansided",
    "collegefootballnews.com",
}

SPORTS_SOURCE_ALLOW_HINTS = [
    "ESPN", "On3", "247Sports", "CBS Sports", "Sports Illustrated", "Yahoo Sports",
    "The Athletic", "The Sporting News", "USA Today", "Bleacher Report",
    "Saturday Down South", "Rivals", "Front Office Sports", "Fox Sports", "NBC Sports",
    "Associated Press", "AP News", "NCAA.com",
]

ENERGY_DIRECT_TERMS = ["lg&e", "kentucky utilities", "louisville gas", "ppl", "kentucky", "data center"]

ENERGY_SOURCE_ALLOW_HINTS = [
    "WDRB", "WFPL", "WKU Public Radio", "WUKY", "Louisville Public Media", "Kentucky Lantern",
    "Lexington Herald-Leader", "Courier Journal", "AP News", "Associated Press", "Utility Dive",
    "Energy News Network", "RTO Insider", "POWER Magazine", "Energy, Oil & Gas magazine",
    "FOX 56", "WKYT", "WHAS11", "Carter County Times",
]

AI_SOURCE_ALLOW_HINTS = [
    "The Verge", "TechCrunch", "VentureBeat", "MIT Technology Review", "ZDNET", "Ars Technica",
    "Wired", "Microsoft", "Google", "OpenAI", "Anthropic", "Snowflake", "Databricks",
    "InfoWorld", "CIO", "SiliconANGLE", "Analytics India Magazine", "The Decoder", "ZAWYA",
    "Reuters", "Bloomberg", "CNBC", "Axios", "The Register", "Fortune", "Semafor",
    "Business Insider", "The Information", "Engadget", "Fast Company", "IEEE Spectrum",
    "Tom's Hardware", "Nieman Lab", "AP News", "Associated Press",
]

SECTION_TERMS = {
    "humana": [
        ("humana", 8), ("humana inc", 8), ("medicare advantage", 5), ("health insurance", 4),
        ("insurer", 3), ("claims", 3), ("cms", 3), ("prior authorization", 4), ("medicaid", 3),
        ("pharmacy", 2), ("enrollment", 3),
    ],
    "kentucky_healthcare": [
        ("kentucky", 5), ("louisville", 4), ("healthcare", 4), ("health care", 4),
        ("hospital", 4), ("medicaid", 4), ("uofl health", 6), ("norton healthcare", 6),
        ("baptist health", 5), ("uk healthcare", 6), ("university of kentucky", 5),
    ],
    "analytics": [
        ("analytics", 6), ("business intelligence", 5), ("power bi", 5), ("tableau", 4),
        ("snowflake", 4), ("databricks", 4), ("data governance", 5), ("data quality", 4),
        ("dashboard", 3), ("reporting", 3), ("data platform", 4), ("lakehouse", 4),
    ],
    "louisville": [
        ("louisville", 7), ("jefferson county", 5), ("louisville metro", 6), ("kentucky", 3),
        ("wdrb", 3), ("wfpl", 3), ("courier journal", 3), ("development", 3),
        ("business", 2), ("health", 2), ("utility", 2),
    ],
}

SECTION_SIGNALS = {
    "humana": [
        ("humana", "Humana mention"), ("medicare advantage", "Medicare Advantage"),
        ("cms", "CMS / policy signal"), ("prior authorization", "prior authorization"),
        ("claims", "claims / operations"), ("enrollment", "enrollment signal"),
    ],
    "kentucky_healthcare": [
        ("kentucky", "Kentucky healthcare"), ("louisville", "Louisville healthcare"),
        ("hospital", "hospital operations"), ("medicaid", "Medicaid signal"),
        ("workforce", "workforce pressure"), ("access", "access / care delivery"),
    ],
    "analytics": [
        ("analytics", "analytics workflow"), ("power bi", "BI tooling"),
        ("dashboard", "dashboard / reporting"), ("data governance", "governance controls"),
        ("data quality", "data quality"), ("snowflake", "data-platform signal"),
    ],
    "louisville": [
        ("louisville", "Louisville local"), ("jefferson county", "Jefferson County"),
        ("development", "development / economy"), ("health", "healthcare angle"),
        ("utility", "utility / infrastructure"), ("business", "business signal"),
    ],
}


def local_label(value: str | datetime) -> str:
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(LOCAL_TZ)
    return local.strftime("%b %-d, %-I:%M %p ET") if sys.platform != "win32" else local.strftime("%b %d, %I:%M %p ET")


def decode_google_news_url(source_url: str) -> str:
    parsed = urllib.parse.urlparse(source_url)
    path_parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc != "news.google.com" or "articles" not in path_parts:
        return source_url

    encoded = path_parts[-1]
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded).decode("latin1")
    except Exception:
        return source_url

    if raw.startswith("\x08\x13\x22"):
        raw = raw[3:]
    if raw.endswith("\xd2\x01\x00"):
        raw = raw[:-3]

    data = raw.encode("latin1")
    if not data:
        return source_url
    first = data[0]
    if first >= 0x80:
        url = raw[2:first + 2]
    else:
        url = raw[1:first + 1]
    return url if url.startswith("http") else source_url


def google_news_decode_params(article_id: str) -> tuple[str, str] | None:
    """Fetch the per-article signature + timestamp Google now requires to decode
    an rss/articles/CBMi… link. Returns None if the page can't be read or the
    tokens are absent."""
    url = "https://news.google.com/rss/articles/" + article_id
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            page = resp.read().decode("utf-8", "ignore")
    except Exception:
        return None
    signature = re.search(r'data-n-a-sg="([^"]+)"', page)
    timestamp = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not (signature and timestamp):
        return None
    return signature.group(1), timestamp.group(1)


def resolve_google_news_url(source_url: str) -> str:
    """Resolve a Google News RSS link to its real publisher URL.

    Google migrated rss/articles links to a CBMi… protobuf that the old base64
    trick and a static batchexecute signature can no longer decode. The current
    path reads the article page for its per-article signature + timestamp, then
    asks batchexecute to return the real URL. Falls back to the original link on
    any failure so one bad decode never breaks the scan.
    """
    decoded = decode_google_news_url(source_url)
    if decoded != source_url:
        return decoded

    parsed = urllib.parse.urlparse(source_url)
    path_parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc != "news.google.com" or "articles" not in path_parts:
        return source_url
    article_id = path_parts[-1]

    params = google_news_decode_params(article_id)
    if not params:
        return source_url
    signature, timestamp = params

    inner = json.dumps([
        "garturlreq",
        [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1,
          None, None, None, None, None, 0, 1],
         "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0],
        article_id, int(timestamp), signature,
    ])
    f_req = json.dumps([[["Fbv4je", inner, None, "generic"]]])
    req = urllib.request.Request(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
        data=urllib.parse.urlencode({"f.req": f_req}).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "Referer": "https://news.google.com/",
        },
        method="POST",
    )
    try:
        body = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return source_url
    for line in body.splitlines():
        if "garturlres" not in line:
            continue
        try:
            resolved = json.loads(json.loads(line)[0][2])[1]
        except Exception:
            continue
        if isinstance(resolved, str) and resolved.startswith("http"):
            return resolved
    return source_url


def source_allowed(brief_id: str, item: dict) -> bool:
    text = f"{item.get('title', '')} {item.get('summary', '')} {item.get('source', '')}".lower()
    source = item.get("source", "")
    if any(blocked in text for blocked in SOURCE_BLOCKLIST):
        return False
    if brief_id == "sports":
        if "tracker" in text or "rankings & nil valuations" in text:
            return False
        return any(hint.lower() in source.lower() for hint in SPORTS_SOURCE_ALLOW_HINTS)
    if brief_id == "energy":
        direct_match = any(term in text for term in ENERGY_DIRECT_TERMS)
        trusted_source = any(hint.lower() in source.lower() for hint in ENERGY_SOURCE_ALLOW_HINTS)
        return direct_match or trusted_source
    if brief_id == "ai":
        trusted_source = any(hint.lower() in source.lower() for hint in AI_SOURCE_ALLOW_HINTS)
        return trusted_source
    return True


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def truncate(value: str, limit: int = 150) -> str:
    value = clean_text(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip(" ,;:-") + "…"


# Descriptions that signal a bot-wall, paywall, consent gate, or error page
# rather than real article text. When the only text a page yields matches one of
# these, the fetch is treated as blocked and nothing is summarized from it.
BLOCKED_DESCRIPTION_MARKERS = (
    "enable javascript",
    "javascript is disabled",
    "please enable cookies",
    "are you a robot",
    "verify you are human",
    "prove you are human",
    "unusual traffic",
    "access denied",
    "access to this page has been denied",
    "403 forbidden",
    "subscribe to read",
    "subscribe to continue",
    "sign in to read",
    "sign in to continue",
    "create a free account",
    "this content is not available",
    "checking your browser",
)


def looks_blocked(description: str) -> bool:
    text = description.lower()
    return any(marker in text for marker in BLOCKED_DESCRIPTION_MARKERS)


def extract_article_description(page_html: str) -> str:
    patterns = [
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.IGNORECASE | re.DOTALL)
        if match:
            description = clean_text(match.group(1))
            if len(description.split()) >= 10 and not looks_blocked(description):
                return description
    return ""


def fetch_article_description(source_url: str) -> str:
    if not source_url.startswith("http"):
        return ""
    req = urllib.request.Request(source_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()[:300_000]
    except Exception:
        return ""
    return extract_article_description(raw.decode("utf-8", "ignore"))


def source_from_title(title: str) -> tuple[str, str]:
    # Google News RSS titles often look like "Headline - Publisher".
    parts = title.rsplit(" - ", 1)
    if len(parts) == 2 and len(parts[1]) < 80:
        return parts[0].strip(), parts[1].strip()
    return title.strip(), "Source"


def google_rss_url(query: str) -> str:
    return GOOGLE_NEWS.format(query=urllib.parse.quote(query))


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read()


def parse_rss(url: str) -> list[dict]:
    raw = fetch(url)
    root = ET.fromstring(raw)
    items: list[dict] = []
    for node in root.findall(".//item"):
        raw_title = clean_text(node.findtext("title") or "")
        title, source = source_from_title(raw_title)
        link = clean_text(node.findtext("link") or "")
        description = clean_text(node.findtext("description") or "")
        pub_raw = clean_text(node.findtext("pubDate") or "")
        try:
            published = parsedate_to_datetime(pub_raw)
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            published = published.astimezone(timezone.utc)
        except Exception:
            continue
        items.append({
            "title": title,
            "source": source,
            "url": link,
            "summary": description,
            "publishedAt": published.isoformat(),
            "publishedLabel": local_label(published),
        })
    return items


def normalized_key(title: str) -> str:
    words = [w.lower() for w in re.findall(r"[A-Za-z0-9]+", title) if w.lower() not in STOPWORDS]
    return " ".join(words[:9])


def story_fit(brief_id: str, item: dict) -> int:
    text = f"{item['title']} {item.get('summary', '')} {item.get('source', '')}".lower()
    score = 0
    if brief_id == "energy":
        for term, points in [
            ("lg&e", 6), ("kentucky utilities", 6), ("louisville gas", 6), ("ppl", 5),
            ("data center", 5), ("electric", 2), ("utility", 3), ("grid", 3),
            ("rate", 3), ("psc", 3), ("power", 2), ("meter", 4),
        ]:
            if term in text:
                score += points
    elif brief_id == "ai":
        for term, points in [
            ("ai", 2), ("agent", 4), ("analytics", 5), ("data", 2),
            ("snowflake", 4), ("power bi", 4), ("governance", 4),
            ("automation", 3), ("openai", 3), ("microsoft", 2),
            ("anthropic", 3), ("claude", 3), ("gemini", 3), ("chatgpt", 3),
            ("model", 2), ("launch", 2), ("release", 2),
        ]:
            if term in text:
                score += points
    elif brief_id == "sports":
        for term, points in [
            ("college football", 5), ("college basketball", 5), ("ncaa", 3),
            ("transfer portal", 5), ("nil", 4), ("coach", 3), ("rivalry", 4),
            ("controversy", 4), ("scandal", 5), ("upset", 3), ("backlash", 4),
        ]:
            if term in text:
                score += points
        # Penalize evergreen database/tracker pages; they can inform searches but are not themselves news.
        if "tracker" in text and "reported" not in text and "says" not in text:
            score -= 3
    elif brief_id in SECTION_TERMS:
        for term, points in SECTION_TERMS[brief_id]:
            if term in text:
                score += points
    return score


def candidate_text(item: dict) -> str:
    return f"{item.get('title', '')} {item.get('summary', '')} {item.get('source', '')}".lower()


def is_primary_candidate(brief_id: str, item: dict) -> bool:
    """Return whether an item belongs in a section's primary/local result set.

    Google News can return broad topical stories for narrow queries. Score alone is
    not enough for sections that have both primary and broad fallback tracks.
    """
    text = candidate_text(item)
    if brief_id == "humana":
        return "humana" in text
    if brief_id == "kentucky_healthcare":
        named_kentucky_provider = any(term in text for term in [
            "uofl health",
            "norton healthcare",
            "norton health care",
            "baptist health kentucky",
            "baptist health louisville",
            "uk healthcare",
            "uk health care",
            "university of kentucky healthcare",
            "university of kentucky health care",
            "kentucky children's hospital",
        ])
        if named_kentucky_provider:
            return True
        locality = any(term in text for term in ["kentucky", "louisville", "lexington", "jefferson county"])
        healthcare_signal = any(term in text for term in [
            "healthcare",
            "health care",
            "hospital",
            "hospitals",
            "medicaid",
            "medicare",
            "clinic",
            "clinics",
            "medical",
            "patient",
            "patients",
            "care access",
            "care delivery",
            "provider",
            "providers",
            "nurse",
            "nurses",
            "physician",
            "workforce",
        ])
        return locality and healthcare_signal
    return True


def candidate_classification(brief_id: str, item: dict, *, broad: bool) -> str | None:
    if broad:
        return "broad"
    return "primary" if is_primary_candidate(brief_id, item) else None


def why_matters(brief_id: str, item: dict) -> str:
    title = item["title"]
    text = f"{title} {item.get('summary', '')}".lower()

    if brief_id == "energy":
        if "data center" in text and "rate case" in text:
            return "This matters because the article could set a precedent for who pays to serve a huge new load — the utility, the customer base, or the project sponsor."
        if "backstop procurement" in text or "procurement plan" in text:
            return "This matters because procurement rules can decide how fast the grid can prepare for new demand and how much flexibility utilities keep."
        if "resident" in text or "testify" in text or "upgrade" in text:
            return "This matters because local opposition can slow or reshape transmission buildouts that utilities say they need for future load."
        if "power project" in text and "data center" in text:
            return "This matters because power-supply deals for data centers can lock in infrastructure spending and clarify who is on the hook for it."
        if "data center" in text:
            return "This matters because large-load demand can change grid forecasts, trigger upgrade spending, and reopen the question of who pays for capacity."
        if any(term in text for term in ["thermostat", "rebate", "load control", "demand response"]):
            return "This matters because load-shaping programs can be cheaper than new generation, so even a small incentive can change planning and bill pressure."
        if any(term in text for term in ["board", "appoint", "director", "investor", "valuation", "fair value"]):
            return "This matters because board and investor moves often signal how a utility wants capital spending, regulation, and growth plans to be read."
        if any(term in text for term in ["rate", "bill", "ratepayer", "regulatory", "psc"]):
            return "This matters because utility decisions only become real when they show up in customer bills, regulatory scrutiny, or rate-case precedent."
        if any(term in text for term in ["grid", "capacity", "generation"]):
            return "This matters because grid-capacity stories usually translate into infrastructure timing, reliability risk, and the cost of adding new power."
        return "This matters because utility stories often hide a concrete tradeoff: reliability, customer cost, regulatory pressure, or planning risk."

    if brief_id == "ai":
        if "copilot" in text or "github" in text:
            return "This matters because bringing a model into Copilot changes where developers encounter it and whether it becomes part of an existing workflow."
        if "anthropic" in text or "sonnet 5" in text:
            return "This matters because a cheaper flagship model can shift which tasks get automated, which model becomes the default, and how quickly teams adopt it."
        if "goal" in text or "autonomous" in text:
            return "This matters because long-running autonomous work only helps if the agent can pause, report progress, and hand off cleanly when something breaks."
        if "agent" in text or "agentic" in text:
            return "This matters because agent stories are about real workflow power, so the key question is what the system can touch and how it is controlled."
        if any(term in text for term in ["mcp", "cli", "developer", "browser", "terminal"]):
            return "This matters because tighter tool integration makes AI more useful for operators, but it also raises the blast radius if permissions are too broad."
        if any(term in text for term in ["pricing", "cost", "price"]):
            return "This matters because model pricing changes which tasks are economical enough to automate at scale."
        return "This matters because the practical question is what capability, access, or workflow changed enough to affect real use."

    if brief_id == "humana":
        return "This matters because Humana and health-insurance stories can move Medicare Advantage, claims operations, member experience, and healthcare cost assumptions."

    if brief_id == "kentucky_healthcare":
        return "This matters because Kentucky healthcare stories can affect local access, hospital operations, workforce pressure, public programs, and care costs."

    if brief_id == "analytics":
        return "This matters because analytics stories point to tools, governance, data quality, and reporting workflows that can make business decisions faster or cleaner."

    if brief_id == "louisville":
        return "This matters because Louisville stories can signal local business, infrastructure, healthcare, policy, and community changes worth watching close to home."

    if "transfer" in text or "nil" in text:
        return "Portal and NIL churn can create fast fanbase mood swings and source-backed Fanbase Weather angles without inventing reactions."

    if "coach" in text or "fired" in text:
        return "This matters because coaching pressure changes fan confidence fast and can reshape the next few weeks of fanbase mood."

    return "This may be useful raw material for Fanbase Weather-style chaos scoring if the article has a real trigger, affected teams, and shareable stakes."


def data_signals(brief_id: str, item: dict) -> list[str]:
    text = f"{item['title']} {item.get('summary', '')}".lower()
    signals: list[str] = []
    candidates = {
        "energy": [
            ("lg&e", "LG&E / KU / PPL mention"),
            ("ppl", "PPL mention"),
            ("data center", "data-center load"),
            ("rate", "rate / bill impact"),
            ("meter", "metering / AMI impact"),
            ("grid", "grid reliability"),
            ("psc", "regulatory milestone"),
            ("generation", "generation planning"),
        ],
        "ai": [
            ("agent", "agent workflow"),
            ("analytics", "analytics workflow"),
            ("governance", "governance controls"),
            ("data", "data-platform signal"),
            ("pricing", "pricing / limits"),
            ("openai", "model/tool release"),
        ],
        "sports": [
            ("transfer", "transfer-portal movement"),
            ("nil", "NIL pressure"),
            ("coach", "coaching drama"),
            ("rivalry", "rivalry heat"),
            ("controvers", "controversy / backlash"),
            ("upset", "upset / fanbase swing"),
        ],
    }.get(brief_id, SECTION_SIGNALS.get(brief_id, []))
    for needle, label in candidates:
        if needle in text and label not in signals:
            signals.append(label)
    if not signals:
        signals = ["article trigger", "source credibility", "practical impact"]
    return signals[:4]


def summary_is_duplicate_or_thin(title: str, summary: str) -> bool:
    if not summary:
        return True
    title_norm = re.sub(r"\W+", " ", title.lower()).strip()
    summary_norm = re.sub(r"\W+", " ", summary.lower()).strip()
    if summary_norm == title_norm or summary_norm.startswith(title_norm[:80]):
        return True
    return len(summary.split()) < 14


def content_is_headline_only(title: str, content: str) -> bool:
    """True when the only text we have is the headline (or near-empty).

    Distinct from summary_is_duplicate_or_thin: this gates whether a story has ANY
    real body text worth summarizing, so it drops the softer word-count floor and
    only rejects empty or headline-echo content.
    """
    if not content:
        return True
    title_norm = re.sub(r"\W+", " ", title.lower()).strip()
    content_norm = re.sub(r"\W+", " ", content.lower()).strip()
    if not content_norm:
        return True
    if content_norm == title_norm or content_norm.startswith(title_norm[:80]):
        return True
    return len(content.split()) < 6


def has_summarizable_content(item: dict) -> bool:
    """Only summarize a story when real article text was fetched for it."""
    return not content_is_headline_only(item.get("title", ""), clean_text(item.get("summary", "")))


def sentence_case_fragment(value: str) -> str:
    return value.strip().rstrip(".")


def story_explainer_sentence(brief_id: str, item: dict) -> str:
    title = item.get("title", "").strip().rstrip(".")
    text = f"{title} {item.get('summary', '')}".lower()
    if brief_id == "energy":
        if "rate" in text or "bill" in text or "affordability" in text:
            return "In plain English, this is a customer-bill and rate-case story: the important details are what regulators approved, how much bills may change, what the utility says the money funds, and what protections or affordability terms are included."
        if any(term in text for term in ["capacity", "generation", "grid"]):
            return "In plain English, this is a grid-capacity story: the important details are how much new power or infrastructure is being planned, what demand it is supposed to serve, and whether reliability or cost pressure could change for customers."
        if "data center" in text or "power demand" in text:
            return "In plain English, this is a large-load planning story: the important details are whether data centers are driving new power demand, who pays for the grid upgrades, and how regulators or lawmakers protect ordinary ratepayers."
        return "In plain English, this is a utility-operations story: the important details are what changed, which customers or systems are affected, and whether it creates a reliability, regulatory, cost, or data-quality issue."
    if brief_id == "ai":
        if any(term in text for term in ["snowflake", "databricks", "power bi", "analytics", "data"]):
            return "In plain English, this is a data-and-analytics workflow story: the important details are what changed in the platform, how it could affect governed reporting or automation, and whether it is practical enough to test."
        if "agent" in text or "agentic" in text:
            return "In plain English, this is an AI-agent workflow story: the important details are what the agent can do, what guardrails exist, and whether it helps real operators complete work instead of just demoing well."
        return "In plain English, this is a practical AI story: the important details are what changed, who can use it, what risk or governance issue comes with it, and whether it creates a useful operator-facing workflow."
    if brief_id == "humana":
        return "In plain English, this is a health-insurance story: the important details are what changed for Humana, members, providers, claims, costs, or Medicare Advantage strategy."
    if brief_id == "kentucky_healthcare":
        return "In plain English, this is a healthcare access and operations story: the important details are who is affected in Kentucky, what service or policy changed, and whether cost, staffing, or care access is involved."
    if brief_id == "analytics":
        return "In plain English, this is an analytics workflow story: the important details are what changed in the tool, platform, metric, governance layer, or reporting process."
    if brief_id == "louisville":
        return "In plain English, this is a Louisville local signal: the important details are what changed, which people or organizations are affected, and whether it touches business, health, infrastructure, or policy."
    if "coach" in text or "fired" in text:
        return "In plain English, this is a coaching-pressure story: the important details are whose job security is being questioned, why the timing matters, and which fanbases are likely to react."
    if "nil" in text or "transfer" in text:
        return "In plain English, this is an NIL or transfer-portal story: the important details are which player, school, or roster situation changed and why it could swing fanbase mood quickly."
    return "In plain English, this is a college-sports chaos story: the important details are what happened, who is affected, why fans care today, and whether it creates a source-backed angle worth tracking."


def brief_context_sentence(brief_id: str, item: dict) -> str:
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    if brief_id == "energy":
        if any(term in text for term in ["lg&e", "kentucky utilities", "louisville gas", "ppl"]):
            return "For Dustin, the useful read is whether this changes the local utility story around capacity, reliability, rates, regulation, metering, or the data products leaders need to explain those tradeoffs clearly."
        if "data center" in text or "power demand" in text:
            return "For Dustin, the useful read is whether data-center demand is starting to pressure utility forecasts, grid planning, rate design, or public communication around who pays for new infrastructure."
        return "For Dustin, the useful read is whether the story points to customer bill impact, reliability risk, regulatory pressure, or new analytics questions for utility operators."
    if brief_id == "ai":
        return "For Dustin, the useful read is whether this creates a practical analytics workflow, a governance issue, a tool worth testing, or a clear idea to write about for business operators."
    if brief_id == "humana":
        return "For Dustin, the useful read is whether this changes health-insurance economics, Humana operating signals, member experience, or analytics questions around claims and care management."
    if brief_id == "kentucky_healthcare":
        return "For Dustin, the useful read is whether this changes local healthcare access, hospital operations, payer pressure, public programs, or community health signals in Kentucky."
    if brief_id == "analytics":
        return "For Dustin, the useful read is whether this creates a better dashboard, governed metric, data product, automation, or decision workflow worth testing."
    if brief_id == "louisville":
        return "For Dustin, the useful read is whether this changes the Louisville operating environment: business, healthcare, infrastructure, utilities, public policy, or local opportunity."
    if "nil" in text or "transfer" in text:
        return "For Dustin, the useful read is the fanbase chaos angle: which teams or players are affected, what changed in the last day, and whether the story creates a source-backed Fanbase Weather signal."
    return "For Dustin, the useful read is whether this has a real trigger, clear stakes, and enough fanbase emotion to become a source-backed college sports chaos item."


def morning_brief_summary(brief_id: str, item: dict, source_label: str) -> str:
    title = item["title"].strip()
    raw_summary = clean_text(item.get("summary", ""))
    if summary_is_duplicate_or_thin(title, raw_summary):
        base = f"{source_label} is reporting on {sentence_case_fragment(title)}."
    else:
        base = raw_summary.rstrip(".") + "."

    explainer = story_explainer_sentence(brief_id, item)
    context = brief_context_sentence(brief_id, item)
    source_note = "This is included in the morning brief because it is dated, source-linked, and matched the scan filters for this section."
    if source_label and source_label not in base:
        source_note = f"The source is {source_label}; this is included because it is dated, source-linked, and matched the scan filters for this section."
    return " ".join([base, explainer, context, source_note])


def title_based_email_summary(brief_id: str, item: dict) -> str:
    """Fallback summary for feeds whose RSS description is just the headline."""
    title = item.get("title", "").strip().rstrip(".")
    text = f"{title} {item.get('summary', '')}".lower()
    if brief_id == "energy":
        if "test facility" in text and "data center" in text:
            return "DOE is testing how data centers can connect to the grid with less reliability risk."
        if "communities push back" in text and "data center" in text:
            return "Kentucky is pitching cheap power for data centers, while local communities question the tradeoffs."
        if "ban" in text and "data center" in text:
            return "Louisville is weighing limits on hyperscale data centers plus stricter rules for smaller facilities."
        if "zoo" in text and "data center" in text:
            return "A proposed data center near Nashville Zoo is becoming a public fight over local risk and infrastructure siting."
        if "ppl" in text and any(term in text for term in ["fair value", "valuation", "nyse", "weakness"]):
            return "Market coverage is questioning PPL’s valuation, a utility-stock sentiment signal to keep on the radar."
        if "data center" in text:
            return "A data-center story with possible implications for power demand, grid upgrades, and who pays for capacity."
        if any(term in text for term in ["lg&e", "kentucky utilities", "ppl"]):
            return "A utility story tied to LG&E/KU/PPL that may affect rates, reliability, regulation, or planning."
        if "grid" in text:
            return "A grid story to watch for reliability, infrastructure, cost, or planning implications."
        return "An energy/utility item to scan for cost, reliability, regulatory, or customer-impact signals."
    if brief_id == "ai":
        if "agent" in text:
            return "An AI-agent workflow story to scan for practical automation, controls, and operator impact."
        if "analytics" in text or "data" in text:
            return "A data/analytics story to scan for workflow, governance, or tooling ideas worth testing."
        return "A practical AI story to scan for tool changes, risks, and useful business workflows."
    return title + "."


def email_brief_summary(brief_id: str, item: dict, source_label: str) -> str:
    """Short one-glance summary used only by the email renderer."""
    title = item["title"].strip()
    raw_summary = clean_text(item.get("summary", ""))
    if summary_is_duplicate_or_thin(title, raw_summary):
        base = title_based_email_summary(brief_id, item)
    else:
        base = raw_summary.rstrip(".") + "."
    return truncate(base, 145)


def glossary_terms(item: dict) -> list[dict]:
    text = f"{item['title']} {item.get('summary', '')}"
    terms = []
    for term, definition in GLOSSARY.items():
        flags = re.IGNORECASE if term.islower() or "-" in term or " " in term else 0
        if re.search(rf"\b{re.escape(term)}\b", text, flags):
            terms.append({"term": term, "definition": definition})
    return terms[:4]


CONCEPT_LIBRARY = [
    ("export-control directive", ["export-control", "export control", "government directive"], "A government rule that can restrict who gets access to certain technology, often because officials think it could affect national security or foreign-policy goals.", "If an AI company removes access because of export controls, the story is not just a product update — it is policy directly changing who can use a model."),
    ("model access", ["access suspension", "suspended", "customers", "models are unaffected"], "Whether a customer is allowed to use a specific AI model or feature.", "Access changes can break workflows, force teams to switch models, and reveal how dependent products are on one vendor."),
    ("agentic workflow", ["agentic", "agent workflow", "agent automation"], "A workflow where AI is expected to plan steps, use tools, and move work forward instead of only answering a single question.", "This is where AI starts touching real operations, so permissions, logs, and safety controls matter as much as the model output."),
    ("GitHub Actions", ["github actions"], "GitHub's automation system for running jobs like tests, deployments, or scripted tasks when code changes.", "If AI can generate or run Actions, it can affect the same pipelines that ship software."),
    ("Markdown workflow", ["markdown workflows", "natural-language markdown", "markdown"], "A text-file workflow written in a simple document format instead of a traditional programming language.", "This lowers the barrier to creating automation, but also means non-programmers may create powerful workflows that need guardrails."),
    ("sandboxed container", ["sandboxed container", "sandbox"], "An isolated environment that limits what code can touch while it runs.", "Sandboxes reduce the blast radius if an AI-generated workflow does something wrong."),
    ("read-only permissions", ["read-only"], "Access that lets software view information but not change or delete it.", "Read-only defaults are a safety move: the AI can inspect before anyone grants it power to modify systems."),
    ("firewall controls", ["firewall", "network controls"], "Rules that limit what a running workflow or container can reach over the network.", "Network limits matter because an agent that can freely call outside services can leak data or trigger actions outside the intended system."),
    ("safe outputs", ["safe outputs", "output controls"], "Checks or formats that constrain what an automated workflow is allowed to produce or pass to the next step.", "Output controls reduce the chance that a bad agent result quietly becomes an instruction for another system."),
    ("threat detection", ["threat detection"], "Monitoring that looks for suspicious or dangerous behavior.", "AI workflows need detection because mistakes and attacks can look like normal automation until damage is done."),
    ("audit logs", ["audit log", "audit logs", "auditability"], "Records of what happened, who or what triggered it, and when it occurred.", "Audit logs are how operators reconstruct whether an agent followed the rules after something surprising happens."),
    ("public preview", ["public preview", "preview"], "A release stage where a feature is available for broader testing but may still change before general availability.", "Preview status tells you not to treat the feature as fully stable or production-proven yet."),
    ("natural-language workflow", ["natural-language", "natural language"], "Automation defined in ordinary written language rather than only code or configuration files.", "Natural-language automation can make tools easier to use, but it also makes precision and review more important."),
    ("Developer Mode", ["developer mode"], "A mode that gives developers deeper debugging or control features than normal users see.", "For coding agents, developer features can make it easier to inspect web apps, reproduce bugs, and build internal tools."),
    ("CDP debugging", ["cdp", "browser debugging"], "Chrome DevTools Protocol: a way for software to inspect and control a browser for testing or debugging.", "CDP access can make an AI coding agent much better at fixing front-end problems because it can see the page like a developer tool does."),
    ("MCP", ["mcp"], GLOSSARY["MCP"], "MCP matters because it is becoming a common plug shape for connecting AI agents to real tools, files, and services."),
    ("CLI", [" cli", "cli "], "Command-line interface: a text-based tool run from a terminal.", "CLI support matters when AI tools need to fit into developer and automation workflows instead of only a web chat."),
    ("model", [" model ", " models "], GLOSSARY["model"], "Model choice affects cost, quality, speed, policy limits, and whether a workflow can keep running when access changes."),
    ("governance", ["governance", "governed", "controls", "guardrail", "guardrails"], GLOSSARY["governance"], "Governance is the difference between a cool demo and something a business can safely let touch real work."),
    ("business automation", ["business automation", "automation"], "Using software to complete repeatable business steps with less manual work.", "Automation is where AI value becomes measurable, but it also creates new failure modes if no one owns review and rollback."),
    ("data center", ["data center", "data centers"], GLOSSARY["data center"], "Data centers can consume huge amounts of electricity, so they can change utility forecasts, infrastructure plans, and customer-bill debates."),
    ("grid upgrades", ["grid upgrades", "grid", "transmission", "capacity"], "Physical or operational improvements to the electric system so it can carry and deliver enough power safely.", "The key question is who benefits from the upgrade and who pays for it."),
    ("ratepayer", ["ratepayer", "customer bills", "bills", "rates"], GLOSSARY["ratepayer"], "Ratepayer impact is the consumer angle: whether ordinary customers end up funding infrastructure or company costs."),
    ("rate case", ["rate case", "rate hike", "rate increase"], GLOSSARY["rate case"], "Rate cases translate utility spending into bills, so they are where technical grid plans become household costs."),
]


def explainer_terms(item: dict) -> list[dict]:
    """Return glossary cards for the article learning page."""
    return article_concepts(item)


def article_concepts(item: dict) -> list[dict]:
    text = f" {item.get('title', '')} {item.get('summary', '')} ".lower()
    concepts: list[dict] = []
    for term, needles, definition, why_it_matters_text in CONCEPT_LIBRARY:
        if any(needle in text for needle in needles):
            concepts.append({
                "term": term,
                "definition": definition,
                "whyItMatters": why_it_matters_text,
            })
    for term in glossary_terms(item):
        if all(term["term"].lower() != concept["term"].lower() for concept in concepts):
            concepts.append({
                "term": term["term"],
                "definition": term["definition"],
                "whyItMatters": "This term appears in the article, so understanding it helps you read the source without getting lost in jargon.",
            })
    return concepts[:12]


FOUNDATIONAL_CONCEPTS = {
    "ai": [
        {"term": "AI capability", "definition": "The specific new thing an AI system can do, such as use a browser, run code, connect tools, or access a model.", "whyItMatters": "AI news is easier to judge when you identify the exact capability instead of treating every update as general hype."},
        {"term": "model", "definition": GLOSSARY["model"], "whyItMatters": "Model choice affects cost, quality, speed, policy limits, and whether a workflow can keep running when access changes."},
        {"term": "guardrail", "definition": "A rule, limit, approval step, or monitoring system meant to keep AI behavior safe and controlled.", "whyItMatters": "Guardrails determine whether a tool is safe enough for real work, especially when it touches business systems."},
        {"term": "vendor dependency", "definition": "Reliance on one company, model, or platform for an important workflow.", "whyItMatters": "If access, pricing, or policy changes, dependency can suddenly become an operational risk."},
        {"term": "workflow", "definition": GLOSSARY["workflow"], "whyItMatters": "Workflow impact is where AI changes become practical: what step gets faster, safer, cheaper, or more automated?"},
        {"term": "governance", "definition": GLOSSARY["governance"], "whyItMatters": "Governance is the difference between a cool demo and something a business can safely let touch real work."},
    ],
    "energy": [
        {"term": "data center", "definition": GLOSSARY["data center"], "whyItMatters": "Data centers can consume huge amounts of electricity, so they can change utility forecasts, infrastructure plans, and customer-bill debates."},
        {"term": "large load", "definition": GLOSSARY["large load"], "whyItMatters": "Large loads matter because one customer can be big enough to change planning assumptions for the whole grid area."},
        {"term": "grid upgrades", "definition": "Physical or operational improvements to the electric system so it can carry and deliver enough power safely.", "whyItMatters": "The key question is who benefits from the upgrade and who pays for it."},
        {"term": "ratepayer", "definition": GLOSSARY["ratepayer"], "whyItMatters": "Ratepayer impact is the consumer angle: whether ordinary customers end up funding infrastructure or company costs."},
        {"term": "utility rates", "definition": "The prices customers pay for electric, gas, or water service, usually set or reviewed by regulators.", "whyItMatters": "Rates are where utility planning, infrastructure costs, and company finances turn into customer impact."},
        {"term": "regulatory review", "definition": "The process where regulators examine utility plans, costs, reliability claims, and customer impacts.", "whyItMatters": "Regulatory review is where private utility decisions become public questions about fairness, reliability, and bills."},
    ],
}


def top_up_concepts(brief_id: str, concepts: list[dict], minimum: int = 6) -> list[dict]:
    topped_up = list(concepts)
    existing = {concept["term"].lower() for concept in topped_up}
    for concept in FOUNDATIONAL_CONCEPTS.get(brief_id, []):
        if len(topped_up) >= minimum:
            break
        if concept["term"].lower() in existing:
            continue
        topped_up.append(concept)
        existing.add(concept["term"].lower())
    return topped_up


def article_learning_page(brief_id: str, item: dict, source_label: str = "") -> dict:
    """Build an article-specific teaching page, not a generic tooltip."""
    title = item.get("title", "this story").strip().rstrip(".")
    summary = clean_text(item.get("summary", ""))
    text = f"{title} {summary}".lower()
    concepts = article_concepts(item)

    if brief_id == "energy" and ("data center" in text or "large load" in text):
        frame = "This is a power-demand story: a large electricity user may change what the utility has to build, forecast, and justify to regulators."
        stakes = "The teaching angle is cost allocation. If a data center needs more power or grid upgrades, the important question is whether the company pays or ordinary ratepayers share the bill."
        reading = "Read the article by separating three things: the proposed facility, the amount of electricity it may need, and the regulatory/political fight over who pays for infrastructure."
        questions = ["How much electricity is being requested?", "Does the article say who pays for upgrades?", "Are regulators, lawmakers, or local residents pushing back?", "Is this confirmed demand or speculative project talk?"]
    elif brief_id == "energy" and any(term in text for term in ["rate", "bill", "ratepayer", "rate case", "rate hike"]):
        frame = "This is a utility-pricing story: a company, regulator, or market signal is pointing to costs that may eventually show up in customer bills."
        stakes = "The teaching angle is the bridge between utility spending and public impact. Technical investments become controversial when customers are asked to pay for them."
        reading = "Read for the requested amount, the approved amount, the reason for the cost, and whether the article describes customer protections or opposition."
        questions = ["Is this a request, an approval, or market commentary?", "What costs are being justified?", "Which customers are affected?", "What did regulators or advocates say?"]
    elif brief_id == "ai" and ("agentic" in text or "agent" in text or "workflow" in text):
        frame = "This is an AI-agent workflow story: AI is being used to help define, run, or supervise a sequence of work instead of only chatting."
        stakes = "The teaching angle is control. Once AI can trigger workflows, the key concepts are permissions, sandboxing, auditability, and whether humans can understand what it changed."
        reading = "Read for the exact job the agent can do, what tools it touches, what permissions it starts with, and what safety controls are named in the article."
        questions = ["What action can the agent actually take?", "Is it read-only or can it modify systems?", "Where does human review happen?", "What guardrail would fail first in real use?"]
    elif brief_id == "ai" and ("codex" in text or "developer" in text or "mcp" in text or "cli" in text):
        frame = "This is a developer-tooling AI story: the update affects how coding agents inspect apps, connect tools, or run inside a developer workflow."
        stakes = "The teaching angle is integration. The more an AI coding tool connects to browsers, terminals, and external services, the more useful — and riskier — it becomes."
        reading = "Read for what is newly available, whether it is preview or production-ready, what systems it connects to, and any limits around pricing, permissions, or rate limits."
        questions = ["What new capability did the tool gain?", "Does it connect to browsers, terminals, or outside services?", "Is this broadly available or limited preview?", "What would you test with it first?"]
    elif brief_id == "ai" and ("suspended" in text or "export" in text or "directive" in text):
        frame = "This is an AI-access and policy story: model availability changed because a government or company rule limited who can use it."
        stakes = "The teaching angle is dependency risk. If a product or workflow relies on one model, policy decisions can suddenly change what users are allowed to run."
        reading = "Read for which model changed, who lost access, what authority caused the change, and whether alternative models or customers are unaffected."
        questions = ["Which exact model or feature changed?", "Who lost access?", "Was the change caused by company policy or government order?", "What alternatives remain available?"]
    elif brief_id == "ai":
        frame = "This is an AI product or policy update. The useful read is not that AI is changing; it is exactly what capability, access, cost, or risk changed in this article."
        stakes = "The teaching angle is practical impact: who can use it, what it changes in work, and what risk or limit would matter in a real business setting."
        reading = "Read for the concrete new fact, the affected users, whether this is a launch or restriction, and whether the source gives enough evidence to trust it."
        questions = ["What changed today?", "Who can use it?", "What workflow does it affect?", "What limitation or risk is mentioned?"]
    else:
        frame = f"This article is about {sentence_case_fragment(title)}."
        stakes = why_matters(brief_id, item)
        reading = "Read for what changed, who is affected, why it matters now, and what happens next."
        questions = ["What is the new fact?", "Who is affected?", "What happens next?", "What would change your interpretation?"]

    if brief_id == "energy" and "rates" in text and all(concept["term"] != "utility rates" for concept in concepts):
        concepts.insert(0, {"term": "utility rates", "definition": "The prices customers pay for electric, gas, or water service, usually set or reviewed by regulators.", "whyItMatters": "Rates are where utility planning, infrastructure costs, and company finances turn into customer impact."})

    if not concepts:
        if brief_id == "energy":
            concepts = [
                {"term": "utility rates", "definition": "The prices customers pay for electric, gas, or water service, usually set or reviewed by regulators.", "whyItMatters": "Rates are where utility planning, infrastructure costs, and company finances turn into customer impact."},
                {"term": "ratepayer", "definition": GLOSSARY["ratepayer"], "whyItMatters": "Ratepayer impact is the consumer angle: whether ordinary customers end up paying for a utility decision."},
            ]
        elif brief_id == "ai":
            concepts = [
                {"term": "AI capability", "definition": "A specific thing an AI tool can now do, such as use a browser, run code, connect tools, or access a model.", "whyItMatters": "Reading AI news gets easier when you focus on the exact new capability instead of the hype around the product."},
                {"term": "guardrail", "definition": "A rule, limit, approval step, or monitoring system meant to keep AI behavior safe and controlled.", "whyItMatters": "Guardrails determine whether a tool is safe enough for real work, especially when it touches business systems."},
            ]

    concepts = top_up_concepts(brief_id, concepts)
    glossary = concepts[:12]
    core_terms = ", ".join(concept["term"] for concept in glossary[:6])
    cleaned_frame = frame.replace("This article is about", "This is about").replace("This article", "This").replace("the article", "the story")
    cleaned_stakes = stakes.replace("article", "story").replace("source", "details")
    cleaned_reading = reading.replace("the article", "the story").replace("Read the article", "Read it").replace("source", "details")
    explanation_parts = [
        cleaned_frame,
        cleaned_stakes,
        f"The main terms to understand are {core_terms}." if core_terms else "The main thing to understand is what changed and who is affected.",
        cleaned_reading,
    ]
    explanation_text = " ".join(part.strip() for part in explanation_parts if part.strip())
    return {
        "title": "What this means",
        "explanationText": explanation_text,
        "glossary": glossary,
    }


LLM_SYSTEM_PROMPT = """You write morning-brief cards for a personal news digest. The reader is a data/analytics professional in Louisville, Kentucky who wants to understand each story fully from the card alone, clicking through only for fine detail.

For the article provided, return strict JSON with exactly these keys:

"summary": 2-5 sentences, plain English, up to ~110 words but only as long as the source supports. Summarize ONLY what the provided title and description actually state (names, numbers, decisions), then what it means for this section's area when that adds real understanding. If the description is brief, keep the summary brief — never pad, speculate, invent specifics, or write that details are missing/unavailable. Never start with "The article" or "This article". No hype, no filler.

"why_it_matters": one sentence beginning "This matters because", stating the practical impact for this area. Make it a distinct point, not a repeat of a summary sentence.

"glossary": array of 0-4 objects {"term", "definition", "why_it_matters"} for terms in THIS story's field that an ordinary person off the street would likely not know (jargon, acronyms, regulatory or technical terms). One-sentence plain definitions. Skip terms everyone knows; return [] if the story has no such terms.

"explanation": 2-3 sentences of teaching: what kind of story this is, what to pay attention to when reading the source, and what would change the interpretation.

Base everything ONLY on the provided title, description, and source. If the description is thin, summarize cautiously without inventing specifics — say what is known rather than padding."""


def llm_enrich(section_name: str, item: dict, source_label: str) -> dict | None:
    """One structured LLM call per article. Returns None on any failure."""
    if not OPENAI_KEY:
        return None
    article_payload = json.dumps({
        "section": section_name,
        "title": item.get("title", ""),
        "source": source_label,
        "published": item.get("publishedLabel", ""),
        "description": clean_text(item.get("summary", ""))[:2200],
    }, ensure_ascii=False)
    body = json.dumps({
        "model": OPENAI_MODEL,
        "reasoning_effort": "low",
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 1600,
        "messages": [
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": article_payload},
        ],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            summary = clean_text(parsed.get("summary", ""))
            if len(summary.split()) < 12:
                raise ValueError("summary too short")
            glossary = []
            for entry in parsed.get("glossary", [])[:4]:
                term = clean_text(entry.get("term", ""))
                definition = clean_text(entry.get("definition", ""))
                if term and definition:
                    glossary.append({
                        "term": term,
                        "definition": definition,
                        "whyItMatters": clean_text(entry.get("why_it_matters", "")) or
                            "This term appears in the story, so knowing it helps you read the source without getting lost in jargon.",
                    })
            LLM_STATS["ok"] += 1
            return {
                "summary": summary,
                "whyItMatters": clean_text(parsed.get("why_it_matters", "")),
                "glossary": glossary,
                "explanation": clean_text(parsed.get("explanation", "")),
            }
        except Exception:
            if attempt == 0:
                time.sleep(3)
                continue
            LLM_STATS["fail"] += 1
            return None
    return None


def enriched_fields(brief_id: str, brief_name: str, item: dict, source_label: str) -> dict:
    """Summary/why/glossary/learning for one card: LLM first, templates as fallback."""
    enrich = llm_enrich(brief_name, item, source_label)
    if enrich:
        learning_glossary = enrich["glossary"] or [
            {**concept} for concept in top_up_concepts(brief_id, [], minimum=2)
        ]
        return {
            "summary": enrich["summary"],
            "whyItMatters": enrich["whyItMatters"] or why_matters(brief_id, item),
            "glossary": [{"term": g["term"], "definition": g["definition"]} for g in enrich["glossary"]],
            "learningPage": {
                "title": "What this means",
                "explanationText": enrich["explanation"] or article_learning_page(brief_id, item, source_label)["explanationText"],
                "glossary": learning_glossary,
            },
        }
    return {
        "summary": morning_brief_summary(brief_id, item, source_label),
        "whyItMatters": why_matters(brief_id, item),
        "glossary": glossary_terms(item),
        "learningPage": article_learning_page(brief_id, item, source_label),
    }


def build_articles(brief: dict) -> tuple[list[dict], bool, list[str]]:
    seen: set[str] = set()
    articles: list[dict] = []
    errors: list[str] = []
    used_fallback = False

    def collect(queries: list[str], fallback: bool = False, broad: bool = False) -> None:
        nonlocal used_fallback
        if fallback:
            used_fallback = True
        for query in queries:
            try:
                for item in parse_rss(google_rss_url(query)):
                    published = datetime.fromisoformat(item["publishedAt"])
                    if not fallback and published < CUTOFF:
                        continue
                    key = normalized_key(item["title"])
                    if not key or key in seen:
                        continue
                    text_for_filter = candidate_text(item)
                    if not source_allowed(brief["id"], item):
                        continue
                    score = story_fit(brief["id"], item)
                    if brief["id"] == "sports" and any(hint.lower() in item.get("source", "").lower() for hint in SPORTS_SOURCE_ALLOW_HINTS):
                        score += 4
                    if brief["id"] == "ai" and any(hint.lower() in item.get("source", "").lower() for hint in AI_SOURCE_ALLOW_HINTS):
                        score += 3
                    if brief["id"] == "energy" and any(term in text_for_filter for term in ENERGY_DIRECT_TERMS):
                        score += 4
                    if score < (4 if brief["id"] != "sports" else 5):
                        continue
                    classification = candidate_classification(brief["id"], item, broad=broad)
                    if classification is None:
                        continue
                    seen.add(key)
                    item["score"] = score
                    item["candidateClass"] = classification
                    item["primaryTopicRank"] = 2 if classification == "primary" else 1
                    articles.append(item)
            except Exception as exc:
                errors.append(f"{brief['id']} query failed: {exc}")

    collect(brief["queries"], fallback=False, broad=False)
    if not articles:
        collect(brief.get("fallbackQueries", []), fallback=True, broad=False)
    if not articles:
        collect(brief.get("broadFallbackQueries", []), fallback=True, broad=True)

    articles.sort(key=lambda x: (x.get("primaryTopicRank", 1), x.get("score", 0), x.get("publishedAt", "")), reverse=True)
    output = []
    skipped = 0
    # Walk the full ranked list, not just the top slice, so skipping a story with
    # no fetchable content backfills from the next-best candidate.
    for item in articles:
        if len(output) >= MAX_ITEMS_PER_BRIEF:
            break
        source_label = item["source"] if item["source"] != "Source" else "Open source"
        source_url = resolve_google_news_url(item["url"])
        page_description = fetch_article_description(source_url)
        summary_item = item
        if page_description and len(page_description.split()) > len(clean_text(item.get("summary", "")).split()):
            summary_item = {**item, "summary": page_description}
        # Never summarize a story we could only see the headline of (or whose page
        # blocked us); an invented summary is worse than dropping the item.
        if not has_summarizable_content(summary_item):
            skipped += 1
            continue
        position = len(output) + 1
        fields = enriched_fields(brief["id"], brief["name"], summary_item, source_label)
        output.append({
            "id": f"{brief['id']}-{position}-{abs(hash(item['url'])) % 100000}",
            "title": item["title"],
            "kicker": source_label,
            "summary": fields["summary"],
            "emailSummary": email_brief_summary(brief["id"], summary_item, source_label),
            "whyItMatters": fields["whyItMatters"],
            "dataSignals": data_signals(brief["id"], item),
            "sourceLabel": f"{source_label} · {item['publishedLabel']}",
            "sourceUrl": source_url,
            "googleNewsUrl": item["url"] if source_url != item["url"] else None,
            "publishedAt": item["publishedAt"],
            "glossary": fields["glossary"],
            "learningPage": fields["learningPage"],
        })
    if skipped:
        errors.append(f"{brief['id']}: skipped {skipped} stor{'y' if skipped == 1 else 'ies'} with no fetchable content")
    return output, used_fallback, errors


def extract_ai_brief_response(text: str) -> str:
    """Return the actual briefing body from a cron output file, if present."""
    response = text.split("## Response", 1)[-1].strip() if "## Response" in text else text.strip()
    archive_marker = "Briefing text for local archive:"
    if archive_marker in response:
        response = response.split(archive_marker, 1)[1].strip()
    if not response:
        return ""
    first_line = next((line.strip() for line in response.splitlines() if line.strip()), "")
    status_only_patterns = (
        "Gmail send succeeded",
        "Gmail send failed",
    )
    if first_line.startswith(status_only_patterns):
        return ""
    if "Daily AI Briefing" not in response and "Daily AI briefing" not in response:
        return ""
    return response


def extract_numbered_section(response: str, section_number: int) -> list[str]:
    """Return non-empty lines from a numbered section despite harmless Markdown variants."""
    lines = response.splitlines()
    section_pattern = re.compile(r"^#{0,6}\s*(?:\*\*)?(\d+)\.\s+")
    inside = False
    section_lines: list[str] = []
    for raw_line in lines:
        line = raw_line.strip()
        match = section_pattern.match(line)
        if match:
            if inside and int(match.group(1)) != section_number:
                break
            if int(match.group(1)) == section_number:
                inside = True
                continue
        if inside and line:
            section_lines.append(line)
    return section_lines


def ai_signal_blocks(lines: list[str]) -> list[str]:
    """Extract 2–3 signal blocks from old bullet or newer bold-heading brief formats."""
    blocks: list[str] = []
    current: list[str] = []
    for line in lines:
        is_heading = line.startswith("**") and line.endswith("**")
        if is_heading:
            if current:
                blocks.append("\n".join(current))
            current = [line]
        elif current:
            current.append(line)
        elif line.startswith("- "):
            blocks.append(line.removeprefix("- ").strip())
    if current:
        blocks.append("\n".join(current))
    return blocks


def ai_signal_title(signal: str) -> str:
    text = markdown_to_plain_text(signal)
    text = re.sub(r"\s+Source:\s+.*$", "", text)
    text = re.split(r"\s+—\s+credible because\s+|\s+Source:\s+", text, maxsplit=1)[0]
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -—.;")
    return truncate(text, 105)


def markdown_to_plain_text(value: str) -> str:
    """Flatten cron-output markdown so site cards match RSS story cards."""
    value = re.sub(r"\[([^\]]+)\]\(https?://[^)\s]+\)", r"\1", value)
    value = re.sub(r"(?:\*\*|__|`)", "", value)
    return re.sub(r"\s+", " ", value).strip()


def ai_signal_source_url(signal: str) -> str:
    source_match = re.search(r"\[Source:[^\]]*\]\((https?://[^)\s]+)\)", signal, re.IGNORECASE)
    fallback_match = re.search(r"https?://\S+", signal)
    match = source_match or fallback_match
    return match.group(1 if source_match else 0).rstrip(").,;") if match else "https://dustincole-data.github.io/dustin-ai-playground/"


def ai_source_label(signal: str, published: datetime) -> str:
    url_match = re.search(r"https?://([^/\s]+)", signal)
    if not url_match:
        return f"Hermes AI scan · {local_label(published)}"
    host = url_match.group(1).removeprefix("www.")
    return f"{host} · {local_label(published)}"


def ai_data_signals(signal: str) -> list[str]:
    text = signal.lower()
    signals: list[str] = []
    for needle, label in [
        ("agent", "agent workflow"),
        ("codex", "Codex / coding agents"),
        ("github", "developer workflow"),
        ("openai", "OpenAI signal"),
        ("anthropic", "Anthropic signal"),
        ("google", "Google AI signal"),
        ("model", "model/tool release"),
        ("safety", "safety / governance"),
        ("workflow", "workflow controls"),
        ("open source", "open-source tooling"),
        ("mcp", "MCP / integration"),
    ]:
        if needle in text and label not in signals:
            signals.append(label)
    return signals[:4] or ["AI operating signal", "source checked"]


def build_ai_signal_articles(response: str, source_file: Path) -> list[dict]:
    """Split the vetted Daily AI Briefing into multiple site cards.

    The old site consumed the whole AI brief as one article, which made the
    morning page look like it had only one repeated AI story. The cron brief
    already has 2–3 vetted signals; expose those as separate articles/cards.
    """
    published = datetime.fromtimestamp(source_file.stat().st_mtime, timezone.utc)
    signals = ai_signal_blocks(extract_numbered_section(response, 1))
    articles: list[dict] = []
    for idx, signal in enumerate(signals[:MAX_ITEMS_PER_BRIEF], start=1):
        source_url = ai_signal_source_url(signal)
        title = ai_signal_title(signal) or f"AI signal {idx}"
        summary = markdown_to_plain_text(signal)
        signal_item = {
            "title": title,
            "summary": summary,
            "publishedLabel": local_label(published),
        }
        fields = enriched_fields("ai", "AI", signal_item, "Hermes Daily AI Brief")
        articles.append({
            "id": f"ai-signal-{source_file.stem}-{idx}",
            "title": title,
            "kicker": "Hermes Daily AI Brief",
            "summary": fields["summary"],
            "emailSummary": truncate(summary, 145),
            "whyItMatters": fields["whyItMatters"],
            "dataSignals": ai_data_signals(signal),
            "sourceLabel": ai_source_label(signal, published),
            "sourceUrl": source_url,
            "googleNewsUrl": None,
            "publishedAt": published.isoformat(),
            "glossary": fields["glossary"],
            "learningPage": fields["learningPage"],
        })
    return articles


def latest_ai_daily_brief() -> tuple[list[dict], bool, list[str]]:
    """Use the vetted Daily AI Briefing output and expose each signal as a card.

    Only briefings younger than AI_BRIEF_MAX_AGE_HOURS qualify; a stale briefing
    is reported as a warning so the RSS track takes over instead of the site
    silently re-serving week-old AI cards.
    """
    if not AI_BRIEF_OUTPUT_DIR.exists():
        return [], False, [f"AI daily brief output directory missing: {AI_BRIEF_OUTPUT_DIR}"]

    files = sorted(AI_BRIEF_OUTPUT_DIR.glob("*.md"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not files:
        return [], False, [f"No AI daily brief outputs found in {AI_BRIEF_OUTPUT_DIR}"]

    age_cutoff = NOW - timedelta(hours=AI_BRIEF_MAX_AGE_HOURS)
    skipped_status_files: list[str] = []
    stale_notes: list[str] = []
    for source_file in files:
        modified = datetime.fromtimestamp(source_file.stat().st_mtime, timezone.utc)
        if modified < age_cutoff:
            stale_notes.append(
                f"AI daily briefing is stale (newest usable candidate {source_file.name} from "
                f"{modified.date()}); using the RSS track instead."
            )
            break
        text = source_file.read_text(encoding="utf-8")
        response = extract_ai_brief_response(text)
        if not response:
            skipped_status_files.append(source_file.name)
            continue

        articles = build_ai_signal_articles(response, source_file)
        if articles:
            return articles, False, []
        skipped_status_files.append(source_file.name)

    notes = stale_notes or [
        f"No usable fresh AI daily briefing signals found in {AI_BRIEF_OUTPUT_DIR}; "
        f"skipped files: {', '.join(skipped_status_files[:5])}"
    ]
    return [], False, notes


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    generated = {
        "generatedAt": NOW.isoformat(),
        "generatedLabel": local_label(NOW),
        "lookbackHours": LOOKBACK_HOURS,
        "briefs": [],
        "errors": [],
    }
    for brief in BRIEFS:
        if brief["id"] == "ai":
            vetted, used_fallback, errors = latest_ai_daily_brief()
            articles = list(vetted)
            if len(articles) < MAX_ITEMS_PER_BRIEF:
                rss_articles, rss_fallback, rss_errors = build_articles(brief)
                errors.extend(rss_errors)
                used_fallback = used_fallback or (not vetted and rss_fallback)
                seen_titles = {normalized_key(a["title"]) for a in articles}
                for article in rss_articles:
                    if len(articles) >= MAX_ITEMS_PER_BRIEF:
                        break
                    if normalized_key(article["title"]) in seen_titles:
                        continue
                    seen_titles.add(normalized_key(article["title"]))
                    articles.append(article)
        else:
            articles, used_fallback, errors = build_articles(brief)
        generated["errors"].extend(errors)
        generated["briefs"].append({
            "id": brief["id"],
            "updatedLabel": "Last 24 hours" if articles and not used_fallback else ("Recent fallback: no qualified 24h items" if articles else "No qualified stories found"),
            "emptyMessage": f"No qualified {brief['name']} stories found in the last {LOOKBACK_HOURS} hours.",
            "articles": articles,
        })

    OUT.write_text(json.dumps(generated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    if OPENAI_KEY:
        print(f"LLM enrichment ({OPENAI_MODEL}): {LLM_STATS['ok']} ok, {LLM_STATS['fail']} fell back to templates")
    else:
        print("LLM enrichment: no API key found, template text used")
    for brief in generated["briefs"]:
        print(f"{brief['id']}: {len(brief['articles'])} articles — {brief['updatedLabel']}")
    if generated["errors"]:
        print("Warnings:")
        for error in generated["errors"][:10]:
            print(f"- {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
