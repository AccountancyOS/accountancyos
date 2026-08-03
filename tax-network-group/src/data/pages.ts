/**
 * Content model for Tax Network Group's core pages.
 *
 * Single source of truth for the who-we-help profiles and the service pages,
 * feeding the dynamic routes, hub cards and navigation. Copy is premium,
 * senior-led and in British English. No credentials, statistics, client counts
 * or outcomes are invented; every service page carries a general disclaimer.
 */
import type { IllustrationName } from './illustrations.ts';

export interface PageSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface MetaCell {
  label: string;
  value: string;
}

export interface RelatedLink {
  label: string;
  href: string;
}

export interface DetailPage {
  /** Final path segment. */
  slug: string;
  /** Full URL path (with trailing slash). */
  path: string;
  navLabel: string;
  /** Short summary for hub cards. */
  cardSummary: string;
  illustration: IllustrationName;
  seoTitle: string;
  metaDescription: string;
  eyebrow: string;
  /** H1 — may contain <em> for the italic accent. */
  h1: string;
  lead: string[];
  sections: PageSection[];
  /** serviceType for Service JSON-LD (service pages only). */
  serviceType?: string;
  meta?: MetaCell[];
  related?: RelatedLink[];
  /** Closing CTA — may contain <em>. */
  ctaHeading?: string;
  ctaCopy?: string;
}

/* ─────────────────────────  WHO WE HELP  ───────────────────────── */

