import { NextRequest, NextResponse } from 'next/server';
import { getCheckinData, recordCheckin } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const fid = Number(req.nextUrl.searchParams.get('fid'));
  if (!fid) return NextResponse.json({ error: 'Missing fid' }, { status: 400 });
  return NextResponse.json(getCheckinData(fid));
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username } = await req.json();
    if (!fid) return NextResponse.json({ error: 'Missing fid' }, { status: 400 });
    const result = recordCheckin(Number(fid), String(username || 'Player'));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
