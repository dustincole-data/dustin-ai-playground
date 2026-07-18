/* THE DAILY HOLLER — edition engine
   Same content contract as the playground newsroom, at full volume. */

const TEMPLATES = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'The AI Brief', deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health Insurance', deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Health', headline: 'Kentucky Healthcare', deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'The Analytics Brief', deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'The Louisville Brief', deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const LEARN_BASE = 'https://dustincole-data.github.io/dustin-ai-playground/#/learn/';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

(function setEars() {
  const now = new Date();
  const long = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now);
  document.getElementById('earDate').textContent = `Louisville, Ky. — ${long}`;
  document.getElementById('earNo').textContent = `No. ${dayOfYear(now)}`;
})();

/* starburst path */
(function drawBurst() {
  const spikes = 14, outer = 98, inner = 64, cx = 100, cy = 100;
  let d = '';
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }
  document.getElementById('burstPath').setAttribute('d', d + 'Z');
})();

function cleanTitle(t) {
  const s = String(t || '');
  const cut = s.indexOf(': ');
  if (cut > 20 && cut < 90) return s.slice(0, cut);
  return s.replace(/:\s*$/, '');
}

function shortSummary(a, max = 230) {
  let s = a.summary || '';
  if (a.title && s.startsWith(a.title.replace(/…$/, '').slice(0, 40))) {
    const cut = s.indexOf(': ');
    if (cut > -1 && cut < 140) s = s.slice(cut + 2);
  }
  s = s.replace(/\s*Source:\s*[^.]+$/i, '');
  if (s.length > max) s = s.slice(0, max - 3).trimEnd() + '…';
  return s;
}

/* highlight the first clause of "why it matters" like a highlighter pen */
function whyHTML(a) {
  if (!a.whyItMatters) return '';
  const w = a.whyItMatters.replace(/^This matters because\s*/i, '');
  const comma = w.indexOf(',');
  const head = comma > 10 && comma < 90 ? w.slice(0, comma) : w.split(' ').slice(0, 8).join(' ');
  const tail = w.slice(head.length);
  return `<p class="holler-why"><strong>Why it matters:</strong> <mark>${esc(head)}</mark>${esc(tail)}</p>`;
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

function storyHTML(a, briefName, isLead) {
  const teach = a.id ? `<a class="teach" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me!</a>` : '';
  const tags = (a.dataSignals || []).slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join('');
  return `<article class="holler-story${isLead ? ' is-lead' : ''}">
    <span class="story-kick">${esc(a.kicker || briefName)}</span>
    <h4 class="holler-head"><a href="${esc(a.sourceUrl || a.googleNewsUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a></h4>
    <p class="holler-sum">${esc(shortSummary(a, isLead ? 320 : 210))}</p>
    ${isLead ? whyHTML(a) : ''}
    ${tags ? `<div class="holler-tags">${tags}</div>` : ''}
    <div class="holler-foot"><span class="src">${esc(a.sourceLabel || '')}</span>${teach}</div>
  </article>`;
}

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  const pagesEl = document.getElementById('pages');
  const indexEl = document.getElementById('issueIndex');
  let pagesHTML = '';
  let indexHTML = '';

  TEMPLATES.forEach((t, i) => {
    const brief = byId.get(t.id);
    const articles = brief?.articles || [];
    indexHTML += `<li><a href="#page-${t.id}"><span>${esc(t.name)}</span><span class="count">${articles.length} ${articles.length === 1 ? 'story' : 'stories'}</span></a></li>`;
    const body = articles.length
      ? `<div class="stories">${articles.map((a, j) => storyHTML(a, t.name, j === 0)).join('')}</div>`
      : `<p class="page-empty">${esc(brief?.emptyMessage || `Nothing worth hollering about in ${t.name} today.`)}</p>`;
    pagesHTML += `<section class="page-sec" id="page-${t.id}" aria-labelledby="ph-${t.id}">
      <div class="page-rule">
        <span class="page-no">Page ${i + 3}</span>
        <h3 class="page-name" id="ph-${t.id}">${esc(t.headline)}</h3>
        <span class="page-updated">${esc(brief?.updatedLabel || 'Last 24 hours')}</span>
      </div>
      <p class="page-deck">${esc(t.deck)}</p>
      ${body}
    </section>`;
  });

  pagesEl.innerHTML = pagesHTML;
  indexEl.innerHTML = indexHTML;

  /* splash = first article of first non-empty brief */
  const lead = TEMPLATES.map((t) => ({ t, b: byId.get(t.id) })).find(({ b }) => b?.articles?.length);
  if (lead) {
    const a = lead.b.articles[0];
    document.getElementById('splashKicker').textContent = `Extra! ${lead.t.name} news`;
    document.getElementById('splashHead').innerHTML =
      `<a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(cleanTitle(a.title))}</a>`;
    const deck = shortSummary(a, 260);
    const mid = deck.indexOf(',');
    document.getElementById('splashDeck').innerHTML =
      mid > 20 && mid < 120
        ? `<mark>${esc(deck.slice(0, mid))}</mark>${esc(deck.slice(mid))}`
        : esc(deck);
    document.getElementById('splashSrc').innerHTML =
      `${esc(a.sourceLabel || '')}${a.id ? ` · <a href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me!</a>` : ''}`;
  }

  /* inside strip */
  document.getElementById('insideStrip').innerHTML =
    '<span class="inside-label">Inside:</span>' +
    TEMPLATES.map((t, i) =>
      `<a href="#page-${t.id}">${esc(t.label)}<span class="pg">P.${i + 3}</span></a>`).join('');

  /* late wire ticker */
  const items = [];
  for (const t of TEMPLATES) {
    const b = byId.get(t.id);
    if (b?.articles?.length) {
      const a = b.articles[0];
      items.push(`<span class="wsep">★ ${esc(t.label)}</span> <a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(cleanTitle(a.title))}</a>`);
    }
  }
  const track = document.getElementById('tickerTrack');
  if (items.length) {
    track.innerHTML = items.concat(items).map((h) => `<span>${h}</span>`).join('');
    if (!reducedMotion) startTicker(track);
  } else {
    track.innerHTML = '<span>DEAD QUIET ON THE WIRE. SUSPICIOUS.</span>';
  }

  document.getElementById('stampLine').textContent =
    data?.generatedLabel ? `Hot off the wire ${data.generatedLabel}` : 'Live briefs unavailable';

  slamIn();
}

