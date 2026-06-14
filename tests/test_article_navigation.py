import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEWSROOM = ROOT / "src" / "pages" / "Newsroom.jsx"


def test_explain_button_links_to_learning_page_instead_of_inline_help():
    source = NEWSROOM.read_text()

    assert "href={`${import.meta.env.BASE_URL}#/learn/${article.id}`}" in source
    assert "Teach me" in source
    assert "ArticleExplainer" not in source
    assert not re.search(r"setExplainerOpen|explainerOpen", source)


def test_newsroom_has_learning_page_renderer():
    source = NEWSROOM.read_text()

    assert "function LearningPage" in source
    assert "lessonSections" in source
    assert "Back to the morning brief" in source
