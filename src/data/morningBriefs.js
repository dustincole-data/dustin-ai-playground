export const briefTemplates = [
  {
    id: 'energy',
    name: 'Energy / Utilities',
    eyebrow: 'Utility scan',
    label: 'Energy / Utilities',
    headline: 'Energy / Utilities',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.',
  },
  {
    id: 'ai',
    name: 'AI / Analytics',
    eyebrow: 'AI scan',
    label: 'AI / Analytics',
    headline: 'AI & Analytics Brief',
    deck: 'Useful AI, analytics, data-platform, and automation updates without hype or long summaries.',
  },
  {
    id: 'sports',
    name: 'College Sports Chaos',
    eyebrow: '24-hour scan',
    label: 'College Sports Chaos',
    headline: 'College Chaos Wire',
    deck: 'The wildest real college football and basketball stories from the last 24 hours, ranked for quick scanning.',
  },
];

export const briefRails = [
  ['TODAY', 'Last-24-hour items first.'],
  ['SOURCES', 'Original links kept close.'],
  ['GLOSSARY', 'Plain-language terms when needed.'],
];

export const articleQuestions = [
  {
    id: 'impact',
    question: 'Why does this matter to me?',
  },
  {
    id: 'data',
    question: 'What data should I watch?',
  },
  {
    id: 'terms',
    question: 'Explain the jargon.',
  },
];

export const emptyNewsData = {
  generatedAt: null,
  generatedLabel: 'Not generated yet',
  lookbackHours: 24,
  briefs: briefTemplates.map((brief) => ({
    id: brief.id,
    updatedLabel: 'No feed loaded yet',
    emptyMessage: `No qualified ${brief.name} stories are loaded yet.`,
    articles: [],
  })),
};
