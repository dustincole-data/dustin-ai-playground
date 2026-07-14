export const briefTemplates = [
  {
    id: 'ai',
    name: 'AI',
    eyebrow: 'AI scan',
    label: 'AI',
    headline: 'AI Brief',
    deck: 'Useful AI and automation updates without hype or long summaries.',
  },
  {
    id: 'energy',
    name: 'Energy / Utilities',
    eyebrow: 'Utility scan',
    label: 'Energy / Utilities',
    headline: 'Energy / Utilities',
    deck: 'PPL, LG&E/KU, Kentucky utility news, data-center power demand, grid issues, rates, regulation, and market signals.',
  },
  {
    id: 'humana',
    name: 'Humana / Health Insurance',
    eyebrow: 'Payer scan',
    label: 'Humana / Health Insurance',
    headline: 'Humana / Health Insurance',
    deck: 'Humana-first health-insurance scan with broader US payer stories only when no current Humana item qualifies.',
  },
  {
    id: 'kentucky_healthcare',
    name: 'Kentucky Healthcare / US Healthcare',
    eyebrow: 'Care scan',
    label: 'Kentucky Healthcare',
    headline: 'Kentucky Healthcare',
    deck: 'Kentucky healthcare, Louisville providers, hospitals, Medicaid, access, workforce, and US healthcare backup only when needed.',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    eyebrow: 'Data scan',
    label: 'Analytics',
    headline: 'Analytics Brief',
    deck: 'Business analytics, BI, dashboards, data quality, governance, warehouses, lakehouses, and data-platform signals.',
  },
  {
    id: 'louisville',
    name: 'Louisville, Kentucky',
    eyebrow: 'Local scan',
    label: 'Louisville, Kentucky',
    headline: 'Louisville Brief',
    deck: 'Louisville and Jefferson County signals across business, healthcare, infrastructure, utilities, policy, and local economy.',
  },
];

export const briefRails = [
  ['TODAY', 'Last-24-hour items first.'],
  ['SOURCES', 'Original links kept close.'],
  ['GLOSSARY', 'Plain-language terms when needed.'],
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