function startTicker(track) {
  let x = 0; let paused = false;
  const half = () => track.scrollWidth / 2;
  const wire = track.closest('.latewire');
  wire.addEventListener('mouseenter', () => { paused = true; });
  wire.addEventListener('mouseleave', () => { paused = false; });
  (function step() {
    if (!paused) {
      x -= 0.8;
      if (-x >= half()) x += half();
      track.style.transform = `translateX(${x}px)`;
    }
    requestAnimationFrame(step);
  })();
}

/* ---------- motion: slam-ins (enhance-only) ---------- */

function slamIn() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.from('.splash-plate', {
    y: 60, opacity: 0, rotation: -1.2, duration: 0.7, ease: 'expo.out', delay: 0.15,
  });
  gsap.from('.mast-logo', { scale: 1.18, opacity: 0, duration: 0.55, ease: 'expo.out' });

  document.querySelectorAll('.page-sec').forEach((sec) => {
    const stories = sec.querySelectorAll('.holler-story');
    gsap.from(stories, {
      y: 34, opacity: 0, rotation: () => gsap.utils.random(-1.6, 1.6),
      duration: 0.5, ease: 'expo.out', stagger: 0.06,
      immediateRender: false,
      scrollTrigger: { trigger: sec, start: 'top 78%', once: true },
    });
  });

  /* subtle 3D tilt on the splash photo */
  const photo = document.getElementById('splashPhoto');
  const img = photo?.querySelector('img');
  if (photo && img && matchMedia('(pointer: fine)').matches) {
    photo.style.perspective = '900px';
    photo.addEventListener('mousemove', (e) => {
      const r = photo.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(img, { rotationY: dx * 4, rotationX: -dy * 3, scale: 1.03, transformOrigin: 'center', duration: 0.5, ease: 'power2.out' });
    });
    photo.addEventListener('mouseleave', () => {
      gsap.to(img, { rotationY: 0, rotationX: 0, scale: 1, duration: 0.6, ease: 'power2.out' });
    });
  }

  /* failsafe: if anything is still hidden after 2s (headless / tab-hidden), show it */
  setTimeout(() => {
    document.querySelectorAll('.holler-story, .splash-plate, .mast-logo').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2000);
}

/* ---------- boot ---------- */

(async function boot() {
  const data = await loadData();
  if (!data) {
    document.getElementById('wireError').hidden = false;
    render({ briefs: [] });
    return;
  }
  render(data);
})();
