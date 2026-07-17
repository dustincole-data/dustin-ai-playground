/* THE NIGHT DESK — overnight wire room engine
   Same content contract as the playground newsroom: identity line,
   six briefs, live morning-briefs.json, filters, sources, signals,
   glossary/learning briefings. */

import * as THREE from './vendor/three.module.min.js';

const TEMPLATES = [
  { id: 'ai', name: 'AI', channel: 'AI WIRE', headline: 'AI', deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', channel: 'ENERGY WIRE', headline: 'Energy / Utilities', deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', channel: 'PAYER WIRE', headline: 'Humana / Health Insurance', deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', channel: 'CARE WIRE', headline: 'Kentucky Healthcare', deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', channel: 'DATA WIRE', headline: 'Analytics', deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', channel: 'LOCAL WIRE', headline: 'Louisville, Kentucky', deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { active: 'all', briefs: [] };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const truncate = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };

function fmtStamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  }).format(d);
}

/* ---------- clocks ---------- */

function tickClocks() {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  document.getElementById('clockET').textContent = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'America/New_York' }).format(now);
  document.getElementById('clockUTC').textContent = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(now);
}
tickClocks();
setInterval(tickClocks, 1000);

/* ---------- data ---------- */

async function loadData() {
  for (const url of DATA_PATHS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.json();
    } catch { /* next */ }
  }
  return null;
}

function mergeBriefs(data) {
  const live = new Map((data?.briefs ?? []).map((b) => [b.id, b]));
  return TEMPLATES.map((t) => {
    const l = live.get(t.id) ?? {};
    return {
      ...t,
      updatedLabel: l.updatedLabel ?? 'No feed loaded yet',
      emptyMessage: l.emptyMessage ?? `No qualified ${t.name} stories found.`,
      articles: Array.isArray(l.articles) ? l.articles : [],
    };
  });
}

/* ---------- render ---------- */

function dispatchHTML(article, brief, idx) {
  const pri = idx === 0 ? 'URGENT' : 'ROUTINE';
  const priClass = idx === 0 ? 'slug-pri pri-urgent' : 'slug-pri';
  const tags = (article.dataSignals ?? []).slice(0, 3);
  const hasBriefing = article.learningPage || (article.glossary ?? []).length > 0;
  return `
  <article class="dispatch">
    <p class="dispatch-slug">
      <span class="${priClass}">${pri}</span>
      <span>// ${esc(brief.channel)}</span>
      <span>// ${esc(article.sourceLabel ?? article.kicker ?? 'WIRE')}</span>
    </p>
    <h4 class="dispatch-title"><a href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">${esc(article.title)}</a></h4>
    <p class="dispatch-summary">${esc(firstSentences(article.summary, 2))}</p>
    ${article.whyItMatters ? `<p class="dispatch-note"><strong>DESK NOTE //</strong> ${esc(article.whyItMatters)}</p>` : ''}
    <div class="dispatch-meta">
      <a class="dispatch-src" href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">OPEN SOURCE ↗</a>
      ${tags.length ? `<span class="dispatch-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}
      ${hasBriefing ? `<button class="dispatch-learn" type="button" data-learn="${esc(article.id)}">TEACH ME</button>` : ''}
    </div>
  </article>`;
}

function firstSentences(text, n) {
  if (!text) return '';
  const parts = String(text).split(/(?<=\.)\s+/);
  return parts.slice(0, n).join(' ');
}

function sectionHTML(brief) {
  return `
  <section class="wire-section" data-brief="${brief.id}" aria-labelledby="wire-${brief.id}">
    <div class="wire-head">
      <h3 class="wire-name" id="wire-${brief.id}">${esc(brief.headline)}</h3>
      <span class="wire-updated">UPDATED: ${esc(brief.updatedLabel).toUpperCase()}</span>
    </div>
    <p class="wire-deck">${esc(brief.deck)}</p>
    ${brief.articles.length
      ? brief.articles.map((a, i) => dispatchHTML(a, brief, i)).join('')
      : `<div class="wire-empty"><strong>CHANNEL SILENT</strong>${esc(brief.emptyMessage)} This channel stays empty instead of showing generic trackers or old placeholder content.</div>`}
  </section>`;
}

function renderStream() {
  const root = document.getElementById('streamRoot');
  const visible = state.active === 'all' ? state.briefs : state.briefs.filter((b) => b.id === state.active);
  root.innerHTML = visible.map(sectionHTML).join('');
  wireBriefingButtons();
  if (!reducedMotion && window.gsap) {
    gsap.from(root.querySelectorAll('.dispatch, .wire-head, .wire-deck'), {
      opacity: 0, y: 14, duration: 0.45, ease: 'power2.out', stagger: 0.035, clearProps: 'all',
    });
  }
}

function renderChannels() {
  const nav = document.getElementById('channelNav');
  nav.querySelectorAll('button').forEach((b) => b.remove());
  const mk = (id, label, count) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(state.active === id));
    btn.innerHTML = `<span>${esc(label)}</span><span class="ch-count">${count != null ? String(count).padStart(2, '0') : '—'}</span>`;
    btn.addEventListener('click', () => {
      state.active = id;
      renderChannels();
      renderStream();
    });
    return btn;
  };
  const total = state.briefs.reduce((n, b) => n + b.articles.length, 0);
  nav.appendChild(mk('all', 'ALL WIRES', total || null));
  state.briefs.forEach((b) => nav.appendChild(mk(b.id, b.channel, b.articles.length || null)));
}

