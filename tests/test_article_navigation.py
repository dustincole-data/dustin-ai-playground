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
    assert "explanationText" in source
    assert "page.glossary.map" in source
    assert "Back to the morning brief" in source
    assert "Story snapshot" not in source
    assert "Now read the source" not in source
    assert "lessonText" not in source
    assert "lessonSections" not in source
    assert "concepts.map" not in source


def test_ai_stories_use_the_same_article_cards_and_columns_as_every_other_section():
    source = NEWSROOM.read_text()

    assert "function DailyAiBriefCard" not in source
    assert "article.id?.startsWith('ai-daily-')" not in source
    assert "brief.id === 'ai' ? 'md:grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'" not in source
    assert 'className="grid gap-2 md:grid-cols-2 xl:grid-cols-3"' in source
