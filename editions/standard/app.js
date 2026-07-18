/* THE SIGNAL-STANDARD — edition engine
   Same content contract as the playground newsroom:
   identity line, six briefs, live morning-briefs.json,
   sources, data signals, teach-me links, empty + error states. */

import * as THREE from './vendor/three.module.min.js';

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

(function setFolio() {
  const now = new Date();
  const long = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now);
  document.getElementById('folioDate').textContent = `Louisville, Ky. — ${long}`;
  document.getElementById('folioNo').textContent = `No. ${dayOfYear(now)}`;
})();

/* ---------- data ---------- */

async function loadData() {
  for (const url of DATA_PATHS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* try next path */ }
  }
  return null;
}

/* ---------- render ---------- */

function articleHTML(a, briefName, prevKicker, prevWhy) {
  const teach = a.id ? `<a class="teach" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me&nbsp;→</a>` : '';
  const signals = (a.dataSignals || []).slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join('');
  const why = a.whyItMatters && a.whyItMatters !== prevWhy
    ? `<div class="story-why"><strong>Why it matters</strong>${esc(a.whyItMatters)}</div>` : '';
  const sum = shortSummary(a);
  const kicker = a.kicker || briefName;
  const showKicker = kicker !== prevKicker;
  return `<article class="story">
    ${showKicker ? `<p class="story-kicker">${esc(kicker)}</p>` : ''}
    <h4 class="story-head"><a href="${esc(a.sourceUrl || a.googleNewsUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a></h4>
    ${sum ? `<p class="story-sum">${esc(sum)}</p>` : ''}
    ${why}
    ${signals ? `<div class="story-signals">${signals}</div>` : ''}
    <div class="story-foot"><span class="src">${esc(a.sourceLabel || '')}</span>${teach}</div>
  </article>`;
}

function shortSummary(a) {
  let s = a.summary || '';
  // The feed often prefixes the summary with the headline; trim the echo.
  if (a.title && s.startsWith(a.title.replace(/…$/, '').slice(0, 40))) {
    const cut = s.indexOf(': ');
    if (cut > -1 && cut < 140) s = s.slice(cut + 2);
  }
  s = s.replace(/\s*Source:\s*[^.]+$/i, '');
  if (s.length > 260) s = s.slice(0, 257).trimEnd() + '…';
  return s;
}

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  const sectionsEl = document.getElementById('sections');
  const navEl = document.getElementById('sectionNav');
  const indexEl = document.getElementById('indexList');
  let navHTML = '<a href="#frontpage" class="section-link is-active" data-target="frontpage">Front Page</a>';
  let indexHTML = '';
  let sectionsHTML = '';

  for (const t of TEMPLATES) {
    const brief = byId.get(t.id);
    const articles = brief?.articles || [];
    const updated = brief?.updatedLabel || 'Last 24 hours';
    navHTML += `<a href="#sec-${t.id}" class="section-link" data-target="sec-${t.id}">${esc(t.label)}</a>`;
    indexHTML += `<li><a href="#sec-${t.id}"><span>${esc(t.name)}</span><span class="count">${articles.length} ${articles.length === 1 ? 'item' : 'items'}</span></a></li>`;
    let prevKicker = null; let prevWhy = null;
    const body = articles.length
      ? `<div class="articles">${articles.map((a) => { const h = articleHTML(a, t.name, prevKicker, prevWhy); prevKicker = a.kicker || t.name; prevWhy = a.whyItMatters || prevWhy; return h; }).join('')}</div>`
      : `<p class="brief-empty">${esc(brief?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`;
    sectionsHTML += `<section class="brief" id="sec-${t.id}" aria-labelledby="h-${t.id}">
      <div class="brief-head"><span class="brief-slug">${esc(t.name)}</span><span class="brief-updated">${esc(updated)}</span></div>
      <h3 class="brief-title" id="h-${t.id}">${esc(t.headline)}</h3>
      <p class="brief-deck">${esc(t.deck)}</p>
      ${body}
    </section>`;
  }

  sectionsEl.innerHTML = sectionsHTML;
  navEl.innerHTML = navHTML;
  indexEl.innerHTML = indexHTML;

  // Lede: first article of the first non-empty brief.
  const leadBrief = TEMPLATES.map((t) => ({ t, b: byId.get(t.id) })).find(({ b }) => b?.articles?.length);
  if (leadBrief) {
    const a = leadBrief.b.articles[0];
    document.getElementById('ledeKicker').textContent = `The splash · ${leadBrief.t.name}`;
    document.getElementById('ledeHead').innerHTML =
      `<a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(cleanTitle(a.title))}</a>`;
    document.getElementById('ledeDeck').textContent = shortSummary(a);
    const why = document.getElementById('ledeWhy');
    if (a.whyItMatters) { why.innerHTML = `<strong>Why it matters</strong>${esc(a.whyItMatters)}`; } else { why.remove(); }
    document.getElementById('ledeSrc').innerHTML =
      `${esc(a.sourceLabel || '')}${a.id ? ` · <a href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me →</a>` : ''}`;
  }

  // Secondary front-page items: the next best story from other briefs.
  const others = TEMPLATES
    .filter((t) => t.id !== leadBrief?.t.id)
    .map((t) => ({ t, a: byId.get(t.id)?.articles?.[0] }))
    .filter(({ a }) => a)
    .slice(0, 3);
  document.getElementById('foldMore').innerHTML = others.map(({ t, a }) => `
    <article class="fold-item">
      <p class="fi-kicker">${esc(t.name)}</p>
      <h3><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a></h3>
      <p class="fi-src">${esc((a.sourceLabel || '').split(' · ')[0])}${a.id ? ` · <a href="${LEARN_BASE}${encodeURIComponent(a.id)}" style="color:var(--press)">Teach me →</a>` : ''}</p>
    </article>`).join('');

  // Ticker: latest headline from each brief, doubled for a seamless loop.
  const items = [];
  for (const t of TEMPLATES) {
    const b = byId.get(t.id);
    if (b?.articles?.length) {
      const a = b.articles[0];
      items.push(`<span class="tsep">${esc(t.label)}</span> <a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(cleanTitle(a.title))}</a>`);
    }
  }
  const track = document.getElementById('tickerTrack');
  if (items.length) {
    track.innerHTML = items.concat(items).map((h) => `<span class="titem">${h}</span>`).join('');
    if (!reducedMotion) startTicker(track);
  } else {
    track.innerHTML = '<span class="titem">The wire is quiet this morning.</span>';
  }

  const stamp = data?.generatedLabel ? `Briefs generated ${data.generatedLabel}` : 'Live briefs unavailable';
  document.getElementById('stampLine').textContent = stamp;

  // entrance choreography
  if (!reducedMotion) {
    document.querySelectorAll('.brief').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.animationDelay = `${Math.min(i * 60, 240)}ms`;
    });
    document.querySelector('.fold')?.classList.add('reveal');
  }

  watchSections();
}