/* ---------- briefing overlay ---------- */

let lastFocus = null;

function openBriefing(article) {
  const overlay = document.getElementById('briefing');
  const title = document.getElementById('brTitle');
  const body = document.getElementById('brBody');
  const page = article.learningPage;
  title.textContent = page?.title ?? article.title;
  let html = '';
  if (page?.explanationText) html += `<p class="briefing-lede">${esc(page.explanationText)}</p>`;
  const glossary = page?.glossary ?? article.glossary ?? [];
  if (glossary.length) {
    html += `<h3 class="briefing-terms-title">Terms to know</h3><dl>`;
    for (const g of glossary) {
      html += `<div class="briefing-term"><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>${g.whyItMatters ? `<dd class="why"><strong>WHY IT MATTERS //</strong> ${esc(g.whyItMatters)}</dd>` : ''}</div>`;
    }
    html += `</dl>`;
  }
  body.innerHTML = html;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.briefing-close').focus();
  if (!reducedMotion && window.gsap) {
    gsap.fromTo('.briefing-panel', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'expo.out' });
    gsap.fromTo('.briefing-backdrop', { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' });
  }
}

function closeBriefing() {
  document.getElementById('briefing').hidden = true;
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

function wireBriefingButtons() {
  document.querySelectorAll('[data-learn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const article = state.briefs.flatMap((b) => b.articles).find((a) => a.id === btn.dataset.learn);
      if (article) openBriefing(article);
    });
  });
}

document.getElementById('briefing').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeBriefing();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('briefing').hidden) closeBriefing();
});

/* ---------- typed incoming wire ---------- */

function startTypedWire(headlines) {
  const el = document.getElementById('typedWire');
  if (!headlines.length) { el.textContent = 'AWAITING THE MORNING SCAN…'; return; }
  let idx = 0;
  if (reducedMotion) {
    el.textContent = truncate(headlines[0].toUpperCase(), 90);
    setInterval(() => {
      idx = (idx + 1) % headlines.length;
      el.textContent = truncate(headlines[idx].toUpperCase(), 90);
    }, 5000);
    return;
  }
  function typeNext() {
    const text = truncate(headlines[idx].toUpperCase(), 90);
    idx = (idx + 1) % headlines.length;
    let i = 0;
    el.textContent = '';
    const t = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(t);
        setTimeout(() => {
          el.textContent = '';
          setTimeout(typeNext, 350);
        }, 2600);
      }
    }, 22);
  }
  typeNext();
}

