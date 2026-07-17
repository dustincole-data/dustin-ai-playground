/* THE NOCTURNE DISPATCH — midnight supplement engine
   Same content contract as the playground newsroom: identity line,
   six briefs, live morning-briefs.json, filters, sources, signals,
   glossary/learning star charts. */

import * as THREE from './vendor/three.module.min.js';

const TEMPLATES = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'The AI Brief', deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health Insurance', deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Healthcare', headline: 'Kentucky Healthcare', deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'The Analytics Brief', deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'The Louisville Brief', deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { active: 'all', briefs: [] };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtStamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  }).format(d);
}

(function setMastDate() {
  const now = new Date();
  const line = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now);
  document.getElementById('mastDate').textContent = `The night of ${line}`;
})();

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

/* ---------- constellation dividers ---------- */

function seededRand(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function constellationSVG(seed, flip) {
  const rand = seededRand(seed + (flip ? 'r' : 'l'));
  const stars = [];
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: 10 + (i / (n - 1)) * 280 + (rand() - 0.5) * 22,
      y: 3 + rand() * 8,
      r: 0.8 + rand() * 1.4,
    });
  }
  const path = stars.map((s, i) => `${i ? 'L' : 'M'}${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(' ');
  const dots = stars.map((s) =>
    `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="currentColor"/>`).join('');
  return `<svg class="brief-stars" viewBox="0 0 300 14" preserveAspectRatio="none" style="color: oklch(78% 0.11 85);" aria-hidden="true">
    <path d="${path}" stroke="oklch(78% 0.11 85 / 0.3)" stroke-width="0.6" fill="none"/>${dots}</svg>`;
}

/* ---------- render ---------- */

function omenHTML(article) {
  const signals = (article.dataSignals ?? []).slice(0, 3).map(esc).join(' · ');
  const hasChart = article.learningPage || (article.glossary ?? []).length > 0;
  return `
  <article class="omen">
    <p class="omen-kicker">${esc(article.kicker)}</p>
    <h4 class="omen-title"><a href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">${esc(article.title)}</a></h4>
    <p class="omen-summary">${esc(firstSentences(article.summary, 2))}</p>
    ${article.whyItMatters ? `<p class="omen-why"><strong>Why it matters</strong> — ${esc(article.whyItMatters)}</p>` : ''}
    <div class="omen-meta">
      <a class="omen-src" href="${esc(article.sourceUrl)}" target="_blank" rel="noreferrer">${esc(article.sourceLabel ?? 'Source')} ↗</a>
      ${signals ? `<span class="omen-signals">${signals}</span>` : ''}
      ${hasChart ? `<button class="omen-learn" type="button" data-learn="${esc(article.id)}">Teach me</button>` : ''}
    </div>
  </article>`;
}

function firstSentences(text, n) {
  if (!text) return '';
  const parts = String(text).split(/(?<=\.)\s+/);
  return parts.slice(0, n).join(' ');
}

function briefHTML(brief) {
  return `
  <section class="brief" data-brief="${brief.id}" aria-labelledby="brief-${brief.id}">
    <div class="brief-heavens">
      ${constellationSVG(brief.id, false)}
      <h3 class="brief-name" id="brief-${brief.id}">${esc(brief.headline)}</h3>
      ${constellationSVG(brief.id, true)}
    </div>
    <div class="brief-sub">
      <p class="brief-deck">${esc(brief.deck)}</p>
      <span class="brief-updated">${esc(brief.updatedLabel)}</span>
    </div>
    ${brief.articles.length
      ? `<div class="omens">${brief.articles.map(omenHTML).join('')}</div>`
      : `<div class="brief-empty"><strong>The sky is quiet</strong>${esc(brief.emptyMessage)} This section stays empty instead of showing generic trackers or old placeholder content.</div>`}
  </section>`;
}

function renderBriefs() {
  const root = document.getElementById('briefsRoot');
  const visible = state.active === 'all' ? state.briefs : state.briefs.filter((b) => b.id === state.active);
  root.innerHTML = visible.map(briefHTML).join('');
  wireChartButtons();
  wireFoil();
  if (!reducedMotion && window.gsap) {
    gsap.from(root.querySelectorAll('.brief-heavens, .brief-sub'), {
      opacity: 0, y: 12, duration: 0.6, ease: 'power2.out', stagger: 0.06, clearProps: 'all',
    });
    gsap.from(root.querySelectorAll('.omen'), {
      opacity: 0, y: 16, duration: 0.55, ease: 'power2.out', stagger: { each: 0.045, grid: 'auto' }, clearProps: 'all',
    });
  }
}

function renderNav() {
  const nav = document.getElementById('constNav');
  nav.querySelectorAll('button').forEach((b) => b.remove());
  const mk = (id, label, count) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(state.active === id));
    btn.innerHTML = `${esc(label)}${count != null ? `<span class="const-count">${count}</span>` : ''}`;
    btn.addEventListener('click', () => {
      state.active = id;
      renderNav();
      renderBriefs();
    });
    return btn;
  };
  const total = state.briefs.reduce((n, b) => n + b.articles.length, 0);
  nav.appendChild(mk('all', 'All Briefs', total || null));
  state.briefs.forEach((b) => nav.appendChild(mk(b.id, b.label, b.articles.length || null)));
}

/* ---------- foil sheen follows the pointer ---------- */

function wireFoil() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.omen').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });
}

/* ---------- star chart overlay ---------- */

let lastFocus = null;

function openChart(article) {
  const overlay = document.getElementById('starchart');
  const title = document.getElementById('scTitle');
  const body = document.getElementById('scBody');
  const page = article.learningPage;
  title.textContent = page?.title ?? article.title;
  let html = '';
  if (page?.explanationText) html += `<p class="starchart-lede">${esc(page.explanationText)}</p>`;
  const glossary = page?.glossary ?? article.glossary ?? [];
  if (glossary.length) {
    html += `<h3 class="starchart-terms-title">Terms to know</h3><dl>`;
    for (const g of glossary) {
      html += `<div class="starchart-term"><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>${g.whyItMatters ? `<dd class="why"><strong>Why it matters</strong> — ${esc(g.whyItMatters)}</dd>` : ''}</div>`;
    }
    html += `</dl>`;
  }
  body.innerHTML = html;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.starchart-close').focus();
  if (!reducedMotion && window.gsap) {
    gsap.fromTo('.starchart-panel', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' });
    gsap.fromTo('.starchart-backdrop', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' });
  }
}

function closeChart() {
  document.getElementById('starchart').hidden = true;
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

function wireChartButtons() {
  document.querySelectorAll('[data-learn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const article = state.briefs.flatMap((b) => b.articles).find((a) => a.id === btn.dataset.learn);
      if (article) openChart(article);
    });
  });
}

document.getElementById('starchart').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeChart();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('starchart').hidden) closeChart();
});

/* ---------- aurora sky (WebGL) ---------- */

function initSky() {
  const canvas = document.getElementById('skyCanvas');
  if (!canvas || !window.WebGLRenderingContext) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  } catch { return; }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `void main(){ gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec2 uRes;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for(int i = 0; i < 5; i++){
          v += a * noise(p);
          p = p * 2.03 + vec2(17.0, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uRes.xy;
        float aspect = uRes.x / uRes.y;
        vec2 p = vec2(uv.x * aspect, uv.y);
        float t = uTime * 0.045;

        vec3 base = vec3(0.075, 0.052, 0.125);      /* indigo night */
        vec3 deep = vec3(0.045, 0.030, 0.082);
        vec3 teal = vec3(0.30, 0.62, 0.60);
        vec3 violet = vec3(0.48, 0.30, 0.66);
        vec3 gold = vec3(0.78, 0.62, 0.34);

        vec3 col = mix(deep, base, uv.y);

        /* aurora curtains */
        float n1 = fbm(p * vec2(1.1, 2.2) + vec2(t * 0.55, -t * 0.22));
        float n2 = fbm(p * vec2(1.6, 2.6) - vec2(t * 0.38, t * 0.30) + 4.7);
        float curtain1 = smoothstep(0.52, 0.95, n1) * smoothstep(0.05, 0.5, uv.y);
        float curtain2 = smoothstep(0.55, 0.95, n2) * smoothstep(0.15, 0.75, uv.y);

        /* calm the reading column */
        float edge = smoothstep(0.18, 0.52, abs(uv.x - 0.5) * 2.0);
        float calm = 0.35 + 0.65 * edge;

        col += teal * curtain1 * 0.20 * calm;
        col += violet * curtain2 * 0.24 * calm;
        col += gold * smoothstep(0.75, 0.98, n1 * n2 * 1.6) * 0.10 * calm;

        /* starfield */
        vec2 cell = floor(gl_FragCoord.xy / 2.0);
        float star = step(0.9994, hash(cell));
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + hash(cell + 1.3) * 1.8) + hash(cell + 2.7) * 6.283);
        col += vec3(0.9, 0.85, 0.7) * star * tw * 0.5 * (0.4 + 0.6 * uv.y);

        /* soft vignette */
        float vig = smoothstep(1.25, 0.45, length(uv - vec2(0.5, 0.42)));
        col *= 0.82 + 0.18 * vig;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthWrite: false,
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  /* gold dust */
  const DUST = 130;
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = Math.random() * 2 - 1;
    dustPos[i * 3 + 1] = Math.random() * 2 - 1;
    dustPos[i * 3 + 2] = 0;
    dustSeed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustTexC = document.createElement('canvas');
  dustTexC.width = 32; dustTexC.height = 32;
  const dg = dustTexC.getContext('2d');
  const drad = dg.createRadialGradient(16, 16, 1, 16, 16, 15);
  drad.addColorStop(0, 'rgba(255,225,160,1)');
  drad.addColorStop(1, 'rgba(255,225,160,0)');
  dg.fillStyle = drad; dg.fillRect(0, 0, 32, 32);
  const dustMat = new THREE.PointsMaterial({
    size: 3.2, sizeAttenuation: false,
    map: new THREE.CanvasTexture(dustTexC),
    transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(devicePixelRatio, 1.75);
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    uniforms.uRes.value.set(w * dpr, h * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) {
      uniforms.uTime.value += dt;
      const pos = dustGeo.attributes.position;
      for (let i = 0; i < DUST; i++) {
        let y = pos.getY(i) + dt * (0.012 + dustSeed[i] * 0.02);
        let x = pos.getX(i) + Math.sin(uniforms.uTime.value * 0.25 + dustSeed[i] * 9.0) * dt * 0.012;
        if (y > 1.05) { y = -1.05; x = Math.random() * 2 - 1; }
        pos.setY(i, y); pos.setX(i, x);
      }
      pos.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  renderer.render(scene, camera);
  frame();
}

/* ---------- entrance & scroll motion ---------- */

function entrance() {
  if (reducedMotion || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.mast-date, .mast-ornament', { opacity: 0, y: -10, duration: 0.7, stagger: 0.08, clearProps: 'all' })
    .from('.masthead', { opacity: 0, letterSpacing: '0.12em', filter: 'blur(6px)', duration: 1.3, ease: 'expo.out', clearProps: 'all' }, '-=0.4')
    .from('.mast-sub, .mast-line, .mast-rule', { opacity: 0, y: 10, duration: 0.7, stagger: 0.1, clearProps: 'all' }, '-=0.7')
    .from('.emblem-wrap', { opacity: 0, scale: 0.94, duration: 1.1, clearProps: 'opacity,scale' }, '-=0.5')
    .from('.invocation-copy > *', { opacity: 0, y: 16, duration: 0.7, stagger: 0.08, clearProps: 'all' }, '-=0.8');

  /* emblem drift on scroll (separate property owner: the figure) */
  gsap.to('.emblem-wrap', {
    y: 70, ease: 'none',
    scrollTrigger: { trigger: '.invocation', start: 'top top', end: 'bottom top', scrub: 0.8 },
  });

  /* rite + nav rise */
  gsap.from('.rite-list li', {
    opacity: 0, y: 18, duration: 0.6, stagger: 0.09, ease: 'power2.out', clearProps: 'all',
    scrollTrigger: { trigger: '.rite', start: 'top 82%' },
  });
}

/* ---------- boot ---------- */

(async function boot() {
  initSky();
  entrance();

  const data = await loadData();
  state.briefs = mergeBriefs(data);

  const feedLine = document.getElementById('feedLine');
  feedLine.textContent = data
    ? `The night's collection was sealed ${fmtStamp(data.generatedAt) ?? data.generatedLabel} — a ${data.lookbackHours ?? 24}-hour sweep of the signal sky.`
    : 'The signal sky is unreachable tonight; the dispatch waits for the next clear evening.';

  renderNav();
  renderBriefs();
})();
