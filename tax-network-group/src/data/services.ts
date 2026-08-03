/**
 * The five services. Single source of truth for:
 *  - the homepage switcher (tabs on desktop, accordion on mobile)
 *  - the footer / navigation service links
 *  - the five service detail pages (`/services/[slug]/`)
 *
 * Switcher copy (`headingParts`, `body`, `suitedTo`, `engagement`) is the final,
 * client-approved copy from the design handoff — do not rewrite it.
 *
 * `detail` copy is authored for the detail pages: substantive, distinct and
 * technically careful. It states general positions only and is not advice; every
 * page carries a disclaimer. No credentials, statistics or outcomes are invented.
 */

export type IllustrationKey =
  | 'limited'
  | 'selfEmployed'
  | 'landlords'
  | 'inheritance'
  | 'advisory';

export interface ServiceDetailSection {
  heading: string;
  /** Paragraphs of body copy. */
  paragraphs?: string[];
  /** Optional bulleted list rendered after the paragraphs. */
  list?: string[];
}

export interface ServiceDetail {
  seoTitle: string;
  metaDescription: string;
  /** serviceType used in Service JSON-LD. */
  serviceType: string;
  h1: string;
  /** Lead paragraphs directly under the H1. */
  lead: string[];
  sections: ServiceDetailSection[];
  /** Short, honest note on fees / engagement shape. */
  engagementNote: string;
  /** Slugs of the two most relevant sibling services to cross-link. */
  related: string[];
}

export interface Service {
  /** Stable id — also the switcher tab id and homepage hash target. */
  id: string;
  /** URL slug under /services/. Matches `id`. */
  slug: string;
  number: string;
  label: string;
  /** Switcher H3, split so the italic accent phrase can be styled. */
  headingParts: [before: string, accent: string, after: string];
  /** Switcher / accordion body paragraph. */
  body: string;
  suitedTo: string;
  engagement: string;
  illustration: IllustrationKey;
  detail: ServiceDetail;
}

