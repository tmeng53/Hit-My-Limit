import { getCollection, type CollectionEntry } from 'astro:content';

export type Change = CollectionEntry<'changes'>;
export type Lang = 'en' | 'zh';

export const REPO_URL = 'https://github.com/tmeng53/hit-my-limit';
export const SUBMIT_URL = `${REPO_URL}/issues/new?template=change.yml`;
// Buttondown newsletter username for email alerts.
export const BUTTONDOWN_USER = 'hitmylimit';

export const LABS = {
  anthropic: { en: 'Anthropic', zh: 'Anthropic' },
  openai: { en: 'OpenAI', zh: 'OpenAI' },
  google: { en: 'Google', zh: 'Google' },
} as const;

export const t = {
  en: {
    tagline: 'Every change to AI subscription limits, with sources.',
    lead: 'Labs change usage limits, and how they show them, often without notice. This log records each change for Claude, ChatGPT and Codex, and Gemini, with a date and a source.',
    all: 'All labs',
    limit: 'Limit change',
    display: 'Display change',
    unconfirmed: 'Unconfirmed',
    unconfirmedHint: 'Based on user reports, not an official or press source.',
    source: 'Source',
    announced: 'announced',
    reported: 'first reported',
    effective: 'took effect',
    submit: 'Suggest a change',
    alerts: 'Get alerts',
    emailPlaceholder: 'you@example.com',
    subscribe: 'Subscribe',
    rss: 'RSS',
    other: '中文',
    otherHref: '/zh/',
    codeLicense: 'Code: MIT',
    dataLicense: 'Data: CC BY 4.0',
  },
  zh: {
    tagline: 'AI 订阅额度的每一次变化，都有出处。',
    lead: '各家 AI 公司经常在不通知用户的情况下调整用量额度和额度显示方式。这里记录 Claude、ChatGPT 与 Codex、Gemini 的每一次变化，附日期和来源。',
    all: '全部',
    limit: '额度变化',
    display: '显示方式变化',
    unconfirmed: '未证实',
    unconfirmedHint: '来自用户反馈，暂无官方或媒体来源。',
    source: '来源',
    announced: '公布',
    reported: '首次报道',
    effective: '生效',
    submit: '提交变化',
    alerts: '订阅提醒',
    emailPlaceholder: '你的邮箱',
    subscribe: '订阅',
    rss: 'RSS',
    other: 'English',
    otherHref: '/',
    codeLicense: '代码：MIT',
    dataLicense: '数据：CC BY 4.0',
  },
} as const;

export async function getChanges(lab?: keyof typeof LABS): Promise<Change[]> {
  const all = await getCollection('changes', (c) => !lab || c.data.lab === lab);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function titleFor(c: Change, lang: Lang) {
  return (lang === 'zh' && c.data.title_zh) || c.data.title;
}

export function summaryFor(c: Change, lang: Lang) {
  return (lang === 'zh' && c.data.summary_zh) || c.data.summary;
}

export function formatDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
