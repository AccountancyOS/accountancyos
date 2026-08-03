/**
 * Central configuration for The Tax Network Group.
 *
 * Single source of truth for the firm's identity, contact details, navigation
 * and conversion destinations. Values marked PLACEHOLDER must be confirmed with
 * the client before production launch (see README).
 */

export const site = {
  name: 'The Tax Network Group',
  shortName: 'Tax Network Group',
  /** Canonical origin — kept in sync with astro.config `site`. */
  url: (import.meta.env.PUBLIC_SITE_URL as string | undefined) || 'https://taxnetworkgroup.uk',
  tagline: 'Tax advice with clarity, discretion and commercial sense.',
  description:
    'A specialist UK tax advisory practice for business owners, individuals and families who want their tax affairs handled properly — from day-to-day compliance to high-value advisory work.',
  /** Positioning line reused in structured data and the footer. */
  positioning:
    'A premium tax advisory practice for business owners, individuals and families who value careful, considered counsel.',
  locale: 'en_GB',
  lang: 'en-GB',

  contact: {
    // PLACEHOLDER — confirm the firm's monitored enquiries address.
    email: 'enquiries@taxnetworkgroup.uk',
    // PLACEHOLDER — no public telephone number confirmed yet.
    telephone: '',
    location: 'London · United Kingdom',
    availability: 'By appointment',
    areaServed: 'United Kingdom',
  },

  /**
   * Conversion destinations. The scheduler and login are external tools that
   * are not yet provisioned — they fall back to internal pages so no link is
   * ever broken. Confirm and set via environment variables before launch.
   */
  cta: {
    scheduleLabel: 'Schedule a meeting',
    scheduleUrl: '/book-a-call/',
    loginLabel: 'Login',
    loginUrl: (import.meta.env.PUBLIC_LOGIN_URL as string | undefined) || '/login/',
    schedulerEmbedUrl: (import.meta.env.PUBLIC_SCHEDULER_URL as string | undefined) || '',
    formEndpoint: (import.meta.env.PUBLIC_FORM_ENDPOINT as string | undefined) || '',
  },

  /** External profiles for entity consistency / sameAs. PLACEHOLDER — add when live. */
  social: {
    linkedin: '',
  },

  /**
   * Legal / regulatory placeholders. The footer and legal pages read from here.
   * DO NOT populate with unverified detail — these remain development
   * placeholders until confirmed (company number, registered office, professional
   * body). See README "Placeholders requiring real information".
   */
  legal: {
    entityName: '[LEGAL ENTITY NAME]',
    companyNumber: '[COMPANY NUMBER]',
    registeredOffice: '[REGISTERED OFFICE]',
    professionalBody: '[PROFESSIONAL BODY]',
    foundingYear: 2026,
  },
} as const;

/** Primary navigation — five services (deep-link to the homepage switcher). */
export const primaryNav = [
  { label: 'Limited Company', href: '/#limited-company' },
  { label: 'Self-Employed', href: '/#self-employed' },
  { label: 'Landlords', href: '/#landlords' },
  { label: 'Inheritance Tax', href: '/#inheritance-tax' },
  { label: 'Tax Advisory', href: '/#tax-advisory' },
] as const;

/** Footer link groups. */
export const footerNav = {
  services: [
    { label: 'Limited Company', href: '/#limited-company' },
    { label: 'Self-Employed', href: '/#self-employed' },
    { label: 'Landlords', href: '/#landlords' },
    { label: 'Inheritance Tax', href: '/#inheritance-tax' },
    { label: 'Tax Advisory', href: '/#tax-advisory' },
  ],
  practice: [
    { label: 'About', href: '/about/' },
    { label: 'Approach', href: '/approach/' },
    { label: 'Insights', href: '/insights/' },
    { label: 'Contact', href: '/contact/' },
  ],
  legal: [
    { label: 'Privacy', href: '/privacy/' },
    { label: 'Terms', href: '/terms/' },
    { label: 'Regulatory', href: '/regulatory/' },
    { label: 'Cookies', href: '/cookies/' },
  ],
} as const;
