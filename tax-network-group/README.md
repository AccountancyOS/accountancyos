# The Tax Network Group — website

A premium, conversion-focused marketing site for **The Tax Network Group**, a specialist
UK tax advisory practice for business owners, individuals and families.

This is a standalone project. It is **not** part of AccountancyOS or Blue Tick — it simply
lives in this repository for convenience. It has its own dependencies, build and deploy.

## Stack

- **[Astro](https://astro.build) 5** — static site generation (all pages pre-rendered;
  full core content is in the initial HTML for SEO and AI-search).
- **TypeScript** (strict) with `astro check` in the build.
- **Self-hosted fonts** via `@fontsource` (Cormorant Garamond + JetBrains Mono; Helvetica
  Neue is a system stack). No third-party font requests at runtime.
- **`@astrojs/sitemap`** for `sitemap-index.xml`.
- Design system: **"Bone & Bronze"** palette, editorial layout — from the client-approved
  design handoff.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # astro check && astro build  → dist/
npm run preview    # serve the production build
```

## Structure

```
src/
  site.config.ts        # firm identity, contact, nav, CTAs (placeholders flagged)
  data/services.ts      # the five services — single source (switcher, footer, detail pages)
  data/illustrations.ts # six original inline line illustrations
  lib/schema.ts         # JSON-LD builders (Organization, Service, Breadcrumb, …)
  styles/               # global.css (tokens), interior.css, forms.css, fonts.ts
  layouts/              # BaseLayout, ContentLayout
  components/           # Header, Footer, ServiceSwitcher (island), forms, SEO, …
  content.config.ts     # Insights collection schema (CMS)
  content/insights/     # articles (Markdown)
  pages/                # routes
scripts/leadForm.ts     # progressive-enhancement form handler (client layer)
public/                 # robots.txt, favicon, logo, OG image
```

## Environment

Copy `.env.example` → `.env` and complete before deploying:

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical origin (drives canonical tags, OG, sitemap). |
| `PUBLIC_FORM_ENDPOINT` | Where enquiry / booking forms POST. Until set, forms fall back to a `mailto:` so nothing is lost. |
| `PUBLIC_SCHEDULER_URL` | External scheduler embedded on `/book-a-call/`. Blank = pre-booking form only. |
| `PUBLIC_LOGIN_URL` | Client portal login. Blank = internal placeholder page. |

`astro.config.mjs` and `robots.txt` also hard-code the canonical host — update both to the
final domain.

## Placeholders requiring real information before launch

These are intentionally unfinished and clearly labelled in the UI/report:

1. **Canonical domain** — currently `https://taxnetworkgroup.uk` (implied by the footer
   email). Confirm and update `PUBLIC_SITE_URL`, `astro.config.mjs`, `robots.txt`.
2. **Legal entity details** — company name, number, registered office, professional body
   (`src/site.config.ts` → `legal`). The footer and `/regulatory/` show bracketed tokens
   until confirmed. **No regulated-status wording is published.**
3. **Founder biography** — `/about/` shows an "in preparation" note; replace with a verified
   bio (qualifications, memberships, experience). Do not publish unverified credentials.
4. **Contact details** — a monitored email is assumed; no public telephone is set.
5. **Conversion destinations** — real scheduler and client-portal URLs (see env vars).
6. **Form backend** — `PUBLIC_FORM_ENDPOINT` must be wired to a CRM / form backend /
   serverless function that enforces **server-side validation, rate limiting and spam
   filtering**. The site provides the client layer (validation + honeypot) only.
7. **OG image** — `public/og-default.svg` is provided; generate a `1200×630` PNG/JPG
   equivalent for maximum social-platform compatibility.
8. **Legal pages** (`/privacy/`, `/terms/`, `/cookies/`, `/regulatory/`) are `noindex`
   drafts; complete and approve before indexing.

## Host configuration (redirects)

The site emits trailing-slash directory URLs and a `404.html`. Configure at the host:

- force **HTTPS**, and pick one canonical host (`www` ↔ apex) — 301 the other;
- 301 uppercase → lowercase and non-trailing → trailing slash;
- avoid redirect chains.

Deploys cleanly to any static host (Vercel, Netlify, Cloudflare Pages).

## Insights CMS

Articles are Markdown in `src/content/insights/` validated by `src/content.config.ts`
(title, summary, category, author, reviewer, publish/reviewed/modified dates, featured &
social images, SEO title, meta description, canonical override, index/noindex, sources,
related service/articles). Every article gets a server-rendered URL, `Article` structured
data, breadcrumbs, dates and reading time. Draft articles (`draft: true`) are excluded from
the hub, sitemap and build. One seed article is included; the rest of the editorial roadmap
is intentionally not fabricated.
