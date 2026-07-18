/* MERIDIAN — the Sunday magazine
   Same content contract as the playground newsroom, unhurried.
   Cover ripple: three.js plane whose fragment shader disturbs the
   painting with signal ripples that follow the pointer. */

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
  document.getElementById('coverDate').textContent = long;
  document.getElementById('folioDate').textContent = long;
  document.getElementById('folioNo').textContent = `Issue ${dayOfYear(now)}`;
})();

function cleanTitle(t) {
  const s = String(t || '');
  const cut = s.indexOf(': ');
  if (cut > 20 && cut < 90) return s.slice(0, cut);
  return s.replace(/:\s*$/, '');
}

function shortSummary(a, max = 240) {
  let s = a.summary || '';
  if (a.title && s.startsWith(a.title.replace(/…$/, '').slice(0, 40))) {
    const cut = s.indexOf(': ');
    if (cut > -1 && cut < 140) s = s.slice(cut + 2);
  }
  s = s.replace(/\s*Source:\s*[^.]+$/i, '');
  if (s.length > max) s = s.slice(0, max - 3).trimEnd() + '…';
  return s;
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

/* ---------- render ---------- */

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));

  /* coverlines: the lead headline + one per other non-empty brief */
  const nonEmpty = TEMPLATES.map((t) => ({ t, b: byId.get(t.id) })).filter(({ b }) => b?.articles?.length);
  const coverEl = document.getElementById('coverlines');
  coverEl.innerHTML = nonEmpty.slice(0, 4).map(({ t, b }, i) => {
    const a = b.articles[0];
    return `<a class="coverline${i === 0 ? ' is-lead' : ''}" href="#feat-${t.id}">
      <span class="cl-tag">${esc(t.label)}</span>
      <span class="cl-text">${esc(cleanTitle(a.title))}</span>
    </a>`;
  }).join('');

  /* contents */
  document.getElementById('tocList').innerHTML = TEMPLATES.map((t) => {
    const b = byId.get(t.id);
    const n = b?.articles?.length || 0;
    return `<li><a href="#feat-${t.id}">
      <span class="t-name">${esc(t.headline)}</span>
      <span class="t-count">${n ? `${n} ${n === 1 ? 'signal' : 'signals'}` : 'quiet today'}</span>
    </a></li>`;
  }).join('');

  /* features */
  document.getElementById('features').innerHTML = TEMPLATES.map((t, i) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    let body;
    if (!articles.length) {
      body = `<p class="feature-empty">${esc(b?.emptyMessage || `The ${t.name} wire is quiet this morning.`)}</p>`;
    } else {
      const [lead, ...rest] = articles;
      const leadWhy = lead.whyItMatters
        ? `<div class="lead-why"><strong>Why it matters</strong>${esc(lead.whyItMatters)}</div>` : '';
      body = `<article class="lead-story">
        <p class="lead-kick">${esc(lead.kicker || t.name)}</p>
        <h4 class="lead-head"><a href="${esc(lead.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(lead.title)}">${esc(cleanTitle(lead.title))}</a></h4>
        <div class="lead-body">
          <div>
            <p class="lead-sum">${esc(shortSummary(lead, 340))}</p>
            <p class="lead-meta">${esc(lead.sourceLabel || '')}${lead.id ? ` · <a href="${LEARN_BASE}${encodeURIComponent(lead.id)}">Teach me →</a>` : ''}</p>
          </div>
          ${leadWhy}
        </div>
      </article>`;
      if (rest.length) {
        body += `<div class="story-rows">${rest.map((a) => `
          <article class="srow">
            <h5 class="srow-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(a.title)}">${esc(cleanTitle(a.title))}</a></h5>
            <p class="srow-sum">${esc(shortSummary(a, 170))}</p>
            <p class="srow-meta"><span class="src">${esc((a.sourceLabel || '').split(' · ')[0])}</span>${a.id ? `<a href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me →</a>` : ''}</p>
          </article>`).join('')}</div>`;
      }
    }
    return `<section class="feature" id="feat-${t.id}" aria-labelledby="fh-${t.id}">
      <div class="feature-inner">
        <div class="feature-mark">
          <span class="feature-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="feature-rule"></span>
          <span class="feature-updated">${esc(b?.updatedLabel || 'Last 24 hours')}</span>
        </div>
        <h3 class="feature-title" id="fh-${t.id}">${esc(t.headline)}</h3>
        <p class="feature-stand">${esc(t.deck)}</p>
        ${body}
      </div>
    </section>`;
  }).join('');

  document.getElementById('stampLine').textContent =
    data?.generatedLabel ? `This issue's briefs were generated ${data.generatedLabel}` : 'Live briefs unavailable';

  choreograph();
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.from('.cover-logo', { opacity: 0, y: 26, duration: 1.1, ease: 'expo.out', delay: 0.1 });
  gsap.from('.cover-issue, .cover-sub', { opacity: 0, duration: 1.2, ease: 'power2.out', delay: 0.45 });
  gsap.from('.coverline', { opacity: 0, y: 18, duration: 0.8, ease: 'expo.out', stagger: 0.09, delay: 0.55 });

  document.querySelectorAll('.feature').forEach((sec) => {
    gsap.from(sec.querySelectorAll('.feature-title, .feature-stand'), {
      y: 26, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.08,
      immediateRender: false,
      scrollTrigger: { trigger: sec, start: 'top 74%', once: true },
    });
    const rows = sec.querySelectorAll('.srow');
    if (rows.length) {
      gsap.from(rows, {
        opacity: 0, y: 14, duration: 0.5, ease: 'power2.out', stagger: 0.05,
        immediateRender: false,
        scrollTrigger: { trigger: sec, start: 'top 60%', once: true },
      });
    }
  });

  /* failsafe for anything left hidden (hidden tabs, headless) */
  setTimeout(() => {
    document.querySelectorAll('.feature-title, .feature-stand, .srow, .coverline, .cover-logo').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2500);
}

