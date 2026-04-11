import { NextRequest, NextResponse } from 'next/server';
import { getCheckinData, recordCheckin } from '@/lib/storage';

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_USERNAME_LEN = 50;

export async function GET(req: NextRequest) {
  const fid = Number(req.nextUrl.searchParams.get('fid'));
  if (!fid || !Number.isInteger(fid) || fid <= 0) {
    return NextResponse.json({ error: 'Missing fid' }, { status: 400 });
  }
  return NextResponse.json(getCheckinData(fid));
}

export async function POST(req: NextRequest) {
  try {
    const { fid, username, txHash } = await req.json();

    if (!fid || !Number.isInteger(Number(fid)) || Number(fid) <= 0) {
      return NextResponse.json({ error: 'Missing fid' }, { status: 400 });
    }

    // Require a valid tx hash — proves the ETH transaction was submitted
    if (!txHash || !TX_HASH_RE.test(txHash)) {
      return NextResponse.json({ error: 'Missing or invalid txHash' }, { status: 400 });
    }

    const safeUsername = String(username || 'Player').slice(0, MAX_USERNAME_LEN);
    const result = recordCheckin(Number(fid), safeUsername, String(txHash).toLowerCase());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
