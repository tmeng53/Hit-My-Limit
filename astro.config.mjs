import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Pages are static by default; the report API, the results page and the dataset run as Vercel Functions.
export default defineConfig({
  site: 'https://hitmylimit.com',
  adapter: vercel(),
});
