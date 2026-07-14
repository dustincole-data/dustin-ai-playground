import importlib.util
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "update_morning_briefs.py"
FRONTEND_DATA = ROOT / "src" / "data" / "morningBriefs.js"

spec = importlib.util.spec_from_file_location("update_morning_briefs", SCRIPT)
assert spec is not None and spec.loader is not None
briefs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(briefs)


def rss_item(title, *, summary="Detailed source summary with enough words to avoid thin summary fallback.", source="AP News", hours_ago=2):
    published = briefs.NOW - timedelta(hours=hours_ago)
    return {
        "title": title,
        "source": source,
        "url": f"https://example.com/{title.lower().replace(' ', '-')}",
        "summary": summary,
        "publishedAt": published.isoformat(),
        "publishedLabel": briefs.local_label(published),
    }


def test_generator_defines_all_six_morning_brief_sections():
    ids = [brief["id"] for brief in briefs.BRIEFS]

    assert ids == ["ai", "energy", "humana", "kentucky_healthcare", "analytics", "louisville"]


def test_frontend_renders_all_six_morning_brief_sections():
    source = FRONTEND_DATA.read_text()

    for section_id in ["ai", "energy", "humana", "kentucky_healthcare", "analytics", "louisville"]:
        assert f"id: '{section_id}'" in source


def test_ai_signal_cards_strip_markdown_from_daily_brief_bullets(tmp_path):
    source_file = tmp_path / "daily-ai.md"
    source_file.write_text("placeholder")
    response = """Daily AI Briefing — Tuesday, July 14, 2026 ET

1. Today's actual signal
- **OfficeCLI Gains Traction**: A tool removes the [middleman](https://example.com/middleman) for reports. [Source: GitHub](https://github.com/example/officecli)

2. Dustin relevance
- Useful.
"""

    articles = briefs.build_ai_signal_articles(response, source_file)

    assert articles[0]["title"] == "OfficeCLI Gains Traction: A tool removes the middleman for reports"
    assert articles[0]["summary"] == "OfficeCLI Gains Traction: A tool removes the middleman for reports. Source: GitHub"
    assert articles[0]["sourceUrl"] == "https://github.com/example/officecli"


def test_broad_health_insurance_fallback_runs_only_when_no_humana_items(monkeypatch):
    brief = {
        "id": "humana",
        "name": "Humana / Health Insurance",
        "queries": ["primary-humana-1d"],
        "fallbackQueries": ["primary-humana-7d"],
        "broadFallbackQueries": ["broad-health-insurance-7d"],
    }
    calls = []

    def fake_parse_rss(url):
        calls.append(url)
        if "primary-humana-1d" in url:
            return [rss_item("Humana expands Medicare Advantage analytics program", source="Healthcare Dive")]
        if "broad-health-insurance-7d" in url:
            return [rss_item("US health insurers face new prior authorization rule", source="AP News")]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is False
    assert len(articles) == 1
    assert "Humana" in articles[0]["title"]
    assert all("broad-health-insurance" not in call for call in calls)


def test_broad_health_insurance_fallback_runs_when_no_humana_items(monkeypatch):
    brief = {
        "id": "humana",
        "name": "Humana / Health Insurance",
        "queries": ["primary-humana-1d"],
        "fallbackQueries": ["primary-humana-7d"],
        "broadFallbackQueries": ["broad-health-insurance-7d"],
    }

    def fake_parse_rss(url):
        if "broad-health-insurance-7d" in url:
            return [rss_item("US health insurers face new prior authorization rule", source="AP News")]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is True
    assert len(articles) == 1
    assert articles[0]["title"] == "US health insurers face new prior authorization rule"


def test_humana_primary_query_filters_generic_medicare_advantage_results(monkeypatch):
    brief = next(brief for brief in briefs.BRIEFS if brief["id"] == "humana") | {
        "queries": ["primary-humana-1d"],
        "fallbackQueries": ["primary-humana-7d"],
        "broadFallbackQueries": ["broad-health-insurance-7d"],
    }
    calls = []

    def fake_parse_rss(url):
        calls.append(url)
        if "primary-humana-1d" in url:
            return [
                rss_item("Medicare Advantage insurers face new CMS pressure", source="AP News"),
                rss_item("Humana expands Medicare Advantage analytics program", source="Healthcare Dive"),
            ]
        if "broad-health-insurance-7d" in url:
            return [rss_item("US health insurers face new prior authorization rule", source="AP News")]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is False
    assert [article["title"] for article in articles] == ["Humana expands Medicare Advantage analytics program"]
    assert all("broad-health-insurance" not in call for call in calls)


def test_humana_generic_primary_results_do_not_block_broad_fallback(monkeypatch):
    brief = next(brief for brief in briefs.BRIEFS if brief["id"] == "humana") | {
        "queries": ["primary-humana-1d"],
        "fallbackQueries": ["primary-humana-7d"],
        "broadFallbackQueries": ["broad-health-insurance-7d"],
    }

    def fake_parse_rss(url):
        if "primary-humana" in url:
            return [rss_item("Medicare Advantage insurers face new CMS pressure", source="AP News")]
        if "broad-health-insurance-7d" in url:
            return [rss_item("US health insurers face new prior authorization rule", source="AP News")]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is True
    assert [article["title"] for article in articles] == ["US health insurers face new prior authorization rule"]


def test_kentucky_healthcare_rejects_kentucky_only_non_healthcare_primary_result(monkeypatch):
    brief = next(brief for brief in briefs.BRIEFS if brief["id"] == "kentucky_healthcare") | {
        "queries": ["primary-kentucky-healthcare-1d"],
        "fallbackQueries": [],
        "broadFallbackQueries": ["broad-us-healthcare-7d"],
    }

    def fake_parse_rss(url):
        if "primary-kentucky-healthcare-1d" in url:
            return [rss_item("Kentucky governor announces leadership shakeup", source="AP News")]
        if "broad-us-healthcare-7d" in url:
            return [rss_item("US hospitals face Medicaid funding pressure", source="Healthcare Dive")]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is True
    assert [article["title"] for article in articles] == ["US hospitals face Medicaid funding pressure"]


def test_kentucky_healthcare_accepts_local_healthcare_and_named_provider(monkeypatch):
    brief = next(brief for brief in briefs.BRIEFS if brief["id"] == "kentucky_healthcare") | {
        "queries": ["primary-kentucky-healthcare-1d"],
        "fallbackQueries": [],
        "broadFallbackQueries": ["broad-us-healthcare-7d"],
    }

    def fake_parse_rss(url):
        if "primary-kentucky-healthcare-1d" in url:
            return [
                rss_item("Kentucky hospitals face workforce pressure", source="Healthcare Dive"),
                rss_item("Norton Healthcare expands outpatient clinic", source="WDRB"),
            ]
        return []

    monkeypatch.setattr(briefs, "parse_rss", fake_parse_rss)
    monkeypatch.setattr(briefs, "resolve_google_news_url", lambda url: url)
    monkeypatch.setattr(briefs, "fetch_article_description", lambda url: "")

    articles, used_fallback, errors = briefs.build_articles(brief)

    assert errors == []
    assert used_fallback is False
    assert [article["title"] for article in articles] == [
        "Kentucky hospitals face workforce pressure",
        "Norton Healthcare expands outpatient clinic",
    ]
