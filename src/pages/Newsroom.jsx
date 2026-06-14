import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  Cpu,
  ExternalLink,
  RefreshCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { briefRails, briefTemplates, emptyNewsData } from '../data/morningBriefs';

const sectionIcons = {
  energy: Zap,
  ai: BrainCircuit,
};

const sectionStyles = {
  energy: {
    accent: 'bg-slate',
    active: 'border-slate bg-white text-navy shadow-[0_0_0_2px_rgba(74,127,165,0.22)]',
  },
  ai: {
    accent: 'bg-navy',
    active: 'border-navy bg-white text-navy shadow-[0_0_0_2px_rgba(15,30,53,0.18)]',
  },
};

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

function mergeBriefData(newsData) {
  const liveById = new Map((newsData?.briefs ?? []).map((brief) => [brief.id, brief]));
  return briefTemplates.map((template) => {
    const live = liveById.get(template.id) ?? {};
    return {
      ...template,
      updatedLabel: live.updatedLabel ?? 'No feed loaded yet',
      emptyMessage: live.emptyMessage ?? `No qualified ${template.name} stories found.`,
      articles: Array.isArray(live.articles) ? live.articles : [],
    };
  });
}

function formatLocalTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(date);
}

function BriefButton({ brief, active, onClick }) {
  const Icon = sectionIcons[brief.id];
  const styles = sectionStyles[brief.id];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        'flex min-h-[58px] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate focus:ring-offset-2 focus:ring-offset-offwhite',
        active ? styles.active : 'border-border bg-white/75 text-charcoal shadow-sm hover:border-slate/50 hover:bg-white'
      )}
    >
      <span className={classNames('grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white shadow-sm', styles.accent)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal/55">{brief.eyebrow}</span>
        <span className="block truncate text-sm font-bold leading-5">{brief.name}</span>
      </span>
    </button>
  );
}

function EmptyArticleState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate/35 bg-offwhite/70 p-4 text-sm leading-6 text-charcoal/65">
      <div className="mb-2 flex items-center gap-2 font-black text-charcoal">
        <AlertCircle className="h-4 w-4 text-slate" /> No qualifying stories
      </div>
      <p>{message}</p>
      <p className="mt-2 text-xs font-semibold text-charcoal/50">
        This section stays empty instead of showing generic trackers or old placeholder content.
      </p>
    </div>
  );
}

