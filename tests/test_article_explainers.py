import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "update_morning_briefs.py"
spec = importlib.util.spec_from_file_location("update_morning_briefs", SCRIPT)
assert spec is not None and spec.loader is not None
briefs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(briefs)


def test_builds_plain_language_explainer_for_energy_article():
    item = {
        "title": "Kentucky data center raises power demand and rate questions",
        "summary": "A proposed data center could increase electricity demand and require grid upgrades paid through future utility rates.",
    }

    explainer = briefs.article_explainer("energy", item, "Utility Dive")

    assert explainer["headline"] == "What this means in normal terms"
    assert "data center" in explainer["plainEnglish"].lower()
    assert "who pays" in explainer["plainEnglish"].lower()
    assert "Why it matters" in explainer["sections"]
    assert "What to watch" in explainer["sections"]


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
