import { NextResponse } from 'next/server';
import { normalizeSymbol } from '@market-reader/core';
import { aiEnabled, askAssistant, takeQuota, type ChatMessage } from '@/lib/ai';
import { getViewer } from '@/lib/viewer';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: 'The assistant is not set up yet. Add ANTHROPIC_API_KEY to the .env file and restart.' }, { status: 503 });
  }
  let body: { messages?: ChatMessage[]; symbol?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send JSON with a messages array.' }, { status: 400 });
  }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Ask a question to get started.' }, { status: 400 });
  }
  const v = await getViewer(req);
  const visitor = v.user?.id ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const limit = v.limits.aiQuestionsPerDay;
  const quota = await takeQuota(visitor, limit, v.user?.id);
  if (!quota.allowed) {
    const more = v.plan === 'pro' ? '' : v.plan === 'free' ? ' Pro includes 100 a day.' : ' Sign in for more, or go Pro for 100 a day.';
    return NextResponse.json({ error: `You’ve used today’s ${limit} questions. The count resets at midnight UTC.${more}`, plan: v.plan }, { status: 429 });
  }
  try {
    const result = await askAssistant(messages, { symbol: body.symbol ? normalizeSymbol(body.symbol) : undefined, webSearch: v.limits.aiWebSearch });
    return NextResponse.json({ ...result, remaining: quota.remaining });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
