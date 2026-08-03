/**
 * Central configuration for Tax Network Group.
 *
 * Single source of truth for the firm's identity, contact details, navigation
 * and conversion destinations. Values marked PLACEHOLDER must be confirmed with
 * the client before production launch (see README).
 */

export const site = {
  name: 'Tax Network Group',
  shortName: 'Tax Network Group',
  /** Canonical origin — kept in sync with astro.config `site`. */
  url: (import.meta.env.PUBLIC_SITE_URL as string | undefined) || 'https://taxnetworkgroup.uk',
  tagline: 'For business owners who expect more from their accountant.',
  description:
    'Tax Network Group provides accountancy, tax and financial advice to established businesses, ambitious founders and the people behind them — dependable compliance with clearer information, proactive planning and senior advice throughout the year.',
  /** Positioning line reused in structured data and the footer. */
  positioning:
    'Accountancy, tax and financial advice for established businesses, ambitious founders and the people behind them.',
  locale: 'en_GB',
  lang: 'en-GB',

  contact: {
    // PLACEHOLDER — confirm the firm's monitored enquiries address.
    email: 'enquiries@taxnetworkgroup.uk',
    // PLACEHOLDER — no public telephone number confirmed yet.
    telephone: '',
    location: 'United Kingdom',
    availability: 'By appointment',
    areaServed: 'United Kingdom',
  },

  /**
   * Conversion destinations. The scheduler is an external tool that is not yet
   * provisioned — it falls back to the pre-booking form so no link is broken.
   */
  cta: {
    primaryLabel: 'Book an introductory call',
    primaryUrl: '/book-a-call/',
    secondaryLabel: 'See who we help',
    secondaryUrl: '/who-we-help/',
    schedulerEmbedUrl: (import.meta.env.PUBLIC_SCHEDULER_URL as string | undefined) || '',
    formEndpoint: (import.meta.env.PUBLIC_FORM_ENDPOINT as string | undefined) || '',
  },

  /** Supporting text near important CTAs. */
  ctaSupport:
    'A focused introductory conversation to understand your business, what you need from your accountant and whether Tax Network Group is the right fit.',

  /** Pricing / qualification wording (premium positioning — not a package price). */
  pricing: {
    fromLine:
      'Ongoing engagements start from £300 plus VAT per month, with reporting, advisory and more complex relationships priced according to the level of involvement required.',
    suitabilityLine:
      'Our ongoing services are designed primarily for established and ambitious owner-managed businesses, typically with growing complexity and revenue above approximately £250,000.',
  },

  /** External profiles for entity consistency / sameAs. PLACEHOLDER — add when live. */
  social: {
    linkedin: '',
  },

  /**
   * Legal / regulatory placeholders. The footer and legal pages read from here.
   * DO NOT populate with unverified detail — these remain development
   * placeholders until confirmed. See README "Placeholders requiring real information".
   */
  legal: {
    entityName: '[LEGAL ENTITY NAME]',
    companyNumber: '[COMPANY NUMBER]',
    registeredOffice: '[REGISTERED OFFICE]',
    professionalBody: '[PROFESSIONAL BODY]',
    foundingYear: 2026,
  },
} as const;

/**
 * Primary navigation. Dropdowns are rendered on desktop and flattened on mobile.
 */
export const primaryNav = [
  {
    label: 'Who we help',
    href: '/who-we-help/',
    children: [
      { label: 'Established businesses', href: '/who-we-help/established-businesses/' },
      { label: 'Founders and growth companies', href: '/who-we-help/founders-growth-companies/' },
      { label: 'Business owners and private clients', href: '/who-we-help/business-owners-private-clients/' },
      { label: 'Changing accountant', href: '/who-we-help/changing-accountant/' },
    ],
  },
  {
    label: 'Business advisory',
    href: '/business-advisory/',
    children: [
      { label: 'Overview', href: '/business-advisory/' },
      { label: 'Management information and planning', href: '/business-advisory/management-information-planning/' },
      { label: 'Ongoing accountancy support', href: '/business-advisory/ongoing-accountancy-support/' },
      { label: 'Growth and strategic support', href: '/business-advisory/growth-strategic-support/' },
    ],
  },
  {
    label: 'Tax',
    href: '/tax/',
    children: [
      { label: 'Business tax', href: '/tax/business-tax/' },
      { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
      { label: 'Private-client tax', href: '/private-clients/' },
    ],
  },
  {
    label: 'Funding and exit',
    href: '/funding-exit/',
    children: [
      { label: 'Funding preparation', href: '/funding-exit/funding-preparation/' },
      { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
    ],
  },
  { label: 'Private clients', href: '/private-clients/' },
  { label: 'Insights', href: '/insights/' },
  { label: 'About', href: '/about/' },
] as const;

/** Footer link groups. */
export const footerNav = {
  whoWeHelp: [
    { label: 'Established businesses', href: '/who-we-help/established-businesses/' },
    { label: 'Founders and growth companies', href: '/who-we-help/founders-growth-companies/' },
    { label: 'Business owners and private clients', href: '/who-we-help/business-owners-private-clients/' },
    { label: 'Changing accountant', href: '/who-we-help/changing-accountant/' },
  ],
  advisory: [
    { label: 'Business advisory', href: '/business-advisory/' },
    { label: 'Management information and planning', href: '/business-advisory/management-information-planning/' },
    { label: 'Ongoing accountancy support', href: '/business-advisory/ongoing-accountancy-support/' },
    { label: 'Growth and strategic support', href: '/business-advisory/growth-strategic-support/' },
  ],
  taxFunding: [
    { label: 'Business tax', href: '/tax/business-tax/' },
    { label: 'Business-owner tax planning', href: '/tax/business-owner-tax-planning/' },
    { label: 'Private clients', href: '/private-clients/' },
    { label: 'Funding preparation', href: '/funding-exit/funding-preparation/' },
    { label: 'Exit and succession', href: '/funding-exit/exit-succession/' },
  ],
  firm: [
    { label: 'About', href: '/about/' },
    { label: 'Insights', href: '/insights/' },
    { label: 'Contact', href: '/contact/' },
    { label: 'Book an introductory call', href: '/book-a-call/' },
  ],
  legal: [
    { label: 'Privacy policy', href: '/privacy-policy/' },
    { label: 'Cookie policy', href: '/cookie-policy/' },
    { label: 'Terms', href: '/terms/' },
  ],
} as const;
