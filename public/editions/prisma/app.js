/* PRISMA — the morning, refracted.
   Same content contract as the playground newsroom.
   Hero: a glass prism takes one white beam and fans it into six
   wavelengths — beam widths follow this morning's story counts. */

import * as THREE from './vendor/three.module.min.js';

const SECTIONS = [
  { id: 'ai', name: 'AI', label: 'AI', headline: 'AI', hue: 'ai',
    deck: 'Useful AI and automation updates without hype or long summaries.' },
  { id: 'energy', name: 'Energy / Utilities', label: 'Energy', headline: 'Energy & Utilities', hue: 'energy',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.' },
  { id: 'humana', name: 'Humana / Health Insurance', label: 'Humana', headline: 'Humana & Health', hue: 'humana',
    deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.' },
  { id: 'kentucky_healthcare', name: 'Kentucky Healthcare', label: 'Ky. Health', headline: 'Kentucky Healthcare', hue: 'kyh',
    deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.' },
  { id: 'analytics', name: 'Analytics', label: 'Analytics', headline: 'Analytics', hue: 'analytics',
    deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.' },
  { id: 'louisville', name: 'Louisville, Kentucky', label: 'Louisville', headline: 'Louisville', hue: 'louisville',
    deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.' },
];

/* Beam colors must match the CSS --*-mid tokens (sRGB approximations). */
const BEAM_RGB = {
  ai: 0x8b5fd6, energy: 0xd9a13c, humana: 0x4caf7d,
  kyh: 0x3fa8bf, analytics: 0x5487d8, louisville: 0xd8574a,
};

const LEARN_BASE = './learn/?id=';
const DATA_PATHS = [
  `../../data/morning-briefs.json?ts=${Date.now()}`,
  `https://dustincole-data.github.io/dustin-ai-playground/data/morning-briefs.json?ts=${Date.now()}`,
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let counts = SECTIONS.map(() => 0);

(function setMastDate() {
  document.getElementById('mastDate').textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(new Date());
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
  let s = String(a.summary || '');
  return s.replace(/\s*Source:\s*\[?[^.\]]+\]?\([^)]*\)\s*$/i, '').replace(/\s*Source:\s*[^.]+$/i, '').trim();
}

function whyLine(a) {
  const w = String(a.whyItMatters || '').trim();
  if (!w) return '';
  const sum = String(a.summary || '').toLowerCase();
  if (sum.includes(w.toLowerCase().slice(0, 60))) return '';
  return w;
}

function glossChips(a) {
  const terms = (a.glossary || []).filter((g) => g.term && g.definition);
  if (!terms.length) return '';
  const learn = (a.learningPage && a.learningPage.glossary) || [];
  return `<div class="story-gloss" aria-label="Glossary for this story">${terms.map((g) => {
    const extra = learn.find((l) => l.term === g.term && l.whyItMatters);
    return `<details class="gloss">
      <summary>${esc(g.term)}</summary>
      <div class="gloss-def" role="note">
        <p><strong>${esc(g.term)}.</strong> ${esc(g.definition)}</p>
        ${extra ? `<p class="gloss-why">${esc(extra.whyItMatters)}</p>` : ''}
      </div>
    </details>`;
  }).join('')}</div>`;
}

function storyHtml(a) {
  const why = whyLine(a);
  return `<article class="story">
    <p class="story-kick">${esc(a.kicker || 'This morning')}</p>
    <h3 class="story-head"><a href="${esc(a.sourceUrl || '#')}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
    <p class="story-sum">${esc(cleanSummary(a))}</p>
    ${why ? `<p class="story-why"><strong>Why it matters&ensp;</strong>${esc(why)}</p>` : ''}
    ${glossChips(a)}
    <p class="story-meta">
      <span>${esc(a.sourceLabel || '')}</span>
      ${a.id ? `<a class="learn" href="${LEARN_BASE}${encodeURIComponent(a.id)}">Teach me this story</a>` : ''}
    </p>
  </article>`;
}

function render(data) {
  const byId = new Map((data?.briefs || []).map((b) => [b.id, b]));
  counts = SECTIONS.map((t) => byId.get(t.id)?.articles?.length || 0);
  const total = counts.reduce((a, b) => a + b, 0);

  document.getElementById('heroCount').textContent = total ? `${total} sourced` : 'no';
  document.getElementById('mastStamp').textContent =
    data?.generatedLabel ? `updated ${data.generatedLabel}` : 'live briefs unavailable';

  /* spectrum nav */
  document.getElementById('spectrum').innerHTML = SECTIONS.map((t, i) => `
    <a class="spec-seg" href="#band-${t.id}" data-band="${t.id}"
       style="--seg-deep: var(--${t.hue}-deep); --seg-mid: var(--${t.hue}-mid); --seg-wash: var(--${t.hue}-wash);">
      <span class="spec-wave" aria-hidden="true"></span>
      <span>${esc(t.label)}</span>
      <span class="spec-count">${counts[i]} ${counts[i] === 1 ? 'story' : 'stories'}</span>
    </a>`).join('');

  /* bands */
  document.getElementById('bands').innerHTML = SECTIONS.map((t) => {
    const b = byId.get(t.id);
    const articles = b?.articles || [];
    return `<section class="band" id="band-${t.id}" aria-labelledby="bh-${t.id}"
      style="--band-deep: var(--${t.hue}-deep); --band-mid: var(--${t.hue}-mid); --band-wash: var(--${t.hue}-wash);">
      <div class="band-inner">
        <div class="band-side"><div class="band-rail">
          <span class="band-swatch" aria-hidden="true"></span>
          <h2 class="band-title" id="bh-${t.id}">${esc(t.headline)}</h2>
          <p class="band-deck">${esc(t.deck)}</p>
          <p class="band-updated">${esc(b?.updatedLabel || 'Last 24 hours')}</p>
        </div></div>
        <div class="band-flow">
          ${articles.length ? articles.map(storyHtml).join('')
            : `<p class="band-empty">${esc(b?.emptyMessage || `No qualified ${t.name} stories in the last 24 hours.`)}</p>`}
        </div>
      </div>
    </section>`;
  }).join('');

  wireGlossary();
  markActiveBand();
  choreograph();
  initPrism();
}

/* Close open glossary popovers when another opens or on outside click. */
function wireGlossary() {
  const all = () => document.querySelectorAll('details.gloss[open]');
  document.getElementById('bands').addEventListener('toggle', (e) => {
    if (e.target.matches('details.gloss') && e.target.open) {
      all().forEach((d) => { if (d !== e.target) d.open = false; });
    }
  }, true);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('details.gloss')) all().forEach((d) => { d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') all().forEach((d) => { d.open = false; });
  });
}

function markActiveBand() {
  const segs = new Map([...document.querySelectorAll('.spec-seg')].map((s) => [s.dataset.band, s]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const id = en.target.id.replace('band-', '');
      if (en.isIntersecting) {
        segs.forEach((s) => s.removeAttribute('aria-current'));
        segs.get(id)?.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('.band').forEach((b) => io.observe(b));
}

/* ---------- motion ---------- */

function choreograph() {
  if (reducedMotion || typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.from('.mast-inner > *', { y: 14, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.08 });
  gsap.from('.hero-head, .hero-sub, .hero-note', { y: 22, opacity: 0, duration: 0.7, ease: 'power4.out', stagger: 0.09, delay: 0.15 });
  gsap.from('.spec-seg', { yPercent: 40, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05, delay: 0.4 });
  document.querySelectorAll('.band').forEach((band) => {
    gsap.from(band.querySelectorAll('.story'), {
      y: 18, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.09,
      immediateRender: false,
      scrollTrigger: { trigger: band, start: 'top 78%', once: true },
    });
    const swatch = band.querySelector('.band-swatch');
    if (swatch) gsap.from(swatch, {
      scaleX: 0, transformOrigin: 'left center', duration: 0.8, ease: 'power4.out',
      immediateRender: false,
      scrollTrigger: { trigger: band, start: 'top 82%', once: true },
    });
  });
  /* failsafe: nothing may stay invisible */
  setTimeout(() => {
    document.querySelectorAll('.story, .spec-seg, .hero-head, .hero-sub, .hero-note, .band-swatch').forEach((el) => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { clearProps: 'all' });
    });
  }, 2400);
}

/* ---------- prism (three.js) ---------- */

function initPrism() {
  const canvas = document.getElementById('prism');
  if (!canvas || canvas.dataset.live) return;
  canvas.dataset.live = '1';
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    cam.position.set(0, 0.55, 9.2);
    cam.lookAt(0.6, 0, 0);

    /* — soft halo behind the prism — */
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform float uTime;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float glow = smoothstep(0.5, 0.05, d);
            float breathe = 0.85 + 0.15 * sin(uTime * 0.5);
            gl_FragColor = vec4(vec3(0.62, 0.60, 0.82), glow * 0.16 * breathe);
          }`,
      })
    );
    halo.position.set(0.1, 0.15, -1.2);
    scene.add(halo);

    /* — glass prism: triangular cross-section facing the camera, apex up — */
    const prismGeo = new THREE.CylinderGeometry(1.32, 1.32, 1.05, 3, 1, false);
    prismGeo.rotateY(Math.PI / 3);
    const prismMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vViewW; varying vec3 vPos;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewW = normalize(cameraPosition - world.xyz);
          vPos = position;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        varying vec3 vNormalW; varying vec3 vViewW; varying vec3 vPos;
        uniform float uTime;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 1.8);
          /* internal caustic streaks sweeping through the glass */
          float streak = 0.5 + 0.5 * sin(vPos.x * 4.0 - vPos.y * 7.0 + uTime * 0.8);
          float streak2 = 0.5 + 0.5 * sin(vPos.y * 11.0 + uTime * 0.45);
          vec3 glass = mix(vec3(0.90, 0.905, 0.97), vec3(0.55, 0.53, 0.80), fres);
          glass += vec3(0.05, 0.04, 0.10) * streak * streak2;
          float alpha = 0.22 + fres * 0.6 + streak * streak2 * 0.05;
          gl_FragColor = vec4(glass, alpha);
        }`,
    });
    const prism = new THREE.Mesh(prismGeo, prismMat);
    /* axis into the screen so the triangle silhouette faces the viewer */
    prism.rotation.x = Math.PI / 2;
    prism.position.set(0.1, 0.15, 0);
    scene.add(prism);

    /* edge glint */
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(prismGeo, 12),
      new THREE.LineBasicMaterial({ color: 0x7d76b8, transparent: true, opacity: 0.85 })
    );
    prism.add(edges);

    /* — light beams. uMode 0: exit beam (soft birth at glass, dissolve mid-air).
         uMode 1: entry beam (full brightness at the glass, tail fades to source). — */
    function beamPlane(len, w, colorA, colorB, opacity, mode = 0) {
      const geo = new THREE.PlaneGeometry(len, w, 1, 1);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        uniforms: {
          uA: { value: new THREE.Color(colorA) },
          uB: { value: new THREE.Color(colorB) },
          uOp: { value: opacity }, uTime: { value: 0 }, uMode: { value: mode },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform vec3 uA; uniform vec3 uB; uniform float uOp; uniform float uTime; uniform float uMode;
          void main(){
            float across = 1.0 - abs(vUv.y - 0.5) * 2.0;      /* soft edges */
            float along = uMode > 0.5
              ? (1.0 - smoothstep(0.45, 0.94, vUv.x))          /* entry: bright at glass */
              : smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.35, 0.62, vUv.x));
            float shimmer = 0.92 + 0.08 * sin(vUv.x * 26.0 - uTime * 2.2);
            vec3 col = mix(uA, uB, vUv.x);
            gl_FragColor = vec4(col, pow(across, 1.5) * along * uOp * shimmer);
          }`,
      });
      return new THREE.Mesh(geo, mat);
    }

    /* — incoming white beam, aimed at the prism's upper-left face — */
    const inPivot = new THREE.Group();
    inPivot.position.set(-0.3, 0.5, 0);         /* entry point on the glass */
    inPivot.rotation.z = Math.PI - 0.24;        /* beam runs up-left from here */
    const inBeam = beamPlane(5.4, 0.42, 0xffffff, 0xffffff, 1.0, 1);
    inBeam.position.x = 2.55;
    inPivot.add(inBeam);
    scene.add(inPivot);

    /* — six refracted beams in spectral order, width ∝ story count — */
    const SPECTRAL_ORDER = ['louisville', 'energy', 'humana', 'kyh', 'analytics', 'ai'];
    const maxCount = Math.max(1, ...counts);
    const beams = [];
    SPECTRAL_ORDER.forEach((hue, s) => {
      const i = SECTIONS.findIndex((t) => t.hue === hue);
      const t = SECTIONS[i];
      /* red bends least (top of fan), violet most */
      const angle = -0.06 - s * 0.115;
      const w = 0.11 + (counts[i] / maxCount) * 0.24;
      const beam = beamPlane(6.6, w, BEAM_RGB[t.hue], BEAM_RGB[t.hue], 0.85);
      const pivot = new THREE.Group();
      pivot.position.set(0.5, -0.02 - s * 0.03, 0.02 + s * 0.012);  /* exit face of the glass */
      pivot.rotation.z = angle;
      beam.position.x = 3.3;
      pivot.add(beam);
      scene.add(pivot);
      beams.push({ pivot, beam, t, i, baseOp: 0.85 });
    });

    /* — dust motes in the beam — */
    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = -4 + Math.random() * 9;
      motePos[i * 3 + 1] = -1.8 + Math.random() * 3.6;
      motePos[i * 3 + 2] = -0.6 + Math.random() * 1.2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      color: 0xb9b4dd, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false,
    }));
    scene.add(motes);

    function resize() {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || 360;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);

    /* hover names a beam; click scrolls to its band */
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const caption = document.getElementById('prismCaption');
    const baseCaption = 'The spectrum is live — beam widths follow this morning’s story counts.';
    let hovered = null;
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, cam);
      const hit = ray.intersectObjects(beams.map((b) => b.beam))[0];
      return hit ? beams.find((b) => b.beam === hit.object) : null;
    }
    canvas.addEventListener('pointermove', (e) => {
      const hit = pick(e);
      if (hit !== hovered) {
        hovered = hit;
        beams.forEach((b) => { b.beam.material.uniforms.uOp.value = hit && b !== hit ? 0.28 : b.baseOp; });
        if (hit) {
          caption.textContent = `${hit.t.name} — ${counts[hit.i]} ${counts[hit.i] === 1 ? 'story' : 'stories'} this morning. Click to read.`;
          canvas.style.cursor = 'pointer';
        } else {
          caption.textContent = baseCaption;
          canvas.style.cursor = 'default';
        }
      }
      /* gentle parallax */
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      targetTiltY = nx * 0.16; targetTiltX = ny * 0.08;
    });
    canvas.addEventListener('pointerleave', () => {
      hovered = null;
      beams.forEach((b) => { b.beam.material.uniforms.uOp.value = b.baseOp; });
      caption.textContent = baseCaption;
      targetTiltX = 0; targetTiltY = 0;
    });
    canvas.addEventListener('click', (e) => {
      const hit = pick(e);
      if (hit) document.getElementById(`band-${hit.t.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    let targetTiltX = 0, targetTiltY = 0;

    if (reducedMotion) {
      renderer.render(scene, cam);
      return;
    }

    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
    let t0 = null;
    renderer.setAnimationLoop((t) => {
      if (!visible) return;
      if (t0 === null) t0 = t;
      const el = (t - t0) / 1000;
      prismMat.uniforms.uTime.value = el;
      halo.material.uniforms.uTime.value = el;
      inBeam.material.uniforms.uTime.value = el;
      /* entrance: beams fan out over the first 1.6s */
      beams.forEach((b, i) => {
        const k = Math.min(1, Math.max(0, (el - 0.3 - i * 0.12) / 0.9));
        const e2 = 1 - Math.pow(1 - k, 4);
        b.beam.scale.x = Math.max(0.001, e2);
        b.beam.position.x = 3.3 * e2;
        b.beam.material.uniforms.uTime.value = el;
      });
      /* slow in-plane turn + pointer parallax (base: triangle facing camera) */
      prism.rotation.y = Math.sin(el * 0.24) * 0.09 + targetTiltX * 0.35;
      prism.rotation.z = Math.sin(el * 0.15) * 0.05 + targetTiltY * 0.25;
      motes.rotation.y = Math.sin(el * 0.05) * 0.08;
      motes.position.y = Math.sin(el * 0.32) * 0.06;
      renderer.render(scene, cam);
    });
  } catch (e) {
    console.warn('prism skipped:', e);
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
