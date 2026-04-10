import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, upsertScore } from '@/lib/storage';

export async function GET() {
  const entries = getLeaderboard().map((e, i) => ({ ...e, rank: i + 1 }));
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username, score } = await req.json();
    if (!fid || typeof score !== 'number') {
      return NextResponse.json({ error: 'Missing fid or score' }, { status: 400 });
    }
    upsertScore(Number(fid), String(username || 'Player'), Math.floor(score));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