function parseDailyAiBrief(summary) {
  const lines = (summary ?? '').split('\n');
  const title = lines.find((line) => line.trim()) ?? 'Daily AI Briefing';
  const sections = [];
  let current = null;

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trimEnd();
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (match) {
      if (current) sections.push(current);
      current = { number: match[1], title: match[2], lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) sections.push(current);
  return { title, sections };
}

function DailyAiBriefCard({ article, selected, onClick }) {
  const { title, sections } = parseDailyAiBrief(article.summary);

  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      aria-pressed={selected}
      className={classNames(
        'block rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-slate focus:ring-offset-2 md:p-4',
        selected
          ? 'border-slate bg-white shadow-[0_0_0_2px_rgba(74,127,165,0.18)]'
          : 'border-border bg-white/80 hover:border-slate/45 hover:bg-white'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">{article.kicker}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate/70" />
      </div>
      <h3 className="text-base font-black leading-5 text-charcoal md:text-lg">{title}</h3>
      <p className="mt-1 text-[11px] font-bold text-slate/80">Click anywhere to open the source page</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <section key={`${section.number}-${section.title}`} className="rounded-2xl border border-border bg-offwhite/70 p-3 shadow-sm">
            <div className="mb-2 flex items-start gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-navy text-xs font-black text-white">
                {section.number}
              </span>
              <h4 className="pt-1 text-sm font-black leading-5 text-navy">{section.title}</h4>
            </div>
            <div className="space-y-2 text-[13px] leading-5 text-charcoal/70">
              {section.lines.filter((line) => line.trim()).map((line) => (
                <p key={line}>{line.replace(/^-\s*/, '')}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </a>
  );
}

function ArticleExplainer({ article, open, onClose }) {
  const explainer = article.explainer;
  const terms = explainer?.terms?.length ? explainer.terms : article.glossary ?? [];

  if (!open || !explainer) return null;

  return (
    <div className="mt-3 rounded-2xl border border-slate/25 bg-navy/[0.03] p-3 text-left shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate">
            <BookOpen className="h-3.5 w-3.5" /> Explain this article
          </p>
          <h4 className="mt-1 text-sm font-black text-navy">{explainer.headline}</h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close article explanation"
          className="rounded-full border border-border bg-white p-1 text-charcoal/55 transition hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-slate"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-2 text-[13px] leading-5 text-charcoal/72">{explainer.plainEnglish}</p>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {Object.entries(explainer.sections ?? {}).map(([label, body]) => (
          <div key={label} className="rounded-xl border border-border bg-white/75 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-charcoal/50">{label}</p>
            <p className="mt-1 text-[12px] leading-5 text-charcoal/70">{body}</p>
          </div>
        ))}
      </div>

      {terms.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">Terms explained</p>
          <div className="grid gap-2 md:grid-cols-2">
            {terms.map((term) => (
              <div key={term.term} className="rounded-xl bg-white/85 px-3 py-2 text-[12px] leading-5 text-charcoal/70">
                <span className="font-black text-navy">{term.term}:</span> {term.definition}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article, selected, onClick }) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  if (article.id?.startsWith('ai-daily-')) {
    return <DailyAiBriefCard article={article} selected={selected} onClick={onClick} />;
  }

  function toggleExplainer(event) {
    event.preventDefault();
    event.stopPropagation();
    setExplainerOpen((value) => !value);
    onClick?.();
  }

  return (
    <article
      aria-current={selected ? 'true' : undefined}
      className={classNames(
        'block rounded-2xl border p-3 text-left transition focus-within:ring-2 focus-within:ring-slate focus-within:ring-offset-2',
        selected
          ? 'border-slate bg-white shadow-[0_0_0_2px_rgba(74,127,165,0.18)]'
          : 'border-border bg-white/80 hover:border-slate/45 hover:bg-white'
      )}
    >
      <a href={article.sourceUrl} target="_blank" rel="noreferrer" onClick={onClick} className="block focus:outline-none">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">{article.kicker}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate/70" />
        </div>
        <h3 className="text-sm font-black leading-5 text-charcoal">{article.title}</h3>
        <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-charcoal/68">{article.summary}</p>
        <p className="mt-2 text-[11px] font-bold text-slate/80">Click title/card text to open source</p>
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(article.dataSignals ?? []).slice(0, 3).map((signal) => (
          <span key={signal} className="rounded-full bg-offwhite px-2 py-1 text-[10px] font-bold text-charcoal/60">
            {signal}
          </span>
        ))}
        {article.explainer && (
          <button
            type="button"
            onClick={toggleExplainer}
            aria-expanded={explainerOpen}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate/30 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate transition hover:border-slate hover:bg-offwhite focus:outline-none focus:ring-2 focus:ring-slate"
          >
            <BookOpen className="h-3.5 w-3.5" /> {explainerOpen ? 'Hide help' : 'Explain this'}
          </button>
        )}
      </div>
      <ArticleExplainer article={article} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </article>
  );
}

function BriefCard({ brief, selectedArticleId, onSelectArticle }) {
  const hasArticles = brief.articles.length > 0;

  return (
    <article className="rounded-[1.35rem] border border-border bg-white/90 p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <span className="rounded-full bg-offwhite px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/65">{brief.label}</span>
        <span className="text-[11px] font-semibold text-charcoal/50">{brief.updatedLabel}</span>
      </div>

      <h2 className="font-heading text-2xl font-black leading-tight tracking-tight text-charcoal md:text-3xl">
        {brief.headline}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal/72">
        {brief.deck}
      </p>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">Live inputs from the morning scan</p>
        {hasArticles ? (
          <div className={classNames('grid gap-2', brief.id === 'ai' ? 'md:grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3')}>
            {brief.articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                selected={selectedArticleId === article.id}
                onClick={() => onSelectArticle(article.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyArticleState message={brief.emptyMessage} />
        )}
      </div>
    </article>
  );
}

export default function Newsroom() {
  const [active, setActive] = useState('all');
  const [newsData, setNewsData] = useState(emptyNewsData);
  const [feedStatus, setFeedStatus] = useState('loading');
  const [selectedArticleId, setSelectedArticleId] = useState(null);

  useEffect(() => {
    let isActive = true;
    fetch(`${import.meta.env.BASE_URL}data/morning-briefs.json?ts=${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Feed returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!isActive) return;
        setNewsData(data);
        const firstArticle = mergeBriefData(data).flatMap((brief) => brief.articles)[0];
        setSelectedArticleId(firstArticle?.id ?? null);
        setFeedStatus('loaded');
      })
      .catch(() => {
        if (!isActive) return;
        setNewsData(emptyNewsData);
        setFeedStatus('error');
      });
    return () => {
      isActive = false;
    };
  }, []);

  const briefs = useMemo(() => mergeBriefData(newsData), [newsData]);
  const visibleBriefs = useMemo(
    () => (active === 'all' ? briefs : briefs.filter((brief) => brief.id === active)),
    [active, briefs]
  );

  const selectedArticle = useMemo(() => {
    const allVisibleArticles = visibleBriefs.flatMap((brief) => brief.articles);
    return allVisibleArticles.find((article) => article.id === selectedArticleId) ?? allVisibleArticles[0] ?? null;
  }, [selectedArticleId, visibleBriefs]);

  const generatedLabel = formatLocalTimestamp(newsData.generatedAt) ?? newsData.generatedLabel;

  function selectBrief(briefId) {
    const nextBriefs = briefId === 'all' ? briefs : briefs.filter((brief) => brief.id === briefId);
    const firstArticle = nextBriefs.flatMap((brief) => brief.articles)[0];
    setActive(briefId);
    setSelectedArticleId(firstArticle?.id ?? null);
  }

  return (
    <div className="min-h-screen bg-offwhite text-charcoal">
      <section className="relative overflow-hidden border-b border-border px-4 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(74,127,165,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(74,127,165,0.16)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="pointer-events-none absolute right-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-slate/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-charcoal/55">
            <span>Dustin Cole</span>
            <span>AI side project</span>
            <span>Built from sourced signals</span>
          </div>

          <div className="grid gap-5 py-6 lg:grid-cols-[1fr_340px] lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate/25 bg-white/80 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate shadow-sm">
                <Sparkles className="h-3.5 w-3.5" /> Personal AI lab
              </div>
              <h1 className="max-w-4xl font-heading text-4xl font-black leading-tight tracking-tight text-navy md:text-5xl lg:text-6xl">
                Newsroom experiments
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/72 md:text-base md:leading-7">
                A small side project where I use AI agents to keep a cleaner read on the things I already pay attention to: energy, practical AI, analytics, and work automation.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal/72 md:text-base md:leading-7">
                If you're interested in that same mix, follow along here. I'll keep adding the useful pieces, the weird experiments, and the parts that actually save time.
              </p>
            </div>

            <aside className="rounded-[1.35rem] border border-border bg-white/90 p-4 shadow-sm">
              <p className="flex items-center gap-2 border-b border-border pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/55">
                <Cpu className="h-3.5 w-3.5 text-slate" /> How to read it
              </p>
              <div className="mt-3 space-y-2">
                {briefRails.map(([title, body]) => (
                  <div key={title} className="grid grid-cols-[72px_1fr] gap-3 text-sm leading-5">
                    <span className="font-black text-navy">{title}</span>
                    <span className="text-charcoal/65">{body}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => selectBrief('all')}
              aria-pressed={active === 'all'}
              className={classNames(
                'flex min-h-[58px] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate focus:ring-offset-2 focus:ring-offset-offwhite',
                active === 'all'
                  ? 'border-slate bg-white text-navy shadow-[0_0_0_2px_rgba(74,127,165,0.18)]'
                  : 'border-border bg-white/75 text-charcoal shadow-sm hover:border-slate/50 hover:bg-white'
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate text-white shadow-sm">
                <Search className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal/55">Overview</span>
                <span className="block text-sm font-bold leading-5">All Briefs</span>
              </span>
            </button>
            {briefs.map((brief) => (
              <BriefButton key={brief.id} brief={brief} active={active === brief.id} onClick={() => selectBrief(brief.id)} />
            ))}
          </div>
        </div>
      </section>

      <main className="px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto max-w-6xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-charcoal/55">
              {active === 'all' ? 'All morning briefs' : `${briefs.find((brief) => brief.id === active)?.name} brief`}
            </p>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-charcoal/50">
              <RefreshCcw className="h-3.5 w-3.5" />
              {feedStatus === 'loading' ? 'Loading live feed…' : `Updated ${generatedLabel}`}
            </p>
          </div>

          <div className="grid gap-4">
            {visibleBriefs.map((brief) => (
              <BriefCard
                key={brief.id}
                brief={brief}
                selectedArticleId={selectedArticle?.id}
                onSelectArticle={setSelectedArticleId}
              />
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
