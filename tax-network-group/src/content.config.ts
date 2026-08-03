import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Editorial categories (brief §22). Keep the slugs stable — used in URLs/filters. */
export const insightCategories = [
  { slug: 'accounting-financial-control', label: 'Accounting and financial control' },
  { slug: 'business-tax', label: 'Business tax' },
  { slug: 'management-reporting', label: 'Management reporting' },
  { slug: 'cash-flow-forecasting', label: 'Cash flow and forecasting' },
  { slug: 'funding', label: 'Funding' },
  { slug: 'exit-planning', label: 'Exit planning' },
  { slug: 'business-ownership', label: 'Business ownership' },
] as const;

const categorySlugs = insightCategories.map((c) => c.slug) as [string, ...string[]];

/**
 * Insights collection. Every editorial field the CMS/brief requires is modelled
 * here so articles render with correct metadata, structured data and dates.
 * No articles are seeded — content is authored, not fabricated (brief §23).
 */
const insights = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/insights' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      category: z.enum(categorySlugs),
      author: z.string().default('The Tax Network Group'),
      reviewer: z.string().optional(),
      publishDate: z.coerce.date(),
      lastReviewed: z.coerce.date().optional(),
      lastModified: z.coerce.date().optional(),
      featuredImage: image().optional(),
      featuredImageAlt: z.string().optional(),
      seoTitle: z.string().optional(),
      metaDescription: z.string(),
      canonical: z.string().url().optional(),
      draft: z.boolean().default(false),
      noindex: z.boolean().default(false),
      socialImage: z.string().optional(),
      sources: z
        .array(z.object({ label: z.string(), url: z.string().url() }))
        .optional(),
      relatedService: z.string().optional(),
      relatedArticles: z.array(z.string()).optional(),
      /** Optional override; otherwise estimated from body length. */
      readingTime: z.number().optional(),
    }),
});

export const collections = { insights };
