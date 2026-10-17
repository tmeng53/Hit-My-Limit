import type { APIContext } from 'astro';
import { LABS } from '../../lib/site';
import { feed } from '../../lib/feed';

export const getStaticPaths = () => Object.keys(LABS).map((lab) => ({ params: { lab } }));

export const GET = (ctx: APIContext) => feed(ctx.site!, 'en', ctx.params.lab as keyof typeof LABS);
