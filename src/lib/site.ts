import { getCollection, type CollectionEntry } from 'astro:content';

export type Change = CollectionEntry<'changes'>;
export type Lang = 'en' | 'zh';

export const REPO_URL = 'https://github.com/tmeng53/hit-my-limit';
export const SUBMIT_URL = `${REPO_URL}/issues/new?template=change.yml`;

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
    subscribe: 'email me',
    rss: 'RSS',
    other: '中文',
    displayOnly: 'display only',
    logTitle: 'Every change to AI usage limits.',
    logSub: 'Claude, ChatGPT, Codex and Gemini. Dated, with sources.',
    lastChange: 'last change',
    log: 'All changes',
    plans: 'Plans',
    dayAgo: '1 day ago',
    daysAgo: 'days ago',
    today: 'today',
    alertsLead: 'Email me when a limit changes or gets reset',
    signupOk: "Done. You'll get an email next time a limit changes.",
    signupInvalid: "That email doesn't look right.",
    signupError: 'Something went wrong. Try again in a bit.',
    codeLicense: 'Code: MIT',
    navLog: 'changes',
    navLimits: 'limits',
    navShare: 'share a hit',
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
    subscribe: '提醒我',
    rss: 'RSS',
    other: 'English',
    displayOnly: '仅显示方式',
    logTitle: 'AI 用量额度的每一次变化。',
    logSub: 'Claude、ChatGPT、Codex 和 Gemini，附日期和来源。',
    lastChange: '最近一次',
    log: '全部变化',
    plans: '套餐',
    dayAgo: '1 天前',
    daysAgo: '天前',
    today: '今天',
    alertsLead: '额度变化或被重置时发邮件提醒我',
    signupOk: '好了，下次额度有变化会发邮件给你。',
    signupInvalid: '邮箱格式好像不对。',
    signupError: '出了点问题，稍后再试。',
    codeLicense: '代码：MIT',
    navLog: '变化',
    navLimits: '额度数据',
    navShare: '报一下',
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
