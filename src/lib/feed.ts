import rss from '@astrojs/rss';
import { LABS, getChanges, summaryFor, t, titleFor, type Lang } from './site';

export async function feed(site: URL, lang: Lang, lab?: keyof typeof LABS) {
  const changes = await getChanges(lab);
  const base = lang === 'zh' ? '/zh/' : '/';
  const labName = lab ? ` · ${LABS[lab][lang]}` : '';
  return rss({
    title: `Hit My Limit${labName}`,
    description: t[lang].tagline,
    site,
    items: changes.map((c) => ({
      title: `${LABS[c.data.lab][lang]}: ${titleFor(c, lang)}`,
      description: `${summaryFor(c, lang)} (${t[lang].source}: ${c.data.source_name})`,
      pubDate: c.data.date,
      link: `${base}#${c.id}`,
      // One category per item. Readers such as the Mac app treat "reset" as a free reset.
      categories: [c.data.kind],
    })),
  });
}
