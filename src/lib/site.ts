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
    tagline: 'AI usage limit changes, with sources',
    headline: 'AI usage limit changes',
    lead: 'Changes to usage limits for Claude, ChatGPT, Codex and Gemini, with dates and sources.',
    tighter: 'tighter',
    looser: 'looser',
    mixed: 'mixed',
    neutral: 'display',
    all: 'All labs',
    limit: 'Limit change',
    display: 'Display change',
    reset: 'free reset',
    resetTag: 'reset',
    resetHint: 'Limits were reset early, for free.',
    unconfirmed: 'Unconfirmed',
    unconfirmedHint: 'Based on user reports, not an official or press source.',
    source: 'Source',
    announced: 'announced',
    reported: 'first reported',
    effective: 'took effect',
    submit: 'Suggest a change',
    alerts: 'Email alerts',
    emailPlaceholder: 'you@example.com',
    subscribe: 'Subscribe',
    rss: 'RSS',
    other: '中文',
    displayOnly: 'display only',
    latest: 'Most recent change per lab',
    log: 'All changes',
    plans: 'Plans',
    daysAgo: 'days ago',
    today: 'today',
    alertsLead: 'Email me when a limit changes or gets reset',
    codeLicense: 'Code: MIT',
    dataLicense: 'Data: CC BY 4.0',
    navLog: 'changes',
    navLimits: 'limits',
    navShare: 'share',
    notAffiliated: 'Not affiliated with Anthropic, OpenAI or Google',
  },
  zh: {
    tagline: 'AI 用量额度变化记录',
    headline: 'AI 用量额度变化记录',
    tighter: '收紧',
    looser: '放宽',
    mixed: '有增有减',
    neutral: '显示',
    lead: 'Claude、ChatGPT、Codex 和 Gemini 的用量额度变化，附日期和来源。',
    all: '全部',
    limit: '额度变化',
    display: '显示方式变化',
    reset: '免费重置',
    resetTag: '重置',
    resetHint: '额度被提前免费重置。',
    unconfirmed: '未证实',
    unconfirmedHint: '来自用户反馈，暂无官方或媒体来源。',
    source: '来源',
    announced: '公布',
    reported: '首次报道',
    effective: '生效',
    submit: '提交变化',
    alerts: '邮件提醒',
    emailPlaceholder: '你的邮箱',
    subscribe: '订阅',
    rss: 'RSS',
    other: 'English',
    displayOnly: '仅显示方式',
    latest: '各家最近一次变化',
    log: '全部变化',
    plans: '方案',
    daysAgo: '天前',
    today: '今天',
    alertsLead: '额度变化或被重置时发邮件提醒我',
    codeLicense: '代码：MIT',
    dataLicense: '数据：CC BY 4.0',
    navLog: '变化',
    navLimits: '额度数据',
    navShare: '分享',
    notAffiliated: '与 Anthropic、OpenAI、Google 无关联',
  },
} as const;

// Diff-style markers: minus means users got less, plus means more.
export const MARK = { tighter: '−', looser: '+', mixed: '±', neutral: '·' } as const;

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