/* ---------- 3D globe ---------- */

function latLonToVec3(lat, lon, r) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.sin(lambda),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.cos(lambda)
  );
}

const WORLD_POINTS = [
  [51.5, -0.12], [48.85, 2.35], [52.52, 13.4], [40.7, -74.0], [37.77, -122.4],
  [35.68, 139.69], [1.35, 103.82], [19.07, 72.88], [-33.87, 151.2], [55.75, 37.61],
  [39.9, 116.4], [-23.55, -46.63], [30.04, 31.24], [43.65, -79.38], [41.88, -87.63],
  [29.76, -95.37], [47.6, -122.33], [33.75, -84.39], [42.36, -71.06], [25.76, -80.19],
  [59.33, 18.07], [52.37, 4.9], [37.57, 126.98], [-1.29, 36.82], [31.23, 121.47],
];
const LOUISVILLE = [38.25, -85.76];

function glowTexture(colorInner, colorOuter) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rad.addColorStop(0, colorInner);
  rad.addColorStop(0.4, colorOuter);
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function initGlobe() {
  const canvas = document.getElementById('globeCanvas');
  if (!canvas || !window.WebGLRenderingContext) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch { return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 100);
  camera.position.set(0, 0.15, 7.2);

  const globe = new THREE.Group();
  scene.add(globe);
  const R = 2.35;

  /* point-cloud sphere (fibonacci) */
  const N = 2400;
  const pts = new Float32Array(N * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts[i * 3] = Math.cos(theta) * rad * R;
    pts[i * 3 + 1] = y * R;
    pts[i * 3 + 2] = Math.sin(theta) * rad * R;
  }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const ptsMat = new THREE.PointsMaterial({
    color: 0x5d6b85, size: 0.022, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
  });
  globe.add(new THREE.Points(ptsGeo, ptsMat));

  /* graticule */
  const gratMaterial = new THREE.LineBasicMaterial({ color: 0x46506a, transparent: true, opacity: 0.22 });
  const circlePts = (fn) => {
    const arr = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      arr.push(fn(a));
    }
    return arr;
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    const phi = (lat * Math.PI) / 180;
    const r = R * Math.cos(phi), y = R * Math.sin(phi);
    const geo = new THREE.BufferGeometry().setFromPoints(circlePts((a) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)));
    globe.add(new THREE.Line(geo, gratMaterial));
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const lam = (lon * Math.PI) / 180;
    const geo = new THREE.BufferGeometry().setFromPoints(circlePts((a) => {
      const v = new THREE.Vector3(0, Math.sin(a) * R, Math.cos(a) * R);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), lam);
      return v;
    }));
    globe.add(new THREE.Line(geo, gratMaterial));
  }

  /* Louisville marker */
  const lou = latLonToVec3(LOUISVILLE[0], LOUISVILLE[1], R);
  const louSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,214,140,1)', 'rgba(240,163,60,0.5)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  louSprite.position.copy(lou.clone().multiplyScalar(1.01));
  louSprite.scale.setScalar(0.42);
  globe.add(louSprite);

  /* arcs */
  const ARC_COUNT = 7;
  const arcMatBase = new THREE.LineBasicMaterial({
    color: 0xf0a33c, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const headTex = glowTexture('rgba(255,230,180,1)', 'rgba(240,163,60,0.6)');
  const arcs = [];
  function makeArc() {
    const from = WORLD_POINTS[Math.floor(Math.random() * WORLD_POINTS.length)];
    const A = latLonToVec3(from[0], from[1], R);
    const B = lou.clone();
    const mid = A.clone().add(B).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.35 + Math.random() * 0.35));
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const points = curve.getPoints(90);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, arcMatBase.clone());
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: headTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    head.scale.setScalar(0.16);
    head.visible = false;
    globe.add(line, head);
    return { line, head, points, t: -Math.random() * 1.5, speed: 0.35 + Math.random() * 0.3 };
  }
  for (let i = 0; i < ARC_COUNT; i++) arcs.push(makeArc());

  function resetArc(arc) {
    globe.remove(arc.line, arc.head);
    arc.line.geometry.dispose();
    const next = makeArc();
    Object.assign(arc, next);
  }

  /* orientation: bring Louisville (lon -85.76) to face the camera (+z) */
  const BASE_Y = 1.497;
  globe.rotation.y = BASE_Y;
  globe.rotation.x = 0.42;

  /* desktop: shift globe right; mobile: center */
  function layout() {
    const wide = window.innerWidth > 900;
    globe.position.x = wide ? 1.8 : 0;
    globe.position.y = wide ? -0.1 : 0.6;
    const scale = wide ? 1 : 0.78;
    globe.scale.setScalar(scale);
    ptsMat.opacity = wide ? 0.85 : 0.4;
  }
  layout();
  window.addEventListener('resize', layout);

  /* drag to spin */
  let vel = 0, dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    vel += (e.clientX - lastX) * 0.00035;
    lastX = e.clientX;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * devicePixelRatio) || canvas.height !== Math.floor(h * devicePixelRatio)) {
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.02 }).observe(canvas);

  const clock = new THREE.Clock();
  let sway = 0, dragOffset = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    resize();
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) {
      sway += dt;
      dragOffset = (dragOffset + vel) * 0.985; /* eases back home over time */
      vel *= 0.9;
      globe.rotation.y = BASE_Y + Math.sin(sway * 0.12) * 0.2 + dragOffset * 40;
      louSprite.scale.setScalar(0.42 + Math.sin(sway * 2.2) * 0.07);
      for (const arc of arcs) {
        arc.t += dt * arc.speed;
        if (arc.t < 0) continue;
        const total = arc.points.length;
        const head = Math.min(1, arc.t) * total;
        const tail = Math.max(0, arc.t - 0.45) * total;
        arc.line.geometry.setDrawRange(Math.floor(tail), Math.max(2, Math.floor(head - tail)));
        const hi = Math.min(total - 1, Math.floor(head));
        arc.head.visible = arc.t > 0.02 && arc.t < 1.02;
        if (arc.head.visible) arc.head.position.copy(arc.points[hi]);
        arc.line.material.opacity = arc.t > 1 ? Math.max(0, 0.75 - (arc.t - 1) * 1.6) : 0.75;
        if (arc.t > 1.6) resetArc(arc);
      }
    }
    renderer.render(scene, camera);
  }
  resize();
  renderer.render(scene, camera);
  frame();
}

