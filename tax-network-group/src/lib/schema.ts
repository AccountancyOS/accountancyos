/**
 * JSON-LD builders. Only accurate, page-supported information is marked up.
 * Optional fields that are not yet verified (telephone, address, company
 * registration, sameAs, priceRange) are intentionally omitted rather than
 * invented — add them here once confirmed.
 */
import { site } from '../site.config.ts';

const ORG_ID = `${site.url}/#organization`;
const WEBSITE_ID = `${site.url}/#website`;

function abs(path: string): string {
  return /^https?:\/\//.test(path) ? path : new URL(path, site.url).href;
}

/** The Organization node — the entity every other node references as provider/publisher. */
export function organizationNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': ORG_ID,
    name: site.name,
    url: `${site.url}/`,
    description: site.description,
    slogan: site.tagline,
    areaServed: {
      '@type': 'Country',
      name: site.contact.areaServed,
    },
    knowsAbout: [
      'Tax advice',
      'Corporation tax',
      'Self Assessment',
      'Property and landlord taxation',
      'Inheritance tax planning',
      'Tax structuring and advisory',
    ],
    logo: abs('/logo.svg'),
    image: abs('/og-default.svg'),
  };
  // Founding year is a safe, non-sensitive value.
  node.foundingDate = String(site.legal.foundingYear);
  if (site.contact.email) node.email = site.contact.email;
  if (site.contact.telephone) node.telephone = site.contact.telephone;
  const sameAs = [site.social.linkedin].filter(Boolean);
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

/** WebSite node. */
export function websiteNode(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${site.url}/`,
    name: site.name,
    inLanguage: site.lang,
    publisher: { '@id': ORG_ID },
  };
}

/** WebPage node bound to the current page. */
export function webPageNode(opts: {
  url: string;
  name: string;
  description: string;
  type?: string;
}): Record<string, unknown> {
  const url = abs(opts.url);
  return {
    '@type': opts.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    inLanguage: site.lang,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
  };
}

/** Service node for a service detail page. */
export function serviceNode(opts: {
  serviceType: string;
  name: string;
  description: string;
  url: string;
}): Record<string, unknown> {
  return {
    '@type': 'Service',
    serviceType: opts.serviceType,
    name: opts.name,
    description: opts.description,
    url: abs(opts.url),
    provider: { '@id': ORG_ID },
    areaServed: {
      '@type': 'Country',
      name: site.contact.areaServed,
    },
  };
}

export interface Crumb {
  name: string;
  url: string;
}

/** BreadcrumbList node. */
export function breadcrumbNode(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.url),
    })),
  };
}

/** Wrap nodes into an @graph document. */
export function graph(nodes: Record<string, unknown>[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}
