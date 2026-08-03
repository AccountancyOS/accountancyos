# Tax Network Group — website

A premium, conversion-focused marketing site for **Tax Network Group**, a boutique
accountancy and tax advisory firm for established businesses, ambitious founders and the
people behind them.

Positioning is senior-led, selective and commercially intelligent — *"for business owners
who expect more from their accountant."* The site is organised around client profile and
commercial need, not industry or location.

This is a standalone project. It is **not** part of AccountancyOS or Blue Tick — it lives
in this repository for convenience, with its own dependencies, build and deploy.

## Stack

- **[Astro](https://astro.build) 5** — static site generation (all pages pre-rendered;
  full core content in the initial HTML for SEO and AI-search).
- **TypeScript** (strict) with `astro check` in the build.
- **Self-hosted fonts** via `@fontsource` (Cormorant Garamond + JetBrains Mono; Helvetica
  Neue is a system stack). No third-party requests at runtime.
- **`@astrojs/sitemap`**.
- Design system: **"Bone & Bronze"** palette, editorial layout — retained from the
  client-approved visual identity and applied to the current positioning.

## Commands

```bash
npm install
npm run build      # astro check && astro build  → dist/
npm run dev        # local dev server
npm run preview    # serve the production build
```

## Information architecture

```
/                                             Homepage (10-section narrative)
/who-we-help/                                 Hub
  established-businesses/
  founders-growth-companies/
  business-owners-private-clients/
  changing-accountant/
/business-advisory/                           Hub
  management-information-planning/
  ongoing-accountancy-support/
  growth-strategic-support/
/tax/                                         Hub
  business-tax/
  business-owner-tax-planning/
/private-clients/                             (also "Private-client tax" in the Tax menu)
/funding-exit/                                Hub
  funding-preparation/
  exit-succession/
/about/  /insights/  /insights/[slug]/  /contact/  /book-a-call/
/privacy-policy/  /cookie-policy/  /terms/    (noindex drafts)
404
```

## Source structure

```
src/
  site.config.ts        # identity, nav + dropdowns, footer, CTAs, pricing (placeholders flagged)
  data/pages.ts         # who-we-help + service page copy — single source for routes & hubs
  data/illustrations.ts # six original inline line illustrations
  lib/schema.ts         # JSON-LD builders (Organization, Service, Breadcrumb, …)
  styles/               # global.css (Bone & Bronze tokens), interior.css, forms.css, fonts.ts
  layouts/              # BaseLayout, ContentLayout
  components/           # Header (dropdown nav), Footer, AudienceSwitcher (island),
                        # DetailPageView, HubView, forms, CtaBand, SEO, …
  content.config.ts     # Insights collection schema (CMS)
  content/insights/     # articles (Markdown) — one seeded, sourced article
  pages/                # routes (hubs + dynamic [slug] per section)
scripts/leadForm.ts     # progressive-enhancement form handler (client layer)
public/                 # robots.txt, _redirects, favicon, logo, OG image
```

## Environment

Copy `.env.example` → `.env` and complete before deploying:

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical origin (canonical tags, OG, sitemap). |
| `PUBLIC_FORM_ENDPOINT` | Where the enquiry / booking forms POST. Until set, forms fall back to `mailto:` so nothing is lost. |
| `PUBLIC_SCHEDULER_URL` | External scheduler embedded on `/book-a-call/`. Blank = pre-booking form only. |

`astro.config.mjs` and `robots.txt` also hard-code the canonical host — update to the final
domain.

## Placeholders requiring real information before launch

1. **Canonical domain** — currently `https://taxnetworkgroup.uk`. Update `PUBLIC_SITE_URL`,
   `astro.config.mjs`, `robots.txt`.
2. **Legal entity details** — company name, number, registered office, professional body
   (`src/site.config.ts` → `legal`). Footer and legal pages show bracketed tokens until
   confirmed. **No regulated-status wording is published.**
3. **Founder biography** — `/about/` shows an "in preparation" note; replace with a verified
   bio. Do not publish unverified credentials.
4. **Contact details** — a monitored email is assumed; no public telephone is set.
5. **Scheduler** (`PUBLIC_SCHEDULER_URL`) and **form backend** (`PUBLIC_FORM_ENDPOINT`).
   The endpoint must enforce **server-side validation, rate limiting and spam filtering** —
   the site provides the client layer (validation + honeypot) only.
6. **OG image** — `public/og-default.svg` is provided; generate a `1200×630` PNG/JPG for
   maximum social-platform compatibility.
7. **Legal pages** (`/privacy-policy/`, `/cookie-policy/`, `/terms/`) are `noindex` drafts;
   complete and approve before indexing.

## Positioning & pricing notes

- Ongoing engagements are described as starting **from £300 plus VAT per month**, priced up
  according to involvement — presented as a threshold, never a package price.
- The ~£250,000 revenue figure is an indicator of suitability, kept out of the hero as a
  hard gate.
- No self-employed / landlord / inheritance-tax-only / industry / location pages.

## Host configuration (redirects)

`public/_redirects` maps stale routes from the previous positioning to the current
structure (Netlify / Cloudflare Pages format; replicate in `vercel.json` on Vercel). Also
configure at the host: force HTTPS, choose one canonical host (`www` ↔ apex, 301 the other),
301 uppercase → lowercase and non-trailing → trailing slash, and avoid redirect chains.

## Insights CMS

Articles are Markdown in `src/content/insights/`, validated by `src/content.config.ts`
(title, summary, category, author, reviewer, publish/reviewed/modified dates, images, SEO
title, meta description, canonical override, index/noindex, sources, related service &
articles). Each article gets a server-rendered URL, `Article` structured data, breadcrumbs,
dates and reading time. Drafts are excluded from the hub, sitemap and build. One seed
article is included; the rest of the roadmap is intentionally not fabricated.
