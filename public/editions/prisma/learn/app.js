/* PRISMA · Teach me — standalone explainer page.
   Reads the same live morning-briefs.json, finds the story by ?id=,
   renders learningPage.explanationText + glossary + the story recap,
   tinted by the story's section hue. No React, no old newsroom. */

const SECTION_HUE = {
  ai: { deep: 'oklch(41% 0.17 295)', mid: 'oklch(62% 0.19 295)', wash: 'oklch(96.5% 0.02 295)', name: 'AI' },
  energy: { deep: 'oklch(48% 0.13 70)', mid: 'oklch(74% 0.14 78)', wash: 'oklch(96.5% 0.03 80)', name: 'Energy & Utilities' },
  humana: { deep: 'oklch(43% 0.12 155)', mid: 'oklch(66% 0.15 155)', wash: 'oklch(96.5% 0.025 155)', name: 'Humana & Health' },
  kentucky_healthcare: { deep: 'oklch(43% 0.1 200)', mid: 'oklch(67% 0.12 200)', wash: 'oklch(96.5% 0.025 200)', name: 'Kentucky Healthcare' },
  analytics: { deep: 'oklch(43% 0.13 250)', mid: 'oklch(63% 0.14 250)', wash: 'oklch(96.5% 0.025 250)', name: 'Analytics' },
  louisville: { deep: 'oklch(46% 0.18 25)', mid: 'oklch(60% 0.21 27)', wash: 'oklch(96.5% 0.025 25)', name: 'Louisville' },
};

const DATA_PATHS = [
  `../../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function param(name) {
  return new URLSearchParams(location.search).get(name)
    || (location.hash.includes('id=') ? new URLSearchParams(location.hash.split('?')[1] || '').get('id') : null);
}

async function loadData() {
  for (const url of DATA_PATHS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* try next */ }
  }
  return null;
}

function cleanSummary(a) {
  return String(a.summary || '')
    .replace(/\s*Source:\s*\[?[^.\]]+\]?\([^)]*\)\s*$/i, '')
    .replace(/\s*Source:\s*[^.]+$/i, '').trim();
}

function findArticle(data, id) {
  for (const brief of data?.briefs || []) {
    for (const a of brief.articles || []) {
      if (a.id === id) return { article: a, sectionId: brief.id };
    }
  }
  return null;
}

function applyHue(sectionId) {
  const hue = SECTION_HUE[sectionId] || SECTION_HUE.ai;
  const root = document.documentElement.style;
  root.setProperty('--deep', hue.deep);
  root.setProperty('--mid', hue.mid);
  root.setProperty('--wash', hue.wash);
  return hue;
}

function renderTerms(learning, article) {
  const glossary = (learning?.glossary && learning.glossary.length ? learning.glossary : article.glossary) || [];
  const terms = glossary.filter((g) => g.term && g.definition);
  if (!terms.length) return false;
  document.getElementById('termsGrid').innerHTML = terms.map((g) => `
    <article class="term">
      <h3 class="term-name">${esc(g.term)}</h3>
      <p class="term-def">${esc(g.definition)}</p>
      ${g.whyItMatters ? `<p class="term-why">${esc(g.whyItMatters)}</p>` : ''}
    </article>`).join('');
  document.getElementById('terms').hidden = false;
  return true;
}

function render(article, sectionId) {
  const hue = applyHue(sectionId);
  const learning = article.learningPage || {};

  document.title = `${article.title} — Teach me · Prisma`;
  document.getElementById('topbarTag').textContent = hue.name;
  document.getElementById('leadKick').textContent = `Teach me · ${hue.name}`;
  document.getElementById('leadTitle').textContent = article.title || 'This story';
  document.getElementById('leadMeta').textContent = article.sourceLabel || '';

  document.getElementById('meansLabel').textContent = learning.title || 'What this means';
  const explanation = learning.explanationText
    || `${cleanSummary(article)} ${article.whyItMatters || ''}`.trim();
  document.getElementById('meansText').textContent = explanation;

  document.getElementById('recapSum').textContent = cleanSummary(article);
  const why = String(article.whyItMatters || '').trim();
  if (why && !cleanSummary(article).toLowerCase().includes(why.toLowerCase().slice(0, 50))) {
    document.getElementById('recapWhyText').textContent = why;
    document.getElementById('recapWhy').hidden = false;
  }

  renderTerms(learning, article);

  const src = document.getElementById('sourceBtn');
  if (article.sourceUrl) src.href = article.sourceUrl;
  else src.remove();

  document.getElementById('sheet').hidden = false;
}

(async function boot() {
  const id = param('id');
  const data = await loadData();
  const hit = id && data ? findArticle(data, id) : null;
  if (!hit) {
    document.getElementById('fallback').hidden = false;
    return;
  }
  render(hit.article, hit.sectionId);
})();