function cleanTitle(t) {
  const s = String(t || '');
  // Feed titles are often "Headline: full first sentence…" — keep the headline.
  const cut = s.indexOf(': ');
  if (cut > 20 && cut < 90) return s.slice(0, cut);
  return s.replace(/:\s*$/, '');
}

/* ---------- ticker ---------- */

function startTicker(track) {
  let x = 0; let paused = false;
  const half = () => track.scrollWidth / 2;
  track.closest('.ticker').addEventListener('mouseenter', () => { paused = true; });
  track.closest('.ticker').addEventListener('mouseleave', () => { paused = false; });
  (function step() {
    if (!paused) {
      x -= 0.55;
      if (-x >= half()) x += half();
      track.style.transform = `translateX(${x}px)`;
    }
    requestAnimationFrame(step);
  })();
}

/* ---------- section-nav highlight ---------- */

function watchSections() {
  const links = [...document.querySelectorAll('.section-link')];
  const map = new Map(links.map((l) => [l.dataset.target, l]));
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove('is-active'));
        map.get(e.target.id)?.classList.add('is-active');
      }
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  ['frontpage', ...TEMPLATES.map((t) => `sec-${t.id}`)]
    .map((id) => document.getElementById(id)).filter(Boolean).forEach((el) => obs.observe(el));
}

/* ---------- signal globe (three.js) ---------- */

function initGlobe() {
  const canvas = document.getElementById('globe');
  if (!canvas || typeof THREE === 'undefined') return;
  const mast = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 4.4);

  const group = new THREE.Group();
  scene.add(group);

  // point-sphere
  const R = 1.55;
  const pts = [];
  const N = 900;
  for (let i = 0; i < N; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / N);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    pts.push(new THREE.Vector3(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi),
      R * Math.sin(phi) * Math.sin(theta),
    ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.PointsMaterial({ color: 0x4a6fa5, size: 0.02, transparent: true, opacity: 0.75 });
  group.add(new THREE.Points(geo, mat));

  // wireframe ghost sphere
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.995, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x91a8c8, wireframe: true, transparent: true, opacity: 0.10 }),
  );
  group.add(wire);

  // great-circle arcs = "signals"
  const arcMats = [];
  const randOnSphere = () => {
    const u = Math.random(); const v = Math.random();
    const th = 2 * Math.PI * u; const ph = Math.acos(2 * v - 1);
    return new THREE.Vector3(R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th));
  };
  for (let i = 0; i < 14; i++) {
    const a = randOnSphere(); const b = randOnSphere();
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.25 + Math.random() * 0.35));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const m = new THREE.LineBasicMaterial({ color: 0xc94f2e, transparent: true, opacity: 0 });
    arcMats.push({ m, t: Math.random() * 7 });
    group.add(new THREE.Line(g, m));
  }

  group.rotation.z = 0.18;
  group.position.x = 0;

  function resize() {
    const w = mast.clientWidth; const h = mast.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the globe peeking from behind the masthead type
    const wide = w > 900;
    camera.position.z = wide ? 4.4 : 5.6;
    group.position.y = wide ? -0.1 : 0;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  if (reducedMotion) { renderer.render(scene, camera); return; }

  let last = 0;
  renderer.setAnimationLoop((t) => {
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    group.rotation.y += dt * 0.12;
    for (const a of arcMats) {
      a.t += dt;
      const c = a.t % 7; // 7s cycle: fade in, hold, fade out
      a.m.opacity = c < 1 ? c * 0.5 : c < 2.4 ? 0.5 : c < 3.4 ? (3.4 - c) * 0.5 : 0;
    }
    renderer.render(scene, camera);
  });

  // pause when masthead scrolled away
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { renderer.setAnimationLoop(renderer.getAnimationLoop?.() || null); }
    }
  });
}

/* ---------- boot ---------- */

(async function boot() {
  try { initGlobe(); } catch (e) { console.warn('globe skipped:', e); }
  const data = await loadData();
  if (!data) {
    document.getElementById('wireError').hidden = false;
    document.getElementById('ledeKicker').textContent = 'Service notice';
    document.getElementById('ledeHead').textContent = 'The wire is down this morning';
    document.getElementById('ledeDeck').textContent = 'The live briefs could not be loaded. The presses will try again on your next visit.';
    render({ briefs: [] });
    return;
  }
  render(data);
})();
