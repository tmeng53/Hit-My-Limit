import type { APIContext } from 'astro';

// Every public page, in English and Chinese. Each entry lists both languages so search engines pair them.
const PATHS = ['/', '/limits', '/changes', '/share'];

const zh = (path: string) => (path === '/' ? '/zh/' : `/zh${path}`);

export const GET = ({ site }: APIContext) => {
  const url = (path: string) => new URL(path, site).href;
  const entries = PATHS.flatMap((path) => {
    const links = [
      `<xhtml:link rel="alternate" hreflang="en" href="${url(path)}"/>`,
      `<xhtml:link rel="alternate" hreflang="zh-CN" href="${url(zh(path))}"/>`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${url(path)}"/>`,
    ].join('');
    return [path, zh(path)].map((p) => `<url><loc>${url(p)}</loc>${links}</url>`);
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