export const audiences: DetailPage[] = [
  {
    slug: 'established-businesses',
    path: '/who-we-help/established-businesses/',
    navLabel: 'Established businesses',
    cardSummary:
      'Owner-managed companies that have outgrown a basic, compliance-led service and want better reporting, proactive tax advice and stronger commercial support.',
    illustration: 'limited',
    seoTitle: 'Accountants for Established Businesses',
    metaDescription:
      'Proactive accountancy, management reporting and tax advice for established owner-managed businesses that have outgrown a basic, compliance-led service.',
    eyebrow: 'Who we help',
    h1: 'For established businesses that expect <em>more than compliance.</em>',
    lead: [
      'Your business does not need reports for the sake of reporting. It needs accurate information, timely explanations and advice connected to the decisions you are actually making.',
      'We support established owner-managed businesses that have grown more complex than their current accounting relationship.',
    ],
    meta: [
      { label: 'Best suited to', value: 'Owner-managed companies' },
      { label: 'Typical revenue', value: '£250k and above' },
      { label: 'Relationship', value: 'Ongoing, senior-led' },
    ],
    sections: [
      {
        heading: 'When basic accountancy is no longer enough',
        paragraphs: [
          'As a business grows, the financial questions become more important and more frequent. Can you afford the next hire? Why has profit improved while cash has tightened? Which parts of the business are actually generating the returns? What will the tax liability be, and when?',
          'Annual accounts cannot answer these questions at the point they matter. We help establish a reliable reporting rhythm, produce information you can act on, and provide senior advice throughout the year.',
        ],
      },
      {
        heading: 'Signs you have outgrown your current accountant',
        list: [
          'You rarely hear from them unless a deadline is approaching',
          'Tax liabilities arrive later than they should',
          'The annual accounts are the only meaningful report you receive',
          'Bookkeeping is completed, but not properly reviewed',
          'You make hiring and investment decisions without a reliable forecast',
          'You are unsure whether reported profit is converting into cash',
          'The advice you get depends on who happens to answer',
        ],
      },
      {
        heading: 'What a better relationship provides',
        list: [
          'Fewer surprises, and earlier warning of cash or tax pressure',
          'Regular management information that leads to decisions',
          'Proactive tax planning rather than year-end retrospectives',
          'Clear ownership of who is responsible for what',
          'Senior attention, not a hand-off to the most junior person available',
          'A finance relationship that can support the next stage of the business',
        ],
      },
    ],
    related: [
      { label: 'Management information and planning', href: '/business-advisory/management-information-planning/' },
      { label: 'Business tax', href: '/tax/business-tax/' },
    ],
    ctaHeading: 'Has your business moved beyond the service you <em>receive?</em>',
    ctaCopy:
      'Book an introductory call to discuss where the current relationship falls short and what a more effective one would look like.',
  },
  {
    slug: 'founders-growth-companies',
    path: '/who-we-help/founders-growth-companies/',
    navLabel: 'Founders and growth companies',
    cardSummary:
      'Businesses preparing for expansion, external funding, more formal reporting or increased financial complexity — and the credible information that requires.',
    illustration: 'advisory',
    seoTitle: 'Accountants for Founders and Growth Companies',
    metaDescription:
      'Accounting, forecasting, management reporting and funding preparation for founders building ambitious growth companies towards their next stage.',
    eyebrow: 'Who we help',
    h1: 'For founders building something <em>ambitious.</em>',
    lead: [
      'Growth creates financial complexity before many founders are ready to hire a complete internal finance team.',
      'We provide the reporting, forecasting and forward planning needed for better decisions and credible conversations with investors and lenders.',
    ],
    meta: [
      { label: 'Best suited to', value: 'Growth-focused founders' },
      { label: 'Stage', value: 'Pre and post-funding' },
      { label: 'Relationship', value: 'Scales with the company' },
    ],
    sections: [
      {
        heading: 'Move beyond founder-managed finance',
        paragraphs: [
          'In the early stages, the founder often manages invoices, payments and cash flow personally. That eventually becomes a constraint: information becomes harder to trust, reporting falls behind and decisions are made on an incomplete view.',
          'The answer is not necessarily a full finance department. We can provide a reporting and advisory function that grows with the company — reliable records, regular management information and forward planning.',
        ],
      },
      {
        heading: 'Where we help',
        list: [
          'A dependable month-end and reporting rhythm',
          'Monthly management accounts and cash-runway reporting',
          'Integrated profit, balance-sheet and cash-flow forecasts',
          'Hiring, pricing and working-capital scenarios',
          'Funding-requirement analysis and investor-ready information',
          'Post-investment reporting discipline',
        ],
      },
      {
        heading: 'Financial information that can withstand questions',
        paragraphs: [
          'A forecast should not be a set of ambitious numbers arranged to reach a desired figure. It should explain how the company works, which assumptions drive revenue, when cash is required and what happens if performance differs from plan.',
          'We build or review forecasts with transparent assumptions and clear links between activity, revenue, cost, headcount and cash — useful to the founder before it is ever shown to an investor.',
        ],
      },
    ],
    related: [
      { label: 'Funding preparation', href: '/funding-exit/funding-preparation/' },
      { label: 'Growth and strategic support', href: '/business-advisory/growth-strategic-support/' },
    ],
    ctaHeading: 'Build a finance function investors can take <em>seriously.</em>',
    ctaCopy:
      'Tell us about the company, the stage you have reached and the milestones ahead.',
  },
  {
    slug: 'business-owners-private-clients',
    path: '/who-we-help/business-owners-private-clients/',
    navLabel: 'Business owners and private clients',
    cardSummary:
      'High-net-worth individuals and families whose company, investment, property, succession or personal tax affairs require coordinated, senior advice.',
    illustration: 'inheritance',
    seoTitle: 'Accountants for Business Owners and Private Clients',
    metaDescription:
      'Coordinated company and personal tax advice for business owners and private clients with substantial or complex financial affairs.',
    eyebrow: 'Who we help',
    h1: 'For business owners and private clients with <em>complex affairs.</em>',
    lead: [
      'For many business owners, the company and the personal position cannot sensibly be advised on in isolation.',
      'We provide coordinated advice for business owners and private clients whose affairs are substantial or complex enough to deserve senior, joined-up attention.',
    ],
    meta: [
      { label: 'Best suited to', value: 'Business owners & HNW individuals' },
      { label: 'Nature', value: 'Substantial or complex affairs' },
      { label: 'Approach', value: 'Coordinated & discreet' },
    ],
    sections: [
      {
        heading: 'Company and owner, considered together',
        paragraphs: [
          'How profit is extracted, how remuneration is structured, how investments and property are held, and how wealth passes to the next generation are connected decisions. Advising on one without the other rarely produces the best outcome.',
          'We look at the whole picture and give advice that respects the commercial position, the family’s objectives and the long term.',
        ],
      },
      {
        heading: 'Where we help',
        list: [
          'Complex self-assessment and remuneration or profit extraction',
          'Capital gains, business sale proceeds and reinvestment',
          'Substantial investment and property portfolios',
          'Residence and international tax matters',
          'Inheritance tax, succession and family wealth',
          'Trusts and family investment companies',
          'Ownership structuring across company and personal interests',
        ],
      },
      {
        heading: 'Working alongside your other advisers',
        paragraphs: [
          'Complex affairs frequently touch on legal, wealth, pensions and specialist tax matters. Where that is the case, we say so and work alongside your solicitors, wealth advisers and other specialists — coordinating input while keeping responsibilities clear.',
          'This is advice for those with genuinely substantial or complex affairs, rather than a standalone personal tax return service.',
        ],
      },
    ],
    related: [
      { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
      { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
    ],
    ctaHeading: 'Advice that sees the <em>whole picture.</em>',
    ctaCopy:
      'Arrange an introductory conversation to discuss your company and personal position together.',
  },
  {
    slug: 'changing-accountant',
    path: '/who-we-help/changing-accountant/',
    navLabel: 'Changing accountant',
    cardSummary:
      'Companies dissatisfied with reactive service, weak communication, poor reporting or limited strategic input — and a straightforward, well-managed switch.',
    illustration: 'selfEmployed',
    seoTitle: 'Changing Business Accountant — A Structured Switch',
    metaDescription:
      'Changing accountant should raise your standards, not disrupt the business. How Tax Network Group manages professional clearance, records and the transition.',
    eyebrow: 'Who we help',
    h1: 'Changing accountant should raise your standards, not <em>disrupt the business.</em>',
    lead: [
      'Businesses often delay changing accountant because they expect it to be difficult. In most cases the transfer is straightforward.',
      'We manage the professional clearance process, obtain the necessary records and establish a practical timetable for the new relationship.',
    ],
    meta: [
      { label: 'Process', value: 'Professional clearance managed' },
      { label: 'Timing', value: 'Any point in the year' },
      { label: 'Disruption', value: 'Kept to a minimum' },
    ],
    sections: [
      {
        heading: 'Why businesses decide to change',
        paragraphs: [
          'The decision is rarely caused by a single dramatic failure. More often, the business has evolved and the service has not.',
        ],
        list: [
          'Communication has become slow or inconsistent',
          'Advice is reactive rather than proactive',
          'You receive little useful information during the year',
          'Tax liabilities arrive as a surprise',
          'The firm does not understand your commercial priorities',
          'You are preparing for funding, succession or exit and need more',
          'The service no longer feels proportionate to the fees',
        ],
      },
      {
        heading: 'How the transition works',
        list: [
          'An introductory discussion of the business and what you expect',
          'A clear scope, responsibilities, reporting rhythm and recurring fee',
          'Appointment and professional clearance with your previous accountant',
          'An opening review of the accounting system, filings and position',
          'A practical handover plan for bookkeeping, VAT, payroll and compliance',
          'An agreed ongoing timetable and points of contact',
        ],
      },
      {
        heading: 'If the records need attention',
        paragraphs: [
          'The opening review may identify unreconciled balances, incomplete bookkeeping or historic errors. Where corrective work is needed, we explain the issue, why it matters, the proposed correction and any fee — before proceeding.',
          'You can speak to us confidentially before making any decision. We only contact your existing accountant once you have appointed us and given authority to do so.',
        ],
      },
    ],
    related: [
      { label: 'Ongoing accountancy support', href: '/business-advisory/ongoing-accountancy-support/' },
      { label: 'Established businesses', href: '/who-we-help/established-businesses/' },
    ],
    ctaHeading: 'Considering a <em>change?</em>',
    ctaCopy:
      'A confidential introductory call will help establish whether the issue is the accountant, the process or the level of support you now require.',
  },
];

/* ─────────────────────────  BUSINESS ADVISORY  ───────────────────────── */

export const advisory: DetailPage[] = [
  {
    slug: 'management-information-planning',
    path: '/business-advisory/management-information-planning/',
    navLabel: 'Management information and planning',
    cardSummary:
      'Clearer financial information and proactive advice throughout the year — management accounts, cash-flow visibility, forecasts and regular review.',
    illustration: 'selfEmployed',
    seoTitle: 'Management Information and Financial Planning',
    metaDescription:
      'Management accounts, cash-flow visibility, forecasts and regular review meetings that turn accounting records into decisions — for established businesses and founders.',
    eyebrow: 'Business advisory',
    h1: 'Information that leads to <em>action.</em>',
    lead: [
      'A set of figures is not useful simply because it is produced every month. Effective reporting explains performance, cash and risk in a form that helps you decide what to do next.',
      'This is the main difference between Tax Network Group and a conventional, compliance-led accountant.',
    ],
    serviceType: 'Management accounting and financial planning',
    meta: [
      { label: 'Frequency', value: 'Monthly or quarterly' },
      { label: 'Includes', value: 'Reporting & review meeting' },
      { label: 'Focus', value: 'Decisions, not documents' },
    ],
    sections: [
      {
        heading: 'Know what is happening before the year is over',
        paragraphs: [
          'Statutory accounts are designed to meet an annual obligation. They are not designed to run a business. Management information provides a current, operational view while there is still time to act on it.',
        ],
        list: [
          'Performance against budget and prior year',
          'Current and forecast cash position',
          'Revenue and margin by the lines that matter to you',
          'Working capital, debtors and creditors',
          'Tax provisions and upcoming liabilities',
          'The indicators that are genuinely relevant to your business',
        ],
      },
      {
        heading: 'Planning and forecasting',
        list: [
          'Annual budgets and rolling forecasts',
          'Integrated profit, balance-sheet and cash-flow models',
          'Scenario and sensitivity analysis',
          'Hiring affordability and capital-expenditure planning',
          'Support with significant financial decisions',
        ],
      },
      {
        heading: 'The review conversation',
        paragraphs: [
          'The purpose of a reporting meeting is not to read the figures aloud. It is to discuss what changed, why, whether it was expected, what it means for cash and tax, and what should happen next.',
        ],
      },
    ],
    related: [
      { label: 'Ongoing accountancy support', href: '/business-advisory/ongoing-accountancy-support/' },
      { label: 'Established businesses', href: '/who-we-help/established-businesses/' },
    ],
    ctaHeading: 'Turn your accounting records into usable <em>information.</em>',
  },
  {
    slug: 'ongoing-accountancy-support',
    path: '/business-advisory/ongoing-accountancy-support/',
    navLabel: 'Ongoing accountancy support',
    cardSummary:
      'Dependable accounting and tax compliance — accounts, corporation tax, VAT, payroll and Companies House — delivered as part of a wider advisory relationship.',
    illustration: 'limited',
    seoTitle: 'Ongoing Accountancy and Compliance Support',
    metaDescription:
      'Dependable annual accounts, corporation tax, VAT, payroll and compliance — delivered as the foundation of a proactive, year-round advisory relationship.',
    eyebrow: 'Business advisory',
    h1: 'Dependable compliance, as the <em>foundation.</em>',
    lead: [
      'Annual accounts, corporation tax and statutory filings must be accurate and on time. We handle those obligations properly — within a wider relationship designed to provide useful information and advice during the year.',
    ],
    serviceType: 'Accounting and corporation tax compliance',
    meta: [
      { label: 'Covers', value: 'Accounts, tax, VAT, payroll' },
      { label: 'Delivery', value: 'Flexible — see below' },
      { label: 'Position', value: 'Foundation for advice' },
    ],
    sections: [
      {
        heading: 'The essentials, done properly',
        list: [
          'Annual statutory accounts',
          'Corporation tax computations and returns',
          'VAT compliance',
          'Payroll and PAYE support',
          'Companies House and confirmation-statement support',
          'Director and owner tax matters, where agreed',
          'HMRC correspondence relating to the company',
        ],
      },
      {
        heading: 'Flexible delivery',
        paragraphs: [
          'We can work with your existing bookkeeping or finance team, or provide bookkeeping, payroll and reporting support where a more managed service is required.',
          'We do not provide advice based on financial records we cannot rely upon. Where bookkeeping remains with the client or another provider, an appropriate review process will form part of the service.',
        ],
      },
      {
        heading: 'Why the foundation matters',
        paragraphs: [
          'The value of advice depends on the quality of the information beneath it. Reliable records, reviewed properly, are what make meaningful reporting and proactive tax planning possible. We get the foundations right, then build on them.',
        ],
      },
    ],
    related: [
      { label: 'Management information and planning', href: '/business-advisory/management-information-planning/' },
      { label: 'Business tax', href: '/tax/business-tax/' },
    ],
    ctaHeading: 'Get the foundations right — and expect <em>more from the relationship.</em>',
  },
  {
    slug: 'growth-strategic-support',
    path: '/business-advisory/growth-strategic-support/',
    navLabel: 'Growth and strategic support',
    cardSummary:
      'Senior input for the decisions that change the business — structures, acquisitions, scenario modelling and preparation for significant transactions.',
    illustration: 'advisory',
    seoTitle: 'Growth and Strategic Financial Support',
    metaDescription:
      'Senior financial and tax input for growth decisions — group and ownership structures, acquisitions, scenario modelling and transaction preparation.',
    eyebrow: 'Business advisory',
    h1: 'Support for the decisions that <em>change the business.</em>',
    lead: [
      'Some decisions sit outside the routine: an acquisition, a change of structure, a major investment, a step towards funding or exit.',
      'We provide senior financial and tax input for these moments — grounded in the numbers, connected to the commercial objective.',
    ],
    serviceType: 'Strategic financial and transaction support',
    meta: [
      { label: 'Nature', value: 'Project or ongoing' },
      { label: 'Focus', value: 'Significant decisions' },
      { label: 'Approach', value: 'Coordinated with advisers' },
    ],
    sections: [
      {
        heading: 'When you need more than compliance',
        paragraphs: [
          'Growth changes the questions. Whether to hold property or investments in the company, whether a holding company or group is appropriate, how to reward key people, how to fund the next stage, and how today’s decisions affect a future sale — these reward experienced judgement.',
        ],
      },
      {
        heading: 'Where we help',
        list: [
          'Group, holding-company and ownership structures',
          'Acquisition support and integration of financial information',
          'Scenario and sensitivity modelling for major decisions',
          'Capital-expenditure and financing analysis',
          'Preparation for funding, succession or exit',
          'Reviewing significant transactions before they are implemented',
        ],
      },
      {
        heading: 'Coordinated advice',
        paragraphs: [
          'Significant transactions usually involve legal, corporate-finance and other specialists. We coordinate with your advisers, keep responsibilities clear, and do not represent ourselves as providing regulated services we are not authorised to provide.',
        ],
      },
    ],
    related: [
      { label: 'Funding preparation', href: '/funding-exit/funding-preparation/' },
      { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
    ],
    ctaHeading: 'Planning something <em>significant?</em>',
    ctaCopy: 'Tell us about the decision ahead and the timetable you are working towards.',
  },
];

/* ─────────────────────────  TAX  ───────────────────────── */

export const tax: DetailPage[] = [
  {
    slug: 'business-tax',
    path: '/tax/business-tax/',
    navLabel: 'Business tax',
    cardSummary:
      'Corporation tax compliance and forward-looking planning that considers both the tax result and the wider commercial objective.',
    illustration: 'limited',
    seoTitle: 'Business Tax and Corporation Tax Planning',
    metaDescription:
      'Corporation tax compliance and proactive business tax planning for established companies — advice connected to the commercial decision, not just the return.',
    eyebrow: 'Tax',
    h1: 'Tax advice connected to the <em>commercial decision.</em>',
    lead: [
      'Good tax planning considers more than the lowest immediate liability. We help you understand the tax consequences of business decisions early enough to compare the options and act deliberately.',
    ],
    serviceType: 'Business tax and corporation tax planning',
    meta: [
      { label: 'Covers', value: 'Compliance & planning' },
      { label: 'Timing', value: 'Throughout the year' },
      { label: 'Approach', value: 'Commercial context first' },
    ],
    sections: [
      {
        heading: 'Compliance and planning belong together',
        paragraphs: [
          'Accurate corporation tax returns are essential, but they are not the whole service. A proactive relationship also looks ahead — at the expected position before the payment date, capital expenditure, structure, incentives, and any significant transactions.',
        ],
      },
      {
        heading: 'Compliance',
        list: [
          'Corporation tax computations and returns',
          'Tax provisions for management accounts',
          'Review of losses, reliefs and capital allowances',
          'Group relief where applicable',
          'Payment-date planning and reminders',
          'HMRC correspondence relating to the return',
        ],
      },
      {
        heading: 'Planning',
        list: [
          'Profit and tax forecasting',
          'Timing of expenditure and capital investment',
          'Group and holding-company structures',
          'Employee and management incentives',
          'Research and development activity, where relevant',
          'Review of significant transactions before implementation',
        ],
      },
      {
        heading: 'Commercial context first',
        paragraphs: [
          'A transaction should not be undertaken solely because it produces a tax advantage. Our advice sets out the commercial objective, the options, the expected tax consequences, the practical implications and the actions required — and we do not promote artificial or aggressive arrangements.',
        ],
      },
    ],
    related: [
      { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
      { label: 'Ongoing accountancy support', href: '/business-advisory/ongoing-accountancy-support/' },
    ],
    ctaHeading: 'Discuss the decision before the tax treatment is <em>fixed.</em>',
  },
  {
    slug: 'business-owner-tax-planning',
    path: '/tax/business-owner-tax-planning/',
    navLabel: 'Business-owner tax planning',
    cardSummary:
      'Joined-up planning across the company and the owner — remuneration, profit extraction, capital gains and the route to a future sale or succession.',
    illustration: 'inheritance',
    seoTitle: 'Business-Owner Tax Planning',
    metaDescription:
      'Coordinated tax planning across the company and the owner — remuneration, profit extraction, capital gains and planning towards a future sale or succession.',
    eyebrow: 'Tax',
    h1: 'The company and the owner, planned <em>together.</em>',
    lead: [
      'For an owner-managed business, the company’s tax position and the owner’s personal position are two sides of the same decision.',
      'We advise on both together, so that remuneration, extraction and long-term plans work as a whole.',
    ],
    serviceType: 'Business-owner tax planning',
    meta: [
      { label: 'Scope', value: 'Company & personal' },
      { label: 'Horizon', value: 'Near and long term' },
      { label: 'Approach', value: 'Deliberate, defensible' },
    ],
    sections: [
      {
        heading: 'Where we advise',
        list: [
          'Salary, dividends and available reserves',
          'Profit extraction and use of surplus cash',
          'Pension contribution considerations',
          'Capital gains and the position on a future sale',
          'Share ownership, incentives and reorganisations',
          'Succession, family ownership and long-term planning',
        ],
      },
      {
        heading: 'Advice before the decision',
        paragraphs: [
          'Tax planning is most useful before a decision or transaction takes place. We encourage regular conversations through the year rather than a year-end list of generic tax-saving suggestions.',
        ],
      },
      {
        heading: 'Deliberate, not aggressive',
        paragraphs: [
          'We advise on planning that is soundly based and defensible, and are candid when the sensible course is to accept a tax cost in exchange for a better commercial or personal outcome. Where legal, pensions or specialist advice is needed, we identify it and coordinate with the right professional.',
        ],
      },
    ],
    related: [
      { label: 'Business owners and private clients', href: '/who-we-help/business-owners-private-clients/' },
      { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
    ],
    ctaHeading: 'Plan the company and the owner as <em>one picture.</em>',
  },
];

/* ─────────────────────────  PRIVATE CLIENTS  ───────────────────────── */

export const privateClients: DetailPage = {
  slug: 'private-clients',
  path: '/private-clients/',
  navLabel: 'Private clients',
  cardSummary:
    'Coordinated advice for business owners and high-net-worth private clients with substantial or complex financial affairs.',
  illustration: 'inheritance',
  seoTitle: 'Private Client Tax for Business Owners and HNW Individuals',
  metaDescription:
    'Coordinated private-client tax advice for business owners and high-net-worth individuals and families with substantial or complex affairs — including CGT, IHT, residence and succession.',
  eyebrow: 'Private clients',
  h1: 'For private clients with substantial or complex <em>affairs.</em>',
  lead: [
    'Our private-client work is aimed at business owners, high-net-worth individuals and families whose affairs are genuinely substantial or complex.',
    'It is coordinated, senior-led and joined up with the wider business and family position — not a standalone personal tax return service.',
  ],
  serviceType: 'Private client tax advice',
  meta: [
    { label: 'For', value: 'Business owners & HNW individuals' },
    { label: 'Nature', value: 'Substantial or complex' },
    { label: 'Approach', value: 'Coordinated & discreet' },
  ],
  sections: [
    {
      heading: 'Coordinated advice for complex affairs',
      paragraphs: [
        'When personal wealth is bound up with a business, investments and property, the individual pieces cannot sensibly be advised on in isolation. We take a coordinated view across the company and the personal position.',
      ],
    },
    {
      heading: 'Where we help',
      list: [
        'Complex self-assessment',
        'Remuneration and profit extraction',
        'Capital gains, including on a business sale',
        'Substantial investment and property portfolios',
        'Residence and international tax',
        'Inheritance tax, succession and trusts',
        'Family investment companies and ownership structuring',
        'Coordination with lawyers, wealth advisers and other specialists',
      ],
    },
    {
      heading: 'Working alongside your advisers',
      paragraphs: [
        'Complex private-client matters frequently require legal, wealth and specialist tax input. Where that is the case, we say so and work alongside your existing advisers, keeping responsibilities clear throughout.',
        'The information here is general in nature. Advice should be obtained for your specific circumstances, and tax outcomes depend on the law in force at the time.',
      ],
    },
  ],
  related: [
    { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
    { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
  ],
  ctaHeading: 'Advice that joins up your business and <em>personal position.</em>',
  ctaCopy: 'Arrange a discreet introductory conversation about your affairs.',
};

/* ─────────────────────────  FUNDING AND EXIT  ───────────────────────── */

export const fundingExit: DetailPage[] = [
  {
    slug: 'funding-preparation',
    path: '/funding-exit/funding-preparation/',
    navLabel: 'Funding preparation',
    cardSummary:
      'Investor-ready forecasts, reporting and financial information for founders and businesses preparing to raise capital or secure lending.',
    illustration: 'advisory',
    seoTitle: 'Funding Preparation and Investor-Ready Forecasts',
    metaDescription:
      'Investor-ready forecasts, management reporting, cash modelling and due-diligence readiness for founders and businesses preparing to raise funding.',
    eyebrow: 'Funding and exit',
    h1: 'Prepare the company behind the <em>pitch.</em>',
    lead: [
      'A compelling story may secure the first meeting. Credible financial information is needed for the questions that follow.',
      'We help prepare the forecasts, reporting and supporting information for investment or lending conversations.',
    ],
    serviceType: 'Funding preparation',
    meta: [
      { label: 'For', value: 'Founders & growth companies' },
      { label: 'Deliverables', value: 'Forecasts & data room' },
      { label: 'Begin', value: 'Before the process starts' },
    ],
    sections: [
      {
        heading: 'Funding readiness is more than a model',
        paragraphs: [
          'A forecast matters, but investors and lenders also consider the quality of historic records, revenue recognition, margins, working capital, tax compliance and the consistency between the model, the pitch and the underlying data.',
          'We help identify and address weaknesses before they become due-diligence questions.',
        ],
      },
      {
        heading: 'Forecasting and information',
        list: [
          'Integrated profit, balance-sheet and cash-flow forecasts',
          'Monthly cash-runway analysis',
          'Transparent assumptions and clear drivers',
          'Historic management accounts and reporting',
          'Data-room preparation and due-diligence readiness',
          'Post-investment reporting design',
        ],
      },
      {
        heading: 'What we do not do',
        list: [
          'Introduce investors as a regulated placement agent',
          'Provide regulated investment or corporate-finance advice',
          'Write unsupported assumptions to inflate a valuation',
          'Guarantee that funding will be secured',
        ],
      },
    ],
    related: [
      { label: 'Founders and growth companies', href: '/who-we-help/founders-growth-companies/' },
      { label: 'Management information and planning', href: '/business-advisory/management-information-planning/' },
    ],
    ctaHeading: 'Prepare for the financial questions before they are <em>asked.</em>',
    ctaCopy: 'Tell us about the business, the funding route and your timetable.',
  },
  {
    slug: 'exit-succession',
    path: '/funding-exit/exit-succession/',
    navLabel: 'Exit and succession',
    cardSummary:
      'Financial and tax preparation for a future sale, transfer or succession — improving information, addressing weaknesses and preparing for scrutiny.',
    illustration: 'landlords',
    seoTitle: 'Business Exit and Succession Planning',
    metaDescription:
      'Financial, accounting and tax preparation for owners planning to sell, transfer or pass on an established business — well before a process begins.',
    eyebrow: 'Funding and exit',
    h1: 'Build a business a buyer can understand, and an owner can <em>leave.</em>',
    lead: [
      'A successful exit is rarely created when the buyer first appears. We help owners improve financial information, address weaknesses and prepare for scrutiny well before a sale or succession begins.',
    ],
    serviceType: 'Exit and succession preparation',
    meta: [
      { label: 'For', value: 'Owners planning ahead' },
      { label: 'Ideal horizon', value: 'Two to three years' },
      { label: 'Covers', value: 'Reporting, tax, readiness' },
    ],
    sections: [
      {
        heading: 'Exit begins with the quality of the business',
        paragraphs: [
          'A buyer is not purchasing the historic accounts alone; they are assessing future earnings, risks, systems, dependencies and financial credibility. Preparation therefore often means improving reporting, margins, balance-sheet support and documentation — not only tax planning.',
        ],
      },
      {
        heading: 'Financial exit readiness',
        list: [
          'Review of historic accounts and accounting policies',
          'Consistent monthly management reporting',
          'Revenue, margin and maintainable-earnings analysis',
          'Identification of exceptional or non-recurring items',
          'Working-capital, debtor and creditor review',
          'Preparation for financial due diligence',
        ],
      },
      {
        heading: 'Tax, ownership and timing',
        paragraphs: [
          'The tax consequences of an exit can depend on decisions made years earlier — share ownership, group structure, reliefs, and the structure and timing of the transaction. Early review widens the options; a shorter timetable narrows them.',
          'We help establish clear, supportable information. We do not artificially recast figures to create a misleading result, and specialist legal and tax advice may be required where restructuring is contemplated.',
        ],
      },
    ],
    related: [
      { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
      { label: 'Business owners and private clients', href: '/who-we-help/business-owners-private-clients/' },
    ],
    ctaHeading: 'Make the business ready before the market sets the <em>timetable.</em>',
    ctaCopy: 'The earlier we begin, the more can be done. Arrange an introductory call.',
  },
];

/* ─────────────────────────  LOOKUPS  ───────────────────────── */

export const allDetailPages: DetailPage[] = [
  ...audiences,
  ...advisory,
  ...tax,
  privateClients,
  ...fundingExit,
];
