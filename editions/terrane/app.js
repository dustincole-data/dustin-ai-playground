/* TERRANE — the morning, surveyed.
   Same content contract as the playground newsroom.
   Hero: a shaded-relief terrain model where each ridge is one brief,
   height ∝ this morning's story count. Contours drawn in-shader. */

import * as THREE from './vendor/three.module.min.js';

const SECTIONS = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'AI', code: 'NW·1',
    deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', code: 'NE·2',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health', code: 'W·3',
    deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Health', headline: 'Kentucky Healthcare', code: 'E·4',
    deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'Analytics', code: 'SW·5',
    deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'Louisville', code: 'SE·6',
    deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

/* Ridge placement on the 14×9 sheet (x, z) — hand-set so no summit label
   hides behind the intro panel (top-left). */
const RIDGE_XY = [
  [-2.5, -2.5], [-0.2, -1.7], [1.9, -2.6],
  [4.4, -1.8], [-1.6, 1.9], [2.7, 1.7],
];

const LEARN_BASE = 'https://dustincole-data.github.io/dustin-ai-playground/#/learn/';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let counts = SECTIONS.map(() => 0);

function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

(function setPlate() {
  const now = new Date();
  document.getElementById('sheetNo').textContent = `${now.getFullYear()}·${String(dayOfYear(now)).padStart(3, '0')}`;
  document.getElementById('sheetDate').textContent = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(now);
})();

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

function whyLine(a) {
  const w = String(a.whyItMatters || '').trim();
  if (!w) return '';
  if (String(a.summary || '').toLowerCase().includes(w.toLowerCase().slice(0, 60))) return '';
  return w;
}

function legendBlock(a) {
  const terms = (a.glossary || []).filter((g) => g.term && g.definition);
  if (!terms.length) return '';
  const learn = (a.learningPage && a.learningPage.glossary) || [];
  return `<details class="legend">
    <summary>Legend — ${terms.length} ${terms.length === 1 ? 'term' : 'terms'} worth knowing</summary>
    <div class="legend-body">${terms.map((g) => {
      const extra = learn.find((l) => l.term === g.term && l.whyItMatters);
      return `<p class="legend-term"><strong>${esc(g.term)}.</strong> ${esc(g.definition)}${extra ? ` <span class="legend-why">${esc(extra.whyItMatters)}</span>` : ''}</p>`;
    }).join('')}</div>
  </details>`;
}