/* ---------- cover ripple (three.js) ---------- */

function initCover() {
  if (reducedMotion) return;
  const wrap = document.getElementById('coverArt');
  const img = document.getElementById('coverImg');
  const canvas = document.getElementById('coverCanvas');
  if (!wrap || !img || !canvas) return;

  const start = () => {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
      camera.position.z = 1;

      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      /* pass sRGB straight through — the shader writes raw values, so any
         decode here would double-darken the painting */
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;

      const MAXR = 10;
      const uniforms = {
        uTex: { value: tex },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uImgRes: { value: new THREE.Vector2(img.naturalWidth, img.naturalHeight) },
        uRipples: { value: Array.from({ length: MAXR }, () => new THREE.Vector3(-10, -10, 1e3)) },
      };

      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTex;
          uniform float uTime;
          uniform vec2 uRes;
          uniform vec2 uImgRes;
          uniform vec3 uRipples[${'' + 10}];

          /* object-fit: cover UV mapping (focus 38% from top) */
          vec2 coverUv(vec2 uv) {
            float sc = uRes.x / uRes.y;
            float si = uImgRes.x / uImgRes.y;
            vec2 out_uv = uv;
            if (sc > si) {
              float h = si / sc;
              out_uv.y = uv.y * h + (1.0 - h) * 0.62;
            } else {
              float w = sc / si;
              out_uv.x = uv.x * w + (1.0 - w) * 0.5;
            }
            return out_uv;
          }

          void main() {
            vec2 uv = vUv;
            vec2 offset = vec2(0.0);
            float glow = 0.0;
            for (int i = 0; i < 10; i++) {
              vec3 r = uRipples[i];
              float age = r.z;
              if (age > 3.0) continue;
              vec2 d = uv - r.xy;
              d.x *= uRes.x / uRes.y;
              float dist = length(d);
              float radius = age * 0.34;
              float band = dist - radius;
              float damp = exp(-3.2 * age) * exp(-26.0 * band * band);
              offset += normalize(d + 1e-5) * damp * 0.02;
              glow += damp * 0.2;
            }
            vec2 s = coverUv(uv + offset);
            vec4 c = texture2D(uTex, s);
            /* signal-teal shimmer along the wavefront */
            c.rgb += glow * vec3(0.22, 0.42, 0.45);
            gl_FragColor = c;
          }
        `,
      });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));

      const cover = document.getElementById('cover');
      function resize() {
        const w = cover.clientWidth, h = cover.clientHeight;
        renderer.setSize(w, h, false);
        uniforms.uRes.value.set(w, h);
      }
      resize();
      addEventListener('resize', resize);

      const ripples = uniforms.uRipples.value;
      let slot = 0;
      let lastSpawn = 0;
      function spawn(x, y) {
        ripples[slot].set(x, y, 0);
        slot = (slot + 1) % MAXR;
      }
      cover.addEventListener('pointermove', (e) => {
        const r = cover.getBoundingClientRect();
        const t = performance.now();
        if (t - lastSpawn > 240) {
          spawn((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
          lastSpawn = t;
        }
      });
      /* an ambient pulse from a mast tip now and then, so the cover breathes untouched */
      setInterval(() => spawn(0.5 + (Math.random() - 0.5) * 0.28, 0.62 + Math.random() * 0.2), 2600);

      let last = performance.now();
      let visible = true;
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cover);
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (!visible) return;
        for (const r of ripples) r.z += dt;
        renderer.render(scene, camera);
      });

      wrap.classList.add('canvas-live');
    } catch (e) {
      console.warn('cover ripple skipped:', e);
    }
  };

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
}

/* ---------- boot ---------- */

(async function boot() {
  initCover();
  const data = await loadData();
  if (!data) {
    document.getElementById('wireError').hidden = false;
    render({ briefs: [] });
    return;
  }
  render(data);
})();
