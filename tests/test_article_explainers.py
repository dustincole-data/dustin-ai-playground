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

    assert page["title"].startswith("Learn this story")
    assert "Kentucky data center" in page["storySnapshot"]
    assert len(page["lessonSections"]) >= 4
    section_titles = [section["title"] for section in page["lessonSections"]]
    assert "First, what happened?" in section_titles
    assert "Concepts you need" in section_titles
    assert "How to read this article" in section_titles
    assert "Questions to ask next" in section_titles
    concept_terms = [concept["term"] for concept in page["concepts"]]
    assert "data center" in concept_terms
    assert "ratepayer" in concept_terms
    assert all(section["body"] != "This is a practical AI update." for section in page["lessonSections"])


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