/* ---------- entrance ---------- */

function entrance() {
  if (reducedMotion || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.hero-slug', { opacity: 0, x: -18, duration: 0.6, clearProps: 'all' })
    .from('.hero-title', { opacity: 0, y: 40, duration: 0.9, clearProps: 'all' }, '-=0.3')
    .from('.hero-standfirst, .hero-typed, .hero-meta', { opacity: 0, y: 16, duration: 0.6, stagger: 0.1, clearProps: 'all' }, '-=0.5')
    .from('.orders-grid > *', { opacity: 0, y: 20, duration: 0.7, stagger: 0.12, clearProps: 'all' }, '-=0.3');
}

/* ---------- boot ---------- */

(async function boot() {
  entrance();
  initGlobe();

  const data = await loadData();
  state.briefs = mergeBriefs(data);

  const lamp = document.getElementById('feedLamp');
  const compiled = document.getElementById('compiledLine');
  if (data) {
    compiled.textContent = `FEED: LIVE — COMPILED ${(fmtStamp(data.generatedAt) ?? data.generatedLabel ?? '').toUpperCase()}`;
    document.getElementById('lookbackLine').textContent = `${data.lookbackHours ?? 24}H`;
  } else {
    lamp.classList.add('lamp-err');
    compiled.textContent = 'FEED: UNREACHABLE — THE DESK WAITS PATIENTLY';
  }

  renderChannels();
  renderStream();

  const headlines = state.briefs.flatMap((b) => b.articles.map((a) => a.title));
  startTypedWire(headlines);
})();
