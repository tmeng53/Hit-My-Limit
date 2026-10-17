import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per change. Frontmatter only; the body is ignored.
const changes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/changes' }),
  schema: z.object({
    date: z.coerce.date(),
    // effective = took effect, announced = lab announced it, reported = first public report
    date_kind: z.enum(['effective', 'announced', 'reported']),
    lab: z.enum(['anthropic', 'openai', 'google']),
    product: z.string(),
    plans: z.array(z.string()).default([]),
    // reset = a lab reset people's limits early, for free (after an outage, a launch, etc.)
    kind: z.enum(['limit', 'display', 'reset']),
    // Which way limits moved for users; neutral for display-only changes
    direction: z.enum(['tighter', 'looser', 'mixed', 'neutral']),
    title: z.string().max(90),
    summary: z.string(),
    title_zh: z.string().optional(),
    summary_zh: z.string().optional(),
    source_url: z.url(),
    source_name: z.string(),
    // unconfirmed = based on user reports, not an official or press source
    status: z.enum(['confirmed', 'unconfirmed']),
  }),
});

export const collections = { changes };