/* small concentric-contour glyph unique to each quadrangle */
function quadGlyph(i, count) {
  const rings = Math.max(2, Math.min(6, count + 1));
  let paths = '';
  for (let r = 0; r < rings; r++) {
    const rad = 12 + r * (34 / rings);
    let d = '';
    for (let a = 0; a <= 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const wob = Math.sin(th * 3 + i * 1.7 + r) * (2.2 + r * 0.8) + Math.cos(th * 5 + i) * 1.4;
      const x = 50 + Math.cos(th) * (rad + wob);
      const y = 46 + Math.sin(th) * ((rad + wob) * 0.72);
      d += (a ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    paths += `<path d="${d}Z" stroke="${r === rings - 1 ? 'var(--survey)' : 'var(--contour)'}"/>`;
  }
  return `<svg class="quad-glyph" viewBox="0 0 100 92" aria-hidden="true">${paths}</svg>`;
}

function stationHtml(a) {
  const why = whyLine(a);
  return `<article class="station">
    <p class="station-kick">${esc(a.kicker || 'This morning')}</p>
    <h3 class="station-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
    <p class="station-sum">${esc(cleanSummary(a))}</p>
    ${why ? `<p class="station-note"><strong>Field note&ensp;</strong>${esc(why)}</p>` : ''}
    ${legendBlock(a)}
    <p class="station-meta">
      <span>${esc(a.sourceLabel || '')}</span>
      ${a.id ? `<a class="learn" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me this story</a>` : ''}
    </p>
  </article>`;
}

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  counts = SECTIONS.map((t) => byId.get(t.id)?.articles?.length || 0);
  const total = counts.reduce((a, b) => a + b, 0);

  document.getElementById('reliefTotal').textContent = total || 'no';
  document.getElementById('sheetStamp').textContent =
    data?.generatedLabel ? data.generatedLabel : 'live briefs unavailable';

  document.getElementById('indexStrip').innerHTML = SECTIONS.map((t, i) => `
    <a class="idx" href="#quad-${t.id}" data-quad="${t.id}">
      <span class="idx-el">${t.code}</span><span>${esc(t.label)}</span>
      <span class="idx-el">${counts[i]}</span>
    </a>`).join('');

  document.getElementById('quads').innerHTML = SECTIONS.map((t, i) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    return `<section class="quad" id="quad-${t.id}" aria-labelledby="qh-${t.id}">
      <div class="quad-inner">
        <div class="quad-side"><div class="quad-rail">
          ${quadGlyph(i, counts[i])}
          <h2 class="quad-title" id="qh-${t.id}">${esc(t.headline)}</h2>
          <p class="quad-elev">▲ QUAD ${t.code} — ${counts[i]} ${counts[i] === 1 ? 'SIGNAL' : 'SIGNALS'}</p>
          <p class="quad-deck">${esc(t.deck)}</p>
          <p class="quad-updated">${esc(b?.updatedLabel || 'Last 24 hours')}</p>
        </div></div>
        <div class="quad-flow">
          ${articles.length ? articles.map(stationHtml).join('')
            : `<p class="quad-empty">${esc(b?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`}
        </div>
      </div>
    </section>`;
  }).join('');

  markActive();
  choreograph();
  initTerrain();
}

function markActive() {
  const items = new Map([...document.querySelectorAll('.idx')].map((s) => [s.dataset.quad, s]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        items.forEach((s) => s.removeAttribute('aria-current'));
        items.get(en.target.id.replace('quad-', ''))?.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  document.querySelectorAll('.quad').forEach((q) => io.observe(q));
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.from('.plate-name', { y: 20, opacity: 0, duration: 0.6, ease: 'power4.out' });
  gsap.from('.plate-block, .plate-facts', { y: 14, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.1, delay: 0.1 });
  gsap.from('.relief-panel', { y: 24, opacity: 0, duration: 0.7, ease: 'power4.out', delay: 0.25 });
  document.querySelectorAll('.quad').forEach((quad) => {
    gsap.from(quad.querySelectorAll('.station'), {
      y: 16, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08,
      immediateRender: false,
      scrollTrigger: { trigger: quad, start: 'top 78%', once: true },
    });
    const glyph = quad.querySelector('.quad-glyph');
    if (glyph) {
      const paths = glyph.querySelectorAll('path');
      paths.forEach((p) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
      });
      gsap.to(paths, {
        strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', stagger: 0.08,
        scrollTrigger: { trigger: quad, start: 'top 80%', once: true },
      });
    }
  });
  setTimeout(() => {
    document.querySelectorAll('.station, .relief-panel, .plate-name').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
    document.querySelectorAll('.quad-glyph path').forEach((p) => {
      p.style.strokeDasharray = ''; p.style.strokeDashoffset = '';
    });
  }, 2600);
}

/* ---------- terrain (three.js) ---------- */

function initTerrain() {
  const canvas = document.getElementById('terrain');
  if (!canvas || canvas.dataset.live) return;
  canvas.dataset.live = '1';
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    const maxCount = Math.max(1, ...counts);
    const peaks = SECTIONS.map((t, i) => ({
      x: RIDGE_XY[i][0], z: RIDGE_XY[i][1],
      h: 0.55 + (counts[i] / maxCount) * 1.9,
      t, i,
    }));
    const peaksVec = peaks.map((p) => new THREE.Vector3(p.x, p.z, p.h));

    const uniforms = {
      uTime: { value: 0 },
      uReveal: { value: reducedMotion ? 1 : 0 },
      uPeaks: { value: peaksVec },
      uLow: { value: new THREE.Color(0.878, 0.906, 0.839) },
      uMid: { value: new THREE.Color(0.694, 0.761, 0.588) },
      uHigh: { value: new THREE.Color(0.812, 0.702, 0.522) },
      uPeak: { value: new THREE.Color(0.678, 0.443, 0.345) },
      uContour: { value: new THREE.Color(0.596, 0.494, 0.322) },
      uInk: { value: new THREE.Color(0.161, 0.235, 0.204) },
    };

    const NOISE_GLSL = `
      float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
                   mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for (int k = 0; k < 4; k++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      float elevation(vec2 xz){
        float h = 0.0;
        for (int k = 0; k < 6; k++) {
          vec3 pk = uPeaks[k];
          float d2 = dot(xz - pk.xy, xz - pk.xy);
          h += pk.z * exp(-d2 / 1.85);
        }
        h += fbm(xz * 0.55) * 0.6 - 0.18;
        return max(h, 0.0) * uReveal;
      }
    `;

    const terrainMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms,
      vertexShader: `
        uniform vec3 uPeaks[6]; uniform float uReveal; uniform float uTime;
        varying vec2 vXZ; varying float vH; varying vec2 vUvv;
        ${NOISE_GLSL}
        void main(){
          vec3 pos = position;               /* plane in XY, rotated by mesh */
          vec2 xz = vec2(pos.x, -pos.y);     /* pre-rotation: y maps to -z */
          float h = elevation(xz);
          vXZ = xz; vH = h; vUvv = uv;
          pos.z = h;                          /* displace along plane normal */
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uPeaks[6]; uniform float uReveal; uniform float uTime;
        uniform vec3 uLow; uniform vec3 uMid; uniform vec3 uHigh; uniform vec3 uPeak;
        uniform vec3 uContour; uniform vec3 uInk;
        varying vec2 vXZ; varying float vH; varying vec2 vUvv;
        ${NOISE_GLSL}
        void main(){
          /* shaded relief: normal from height-field derivatives */
          float e = 0.06;
          float hx = elevation(vXZ + vec2(e, 0.0)) - elevation(vXZ - vec2(e, 0.0));
          float hz = elevation(vXZ + vec2(0.0, e)) - elevation(vXZ - vec2(0.0, e));
          vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
          vec3 light = normalize(vec3(-0.55, 0.8, -0.45));   /* NW cartographic light */
          float lit = clamp(dot(n, light), 0.0, 1.0);

          /* hypsometric tint */
          float h = vH;
          vec3 col = mix(uLow, uMid, smoothstep(0.05, 0.75, h));
          col = mix(col, uHigh, smoothstep(0.75, 1.5, h));
          col = mix(col, uPeak, smoothstep(1.5, 2.3, h));
          col *= 0.72 + lit * 0.38;

          /* contour lines: minor every 0.12, major every 0.6 */
          float minor = abs(fract(h / 0.12 - 0.5) - 0.5) / fwidth(h / 0.12);
          float major = abs(fract(h / 0.60 - 0.5) - 0.5) / fwidth(h / 0.60);
          float minorLine = 1.0 - smoothstep(0.0, 1.4, minor);
          float majorLine = 1.0 - smoothstep(0.0, 1.8, major);
          col = mix(col, uContour, minorLine * 0.38 * step(0.03, h));
          col = mix(col, uInk, majorLine * 0.34 * step(0.03, h));

          /* faint survey graticule */
          vec2 g = abs(fract(vXZ / 1.0 - 0.5) - 0.5) / fwidth(vXZ / 1.0);
          float grat = 1.0 - smoothstep(0.0, 1.2, min(g.x, g.y));
          col = mix(col, uInk, grat * 0.06);

          /* sheet-edge fade */
          vec2 m = smoothstep(0.0, 0.07, vUvv) * smoothstep(0.0, 0.07, 1.0 - vUvv);
          float alpha = m.x * m.y;
          gl_FragColor = vec4(col, alpha);
        }`,
    });

    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(14, 9, 240, 160), terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || 420;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);

    /* summit labels (HTML, projected each frame) */
    const labelWrap = document.getElementById('reliefLabels');
    const labels = peaks.map((p) => {
      const el = document.createElement('button');
      el.className = 'relief-label';
      el.type = 'button';
      el.tabIndex = -1;
      el.textContent = `▲ ${p.t.label} · ${counts[p.i]}`;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        document.getElementById(`quad-${p.t.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      });
      const caption = document.getElementById('terrainCaption');
      el.addEventListener('mouseenter', () => {
        caption.textContent = `${p.t.name} — ${counts[p.i]} ${counts[p.i] === 1 ? 'signal' : 'signals'} surveyed this morning. Click to travel there.`;
      });
      el.addEventListener('mouseleave', () => {
        caption.textContent = 'Relief exaggerated for legibility. The terrain regenerates every morning.';
      });
      labelWrap.appendChild(el);
      return { el, p };
    });

    const v = new THREE.Vector3();
    function placeLabels(reveal) {
      const r = canvas.getBoundingClientRect();
      const wrapR = labelWrap.getBoundingClientRect();
      labels.forEach(({ el, p }) => {
        v.set(p.x, p.h * reveal + 0.35, p.z).project(cam);
        const sx = (v.x * 0.5 + 0.5) * r.width + (r.left - wrapR.left);
        const sy = (-v.y * 0.5 + 0.5) * r.height + (r.top - wrapR.top);
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
        el.style.opacity = v.z < 1 && reveal > 0.6 ? '1' : '0';
      });
    }

    const camBase = { r: 9.6, phi: 0.62, theta: 0.0 };
    function placeCam(el) {
      const theta = camBase.theta + (reducedMotion ? 0 : Math.sin(el * 0.11) * 0.16);
      const y = Math.sin(camBase.phi) * camBase.r;
      const rr = Math.cos(camBase.phi) * camBase.r;
      cam.position.set(Math.sin(theta) * rr, y, Math.cos(theta) * rr + 1.2);
      cam.lookAt(0, 0.35, -0.4);
    }

    if (reducedMotion) {
      placeCam(0);
      renderer.render(scene, cam);
      placeLabels(1);
      return;
    }

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    let t0 = null;
    renderer.setAnimationLoop((t) => {
      if (!visible) return;
      if (t0 === null) t0 = t;
      const el = (t - t0) / 1000;
      const reveal = Math.min(1, el / 1.8);
      uniforms.uReveal.value = 1 - Math.pow(1 - reveal, 3);
      uniforms.uTime.value = el;
      placeCam(el);
      renderer.render(scene, cam);
      placeLabels(uniforms.uReveal.value);
    });
  } catch (e) {
    console.warn('terrain skipped:', e);
    canvas.style.display = 'none';
  }
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
