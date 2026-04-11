import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, upsertScore } from '@/lib/storage';

const MAX_SCORE = 9_999_999;
const MAX_USERNAME_LEN = 50;

export async function GET() {
  const entries = getLeaderboard().map((e, i) => ({ ...e, rank: i + 1 }));
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username, score } = await req.json();

    if (!fid || !Number.isInteger(Number(fid)) || Number(fid) <= 0) {
      return NextResponse.json({ error: 'Missing fid' }, { status: 400 });
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }

    const safeScore    = Math.min(Math.floor(score), MAX_SCORE);
    const safeUsername = String(username || 'Player').slice(0, MAX_USERNAME_LEN);

    upsertScore(Number(fid), safeUsername, safeScore);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
