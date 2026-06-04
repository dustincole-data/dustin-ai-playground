import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Cpu,
  ExternalLink,
  Flame,
  MessageCircleQuestion,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { articleQuestions, briefRails, briefTemplates, emptyNewsData } from '../data/morningBriefs';

const sectionIcons = {
  energy: Zap,
  ai: BrainCircuit,
  sports: Flame,
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
  sports: {
    accent: 'bg-charcoal',
    active: 'border-charcoal bg-white text-navy shadow-[0_0_0_2px_rgba(28,28,28,0.12)]',
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

function getAnswer(questionId, article) {
  if (!article) return 'Select an article first.';

  if (questionId === 'impact') {
    return article.whyItMatters;
  }

  if (questionId === 'data') {
    return article.dataSignals?.length ? `Watch: ${article.dataSignals.join(', ')}.` : 'No data signals were extracted for this article.';
  }

  if (questionId === 'terms') {
    if (!article.glossary?.length) {
      return 'No uncommon terms were flagged for this article.';
    }

    return article.glossary.map((item) => `${item.term}: ${item.definition}`).join(' ');
  }

  return article.summary;
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

function ArticleCard({ article, selected, onClick }) {
  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      aria-pressed={selected}
      className={classNames(
        'block rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-slate focus:ring-offset-2',
        selected
          ? 'border-slate bg-white shadow-[0_0_0_2px_rgba(74,127,165,0.18)]'
          : 'border-border bg-white/80 hover:border-slate/45 hover:bg-white'
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">{article.kicker}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate/70" />
      </div>
      <h3 className="text-sm font-black leading-5 text-charcoal">{article.title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-charcoal/68">{article.summary}</p>
      <p className="mt-2 text-[11px] font-bold text-slate/80">Click to open source</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(article.dataSignals ?? []).slice(0, 3).map((signal) => (
          <span key={signal} className="rounded-full bg-offwhite px-2 py-1 text-[10px] font-bold text-charcoal/60">
            {signal}
          </span>
        ))}
      </div>
    </a>
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
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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

function AskArticlePanel({ article }) {
  const [selectedQuestion, setSelectedQuestion] = useState(articleQuestions[0].id);
  const currentQuestion = articleQuestions.find((item) => item.id === selectedQuestion) ?? articleQuestions[0];
  const answer = getAnswer(currentQuestion.id, article);

  return (
    <section className="mt-5 rounded-[1.35rem] border border-border bg-white/90 p-4 shadow-sm md:p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/55">
            <MessageCircleQuestion className="h-4 w-4 text-slate" /> Article Q&A
          </div>
          <h2 className="font-heading text-2xl font-black leading-tight text-navy md:text-3xl">Ask the tiny research assistant.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal/70">
            This is intentionally small and bounded: the answers only use the selected source record, extracted signals, why-it-matters note, and glossary terms.
          </p>

          <div className="mt-4 rounded-2xl border border-border bg-offwhite/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-charcoal/50">Selected input</p>
            {article ? (
              <>
                <p className="mt-1 text-sm font-bold text-charcoal">{article.title}</p>
                <p className="mt-1 text-sm leading-6 text-charcoal/65">{article.summary}</p>
                {article.sourceUrl && (
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-slate underline">
                    {article.sourceLabel} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm leading-6 text-charcoal/65">
                No article selected because this filtered brief currently has no qualifying stories.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-offwhite/70 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-charcoal">
            <ShieldCheck className="h-4 w-4 text-slate" /> Guardrails
          </div>
          <div className="mt-3 grid gap-2">
            {articleQuestions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedQuestion(item.id)}
                className={classNames(
                  'rounded-xl border px-3 py-2 text-left text-sm font-semibold leading-5 transition focus:outline-none focus:ring-2 focus:ring-slate focus:ring-offset-2',
                  selectedQuestion === item.id
                    ? 'border-navy bg-navy text-offwhite'
                    : 'border-border bg-white text-charcoal hover:border-slate/50'
                )}
              >
                {item.question}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-white p-3 text-sm leading-6 text-charcoal/70">
            <p className="font-bold text-navy">Bounded answer:</p>
            <p>{answer}</p>
          </div>
        </div>
      </div>
    </section>
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
                A small side project where I use AI agents to keep a cleaner read on the things I already pay attention to: energy, practical AI, analytics, and college sports chaos.
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

          <AskArticlePanel article={selectedArticle} />

          <div className="mt-5 rounded-[1.35rem] border border-border bg-white/90 p-4 text-sm leading-6 text-charcoal/65 shadow-sm md:p-5">
            <span className="font-black text-navy">Source policy:</span> dated, source-linked items only. Better-source filters favor reputable local utility, AI/analytics, and college sports outlets; if nothing qualifies, the page stays empty instead of using filler.
          </div>
        </div>
      </main>
    </div>
  );
}