export const services: Service[] = [
  {
    id: 'limited-company',
    slug: 'limited-company',
    number: '01',
    label: 'Limited Company',
    headingParts: [
      'Support for company owners who want their affairs ',
      'managed with care',
      ' and precision.',
    ],
    body: 'We advise on the practical tax matters that shape owner-managed businesses, from company compliance and remuneration planning to wider structuring considerations as businesses grow.',
    suitedTo: 'Owner-managed businesses',
    engagement: 'Ongoing or project',
    illustration: 'limited',
    detail: {
      seoTitle: 'Limited Company Tax Advice for Owner-Managed Businesses',
      metaDescription:
        'Corporation tax, remuneration planning and structuring advice for owner-managed limited companies. Specialist, senior-led tax support from The Tax Network Group.',
      serviceType: 'Limited company tax advice',
      h1: 'Tax advice for limited company owners.',
      lead: [
        'Running a limited company brings a set of tax decisions that rarely sit still — how profits are taxed, how they are extracted, and how the structure should adapt as the business grows.',
        'We advise owner-managed companies on the tax matters that shape those decisions, combining reliable compliance with advice that is offered before the decision is made rather than after.',
      ],
      sections: [
        {
          heading: 'Where we help',
          paragraphs: [
            'Most owner-managed companies need two things from a tax adviser: dependable compliance, and someone who understands the commercial picture well enough to give useful advice on the decisions that matter.',
          ],
          list: [
            'Corporation tax computations and returns',
            'Timing of profit, expenditure and capital allowances',
            'Director remuneration — salary, dividends and available reserves',
            'Extraction of profit and use of surplus cash',
            'Company structure, holding companies and groups',
            'Associated company and connected-party considerations',
            'Employee and management incentives',
            'Correspondence with HMRC relating to the company',
          ],
        },
        {
          heading: 'Remuneration and profit extraction',
          paragraphs: [
            'How an owner is paid, and how profit leaves the company, is one of the most frequently asked and most frequently over-simplified questions in owner-managed business tax.',
            'The right answer depends on the level of profit, other income, reserves, pension position and the owner’s wider plans. We set out the options, the assumptions behind each and a clear recommendation — rather than applying a single default to every client.',
          ],
        },
        {
          heading: 'Structuring as the business grows',
          paragraphs: [
            'As a company grows, questions of structure become more important: whether a holding company is appropriate, how to hold property or investments, how to bring in or reward key people, and how today’s decisions affect a future sale.',
            'We consider these questions in the round — commercial objective first, tax treatment second — and coordinate with legal and other specialist advisers where a step requires it.',
          ],
        },
      ],
      engagementNote:
        'Delivered as ongoing support or as a defined project. Scope, responsibilities and fee are agreed in writing after an introductory conversation.',
      related: ['self-employed', 'tax-advisory'],
    },
  },
  {
    id: 'self-employed',
    slug: 'self-employed',
    number: '02',
    label: 'Self-Employed',
    headingParts: ['Dependable advice and a clear view of your ', 'position', '.'],
    body: 'For consultants, freelancers and sole traders who want dependable advice and a clear view of their position. We help self-employed clients stay organised, compliant and properly structured, without losing sight of the commercial realities behind the numbers.',
    suitedTo: 'Consultants & sole traders',
    engagement: 'Annual & ongoing',
    illustration: 'selfEmployed',
    detail: {
      seoTitle: 'Tax Advice for the Self-Employed, Consultants and Sole Traders',
      metaDescription:
        'Self Assessment, expenses, and structuring advice for consultants, freelancers and sole traders who want to stay organised, compliant and properly advised.',
      serviceType: 'Self-employed tax advice',
      h1: 'Tax advice for the self-employed.',
      lead: [
        'Working for yourself should not mean working in the dark on tax. Consultants, freelancers and sole traders need advice that keeps them compliant and organised — and a clear view of what they will owe and when.',
        'We provide dependable Self Assessment support alongside advice on the decisions that genuinely change a self-employed position.',
      ],
      sections: [
        {
          heading: 'Where we help',
          list: [
            'Self Assessment tax returns and payments on account',
            'Allowable expenses and record-keeping that stands up to scrutiny',
            'National Insurance and how it affects take-home position',
            'Whether — and when — incorporation is worth considering',
            'Making Tax Digital for Income Tax readiness',
            'Planning for tax across the year rather than at the deadline',
          ],
        },
        {
          heading: 'A clear view of your position',
          paragraphs: [
            'A common frustration for self-employed clients is finding out what they owe only when the return is filed. We work to remove that surprise: a reliable estimate of the liability, a sensible view of payments on account, and time to plan.',
          ],
        },
        {
          heading: 'Sole trader or limited company?',
          paragraphs: [
            'Incorporation is often presented as an automatic saving. In practice it depends on profit levels, how much you need to draw, and your longer-term plans, and it brings obligations of its own.',
            'We give a straight answer for your circumstances — including when staying as a sole trader is the better decision — and, where incorporation is right, help you make the change properly.',
          ],
        },
      ],
      engagementNote:
        'Typically an annual Self Assessment engagement, with ongoing advice where it is useful. Fees are agreed up front.',
      related: ['limited-company', 'landlords'],
    },
  },
  {
    id: 'landlords',
    slug: 'landlords',
    number: '03',
    label: 'Landlords',
    headingParts: [
      'Advice for property owners with straightforward or ',
      'more complex',
      ' portfolios.',
    ],
    body: 'Whether you hold one property or many, we help you navigate the tax position with clarity, from annual reporting obligations to longer-term planning around ownership, extraction and disposal.',
    suitedTo: 'Single & portfolio holders',
    engagement: 'Reporting & planning',
    illustration: 'landlords',
    detail: {
      seoTitle: 'Landlord and Property Tax Advice | The Tax Network Group',
      metaDescription:
        'Property tax advice for landlords — from annual reporting on rental income to ownership structure, finance costs, and planning around disposals.',
      serviceType: 'Landlord and property tax advice',
      h1: 'Tax advice for landlords and property owners.',
      lead: [
        'Property is taxed at almost every stage — as income while it is held, and as a gain when it is sold — and the rules around ownership and finance costs are less generous than many landlords expect.',
        'Whether you hold one property or a substantial portfolio, we help you report accurately and plan ahead around ownership, extraction and disposal.',
      ],
      sections: [
        {
          heading: 'Where we help',
          list: [
            'Reporting rental income and allowable costs correctly',
            'Finance-cost restriction on residential lettings',
            'Ownership structure — personal, joint, or through a company',
            'Capital Gains Tax on disposal, including the reporting deadline',
            'Furnished holiday lets and mixed-use property',
            'Longer-term planning around succession and gifting',
          ],
        },
        {
          heading: 'How the property is owned matters',
          paragraphs: [
            'Whether property is held personally, jointly or through a company affects the tax on rental profits, the treatment of finance costs, and the position on a later sale or transfer.',
            'There is no single right answer — a structure that suits a growing portfolio may be unnecessary for a single property. We assess your circumstances and set out the trade-offs plainly, including the costs and obligations that come with each option.',
          ],
        },
        {
          heading: 'Planning around a disposal',
          paragraphs: [
            'Capital Gains Tax on residential property carries its own reporting and payment deadline after completion, and the calculation is often more involved than expected.',
            'We help you understand the likely position before you sell, so the decision is made with the tax consequences in view rather than discovered afterwards.',
          ],
        },
      ],
      engagementNote:
        'Combines annual reporting with planning as decisions arise. Scope and fee reflect the size and complexity of the portfolio.',
      related: ['inheritance-tax', 'self-employed'],
    },
  },
  {
    id: 'inheritance-tax',
    slug: 'inheritance-tax',
    number: '04',
    label: 'Inheritance Tax',
    headingParts: [
      'Inheritance tax planning requires care, foresight and ',
      'sensible judgement',
      '.',
    ],
    body: 'We advise individuals and families who want to preserve wealth, plan ahead and take a considered approach to succession, gifting and estate structuring.',
    suitedTo: 'Individuals & families',
    engagement: 'Long-term planning',
    illustration: 'inheritance',
    detail: {
      seoTitle: 'Inheritance Tax Planning for Individuals and Families',
      metaDescription:
        'Considered inheritance tax planning — reliefs, gifting, trusts and succession — for individuals and families who want to plan ahead and preserve wealth.',
      serviceType: 'Inheritance tax planning',
      h1: 'Inheritance tax planning that takes the long view.',
      lead: [
        'Inheritance tax rewards foresight. The most effective planning is rarely dramatic; it is a series of considered decisions taken in good time, with a clear understanding of the family’s wider objectives.',
        'We advise individuals and families who want to preserve wealth, provide for the next generation and approach succession thoughtfully.',
      ],
      sections: [
        {
          heading: 'Where we help',
          list: [
            'Understanding the current estate position and likely exposure',
            'Available reliefs and exemptions, and the conditions attached to them',
            'Lifetime gifting and the seven-year position',
            'The role of trusts, and where they are and are not appropriate',
            'Business and agricultural property considerations',
            'Coordinating with Wills, powers of attorney and family objectives',
          ],
        },
        {
          heading: 'Planning that respects the whole picture',
          paragraphs: [
            'Good inheritance tax planning is never only about tax. Access to capital, control, fairness between family members and the wishes of the individual all matter, and the tax position has to sit within them rather than override them.',
            'We take time to understand what the family is trying to achieve, then advise on the steps that support it — and are honest about where a saving is not worth the loss of flexibility.',
          ],
        },
        {
          heading: 'Working alongside your other advisers',
          paragraphs: [
            'Inheritance tax planning frequently touches on Wills, trusts and long-term financial planning. Where legal or regulated financial advice is required, we say so and work alongside your solicitor and other advisers so that responsibilities stay clear.',
          ],
        },
      ],
      engagementNote:
        'Usually a long-term planning relationship, reviewed as circumstances and legislation change. Initial work is scoped as a defined piece.',
      related: ['tax-advisory', 'landlords'],
    },
  },
  {
    id: 'tax-advisory',
    slug: 'tax-advisory',
    number: '05',
    label: 'Tax Advisory',
    headingParts: [
      'Specialist advice for clients facing more ',
      'complex tax questions',
      '.',
    ],
    body: 'This includes transactions, restructuring, profit extraction, property matters, family wealth planning and broader strategic tax issues where experienced judgement matters as much as technical accuracy.',
    suitedTo: 'Complex matters',
    engagement: 'Project-led',
    illustration: 'advisory',
    detail: {
      seoTitle: 'Specialist Tax Advisory — Transactions, Restructuring and Planning',
      metaDescription:
        'Specialist, project-led tax advisory for complex questions: transactions, restructuring, profit extraction, property and family wealth, where judgement matters.',
      serviceType: 'Specialist tax advisory',
      h1: 'Specialist advice for complex tax questions.',
      lead: [
        'Some questions do not fit a standard service. A transaction, a restructuring, a change in ownership or a significant personal decision can carry tax consequences that reward careful, experienced judgement.',
        'Our advisory work is project-led: we take the time to understand the objective, model the options and give advice that is technically robust and commercially grounded.',
      ],
      sections: [
        {
          heading: 'The kinds of matters we advise on',
          list: [
            'Business sales, acquisitions and reorganisations',
            'Group and holding-company structuring',
            'Profit extraction and the use of accumulated reserves',
            'Property transactions and structuring',
            'Family wealth, succession and intergenerational planning',
            'Reviewing significant transactions before they are implemented',
          ],
        },
        {
          heading: 'How we approach an advisory engagement',
          paragraphs: [
            'We start with the commercial objective, not the tax. From there we set out the realistic options, the expected tax consequences of each, and the practical and legal implications — including the assumptions and the areas of genuine uncertainty.',
            'The aim is advice you can act on with confidence: a clear recommendation, the reasoning behind it, and the steps and deadlines required to put it in place.',
          ],
        },
        {
          heading: 'Deliberate, not aggressive',
          paragraphs: [
            'We advise on planning that is soundly based and defensible. We do not promote artificial or aggressive arrangements, and we are candid when the most sensible course is to accept a tax cost in exchange for a better commercial outcome.',
          ],
        },
      ],
      engagementNote:
        'Scoped project by project according to the matter, the information available and the timetable. Fee basis is agreed before work begins.',
      related: ['limited-company', 'inheritance-tax'],
    },
  },
];

export const serviceById = (id: string): Service | undefined =>
  services.find((s) => s.id === id);
