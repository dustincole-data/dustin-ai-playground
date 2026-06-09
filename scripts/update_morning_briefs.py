#!/usr/bin/env python3
"""Generate DustinColeData Morning Briefs from free RSS/Google News feeds.

No paid API keys. Outputs public/data/morning-briefs.json.
Only dated, source-linked items from the last LOOKBACK_HOURS are treated as news.
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
AI_BRIEF_OUTPUT_DIR = Path("/home/hermes/.hermes/cron/output/de4414aaf746")
USER_AGENT = "Mozilla/5.0 (compatible; DustinColeDataMorningBrief/1.0; +https://dustincoledata.com)"

NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(hours=LOOKBACK_HOURS)
LOCAL_TZ = ZoneInfo("America/New_York")

GOOGLE_NEWS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

BRIEFS = [
    {
        "id": "ai",
        "name": "AI / Analytics",
        "headline": "AI & Analytics Brief",
        # The AI section is populated from the vetted Daily AI Briefing output,
        # not the old generic AI RSS/news-card pipeline.
        "queries": [],
        "fallbackQueries": [],
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
]

GLOSSARY = {
    "AMI": "Advanced metering infrastructure: smart meters plus the communications and data systems around them.",
    "KPSC": "Kentucky Public Service Commission, the state regulator for investor-owned utilities in Kentucky.",
    "PSC": "Public Service Commission, a state utility regulator.",
    "MW": "Megawatt: a unit of electric demand or generation capacity.",
    "GW": "Gigawatt: 1,000 megawatts of electric demand or generation capacity.",
    "interconnection": "The process for connecting a generator, data center, or other large load to the electric grid.",
    "NIL": "Name, image, and likeness compensation for college athletes.",
    "transfer portal": "The NCAA system where athletes signal intent to transfer and can be recruited by other schools.",
    "NL-to-SQL": "Natural-language-to-SQL: asking a data question in plain English and having software generate a SQL query.",
    "agentic": "AI software that can plan and take steps toward a task instead of only answering one prompt.",
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
]


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


def resolve_google_news_url(source_url: str) -> str:
    decoded = decode_google_news_url(source_url)
    if decoded != source_url:
        return decoded

    parsed = urllib.parse.urlparse(source_url)
    path_parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc != "news.google.com" or "articles" not in path_parts:
        return source_url

    encoded = path_parts[-1]
    payload = (
        '[[["Fbv4je","[\\"garturlreq\\",[[\\"en-US\\",\\"US\\",[\\"FINANCE_TOP_INDICES\\",\\"WEB_TEST_1_0_0\\"],'
        'null,null,1,1,\\"US:en\\",null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],'
        '\\"en-US\\",\\"US\\",1,[2,3,4,8],1,0,\\"655000234\\",0,0,null,0],\\"'
        + encoded
        + '\\"]",null,"generic"]]]'
    )
    req = urllib.request.Request(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
        data=("f.req=" + urllib.parse.quote(payload)).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "Referer": "https://news.google.com/",
        },
        method="POST",
    )
    try:
        body = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "ignore")
    except Exception:
        return source_url
    marker = '[\\"garturlres\\",\\"'
    if marker not in body:
        return source_url
    tail = body.split(marker, 1)[1]
    url = tail.split('\\",', 1)[0]
    url = bytes(url, "utf-8").decode("unicode_escape")
    return url if url.startswith("http") else source_url


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
            if len(description.split()) >= 10:
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
    return score


def why_matters(brief_id: str, item: dict) -> str:
    title = item["title"]
    text = f"{title} {item.get('summary', '')}".lower()
    if brief_id == "energy":
        if any(term in text for term in ["lg&e", "kentucky utilities", "louisville gas", "ppl"]):
            return "This is close to Dustin’s utility analytics world: it may affect metering, reliability, customer impact, rate context, regulatory reporting, or the data products leaders need to trust."
        if "data center" in text or "power demand" in text:
            return "Data-center load can reshape utility forecasts, infrastructure plans, rate design, reliability risk, and the analytics needed to separate real demand from speculation."
        return "Energy and utility stories can point to operational pressure, customer bill impacts, reliability risks, and governance needs around utility data."
    if brief_id == "ai":
        return "This matters because it could affect practical analytics automation, governed self-service, agentic workflows, or ideas Dustin can test and write about."
    if "transfer" in text or "nil" in text:
        return "Portal and NIL churn can create fast fanbase mood swings and source-backed Fanbase Weather angles without inventing reactions."
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
    }[brief_id]
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
        flags = re.IGNORECASE if term.islower() or "-" in term else 0
        if re.search(rf"\b{re.escape(term)}\b", text, flags):
            terms.append({"term": term, "definition": definition})
    return terms[:4]


def build_articles(brief: dict) -> tuple[list[dict], bool, list[str]]:
    seen: set[str] = set()
    articles: list[dict] = []
    errors: list[str] = []
    used_fallback = False

    def collect(queries: list[str], fallback: bool = False) -> None:
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
                    text_for_filter = f"{item['title']} {item.get('summary', '')} {item.get('source', '')}".lower()
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
                    seen.add(key)
                    item["score"] = score
                    articles.append(item)
            except Exception as exc:
                errors.append(f"{brief['id']} query failed: {exc}")

    collect(brief["queries"], fallback=False)
    if not articles:
        collect(brief.get("fallbackQueries", []), fallback=True)

    articles.sort(key=lambda x: (x.get("score", 0), x.get("publishedAt", "")), reverse=True)
    output = []
    for i, item in enumerate(articles[:MAX_ITEMS_PER_BRIEF], start=1):
        source_label = item["source"] if item["source"] != "Source" else "Open source"
        source_url = resolve_google_news_url(item["url"])
        page_description = fetch_article_description(source_url)
        summary_item = item
        if page_description and len(page_description.split()) > len(clean_text(item.get("summary", "")).split()):
            summary_item = {**item, "summary": page_description}
        summary = morning_brief_summary(brief["id"], summary_item, source_label)
        output.append({
            "id": f"{brief['id']}-{i}-{abs(hash(item['url'])) % 100000}",
            "title": item["title"],
            "kicker": source_label,
            "summary": summary,
            "emailSummary": email_brief_summary(brief["id"], summary_item, source_label),
            "whyItMatters": why_matters(brief["id"], item),
            "dataSignals": data_signals(brief["id"], item),
            "sourceLabel": f"{source_label} · {item['publishedLabel']}",
            "sourceUrl": source_url,
            "googleNewsUrl": item["url"] if source_url != item["url"] else None,
            "publishedAt": item["publishedAt"],
            "glossary": glossary_terms(item),
        })
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


def latest_ai_daily_brief() -> tuple[list[dict], bool, list[str]]:
    """Use the vetted Daily AI Briefing output, not the old AI RSS section."""
    if not AI_BRIEF_OUTPUT_DIR.exists():
        return [], False, [f"AI daily brief output directory missing: {AI_BRIEF_OUTPUT_DIR}"]

    files = sorted(AI_BRIEF_OUTPUT_DIR.glob("*.md"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not files:
        return [], False, [f"No AI daily brief outputs found in {AI_BRIEF_OUTPUT_DIR}"]

    skipped_status_files: list[str] = []
    for source_file in files:
        text = source_file.read_text(encoding="utf-8")
        response = extract_ai_brief_response(text)
        if not response:
            skipped_status_files.append(source_file.name)
            continue

        title_line = next((line.strip() for line in response.splitlines() if line.strip()), "Daily AI Briefing")
        published = datetime.fromtimestamp(source_file.stat().st_mtime, timezone.utc)
        article = {
            "id": f"ai-daily-{source_file.stem}",
            "title": title_line,
            "kicker": "Hermes Daily AI Brief",
            "summary": response,
            "whyItMatters": "This is the vetted Daily AI Briefing output created for Dustin, replacing the old generic AI RSS/news-card section.",
            "dataSignals": [],
            "sourceLabel": f"Hermes Daily AI Brief · {local_label(published)}",
            "sourceUrl": "https://dustincole-data.github.io/dustin-ai-playground/",
            "googleNewsUrl": None,
            "publishedAt": published.isoformat(),
            "glossary": [],
        }
        return [article], False, []

    skipped = ", ".join(skipped_status_files[:5])
    return [], False, [f"No usable AI daily briefing body found in {AI_BRIEF_OUTPUT_DIR}; skipped status-only files: {skipped}"]


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
            articles, used_fallback, errors = latest_ai_daily_brief()
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
    for brief in generated["briefs"]:
        print(f"{brief['id']}: {len(brief['articles'])} articles — {brief['updatedLabel']}")
    if generated["errors"]:
        print("Warnings:")
        for error in generated["errors"][:10]:
            print(f"- {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
