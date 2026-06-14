import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "update_morning_briefs.py"
spec = importlib.util.spec_from_file_location("update_morning_briefs", SCRIPT)
assert spec is not None and spec.loader is not None
briefs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(briefs)


def test_builds_article_specific_learning_page_for_energy_article():
    item = {
        "title": "Kentucky data center raises power demand and rate questions",
        "summary": "A proposed data center could increase electricity demand and require grid upgrades paid through future utility rates.",
    }

    page = briefs.article_learning_page("energy", item, "Utility Dive")

    assert page["title"] == "What this means"
    assert "explanationText" in page
    assert "data center" in page["explanationText"]
    assert "ratepayer" in page["explanationText"]
    assert "utility rates" in page["explanationText"]
    assert "article" not in page["explanationText"].lower()
    assert "source" not in page["explanationText"].lower()
    assert 70 <= len(page["explanationText"].split()) <= 190
    glossary_terms = [entry["term"] for entry in page["glossary"]]
    assert "data center" in glossary_terms
    assert "ratepayer" in glossary_terms
    assert "storySnapshot" not in page
    assert "lessonText" not in page
    assert "lessonSections" not in page
    assert "concepts" not in page


def test_builds_term_cards_from_article_text():
    item = {
        "title": "Agentic AI workflow adds MCP support",
        "summary": "The model can use MCP to connect tools into an agentic workflow for business automation.",
    }

    terms = briefs.explainer_terms(item)

    labels = [term["term"] for term in terms]
    assert "agentic" in labels
    assert "MCP" in labels
    assert all(term["definition"] for term in terms)
