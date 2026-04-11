import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON<T>(file: string, fallback: T): T {
  ensureDir();
  const fp = path.join(DATA_DIR, file);
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: unknown) {
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export interface ScoreEntry {
  fid: number;
  username: string;
  score: number;
  date: string;
}

export function getLeaderboard(): ScoreEntry[] {
  return readJSON<ScoreEntry[]>('leaderboard.json', []);
}

export function upsertScore(fid: number, username: string, score: number): void {
  const entries = getLeaderboard();
  const idx = entries.findIndex(e => e.fid === fid);
  if (idx >= 0) {
    if (score > entries[idx].score) {
      entries[idx] = { fid, username, score, date: new Date().toISOString() };
    }
  } else {
    entries.push({ fid, username, score, date: new Date().toISOString() });
  }
  entries.sort((a, b) => b.score - a.score);
  writeJSON('leaderboard.json', entries.slice(0, 100)); // keep top 100
}

// ── Check-ins ─────────────────────────────────────────────────────────────────
interface CheckinStore {
  [fid: string]: { streak: number; lastCheckin: string; txHash?: string };
}

// Set of all tx hashes already used (across all FIDs) — prevents replay attacks
function usedTxHashes(): Set<string> {
  const store = readJSON<CheckinStore>('checkins.json', {});
  const hashes = new Set<string>();
  for (const entry of Object.values(store)) {
    if (entry.txHash) hashes.add(entry.txHash);
  }
  return hashes;
}

export function getCheckinData(fid: number) {
  const store = readJSON<CheckinStore>('checkins.json', {});
  const entry = store[String(fid)];
  if (!entry) return { streak: 0, lastCheckin: null, canCheckin: true };

  const lastDate = new Date(entry.lastCheckin);
  const today    = new Date();
  const isSameDay =
    lastDate.getUTCFullYear() === today.getUTCFullYear() &&
    lastDate.getUTCMonth()    === today.getUTCMonth() &&
    lastDate.getUTCDate()     === today.getUTCDate();

  return {
    streak: entry.streak,
    lastCheckin: entry.lastCheckin,
    canCheckin: !isSameDay,
  };
}

export function recordCheckin(fid: number, username: string, txHash?: string): {
  streak: number; lastCheckin: string; canCheckin: boolean; message: string;
} {
  // Reject if this tx hash was already used (replay attack)
  if (txHash) {
    const used = usedTxHashes();
    if (used.has(txHash)) {
      return { streak: 0, lastCheckin: '', canCheckin: false, message: 'Transaction already used.' };
    }
  }

  const store = readJSON<CheckinStore>('checkins.json', {});
  const key   = String(fid);
  const existing = store[key];
  const today = new Date();
  const todayISO = today.toISOString();

  if (existing) {
    const lastDate = new Date(existing.lastCheckin);
    const isSameDay =
      lastDate.getUTCFullYear() === today.getUTCFullYear() &&
      lastDate.getUTCMonth()    === today.getUTCMonth() &&
      lastDate.getUTCDate()     === today.getUTCDate();

    if (isSameDay) {
      return { streak: existing.streak, lastCheckin: existing.lastCheckin, canCheckin: false, message: 'Already checked in today!' };
    }

    const isYesterday = (() => {
      const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      return lastDate.getUTCFullYear() === yesterday.getUTCFullYear() &&
             lastDate.getUTCMonth()    === yesterday.getUTCMonth() &&
             lastDate.getUTCDate()     === yesterday.getUTCDate();
    })();

    const newStreak = isYesterday ? existing.streak + 1 : 1;
    store[key] = { streak: newStreak, lastCheckin: todayISO, ...(txHash ? { txHash } : {}) };
    writeJSON('checkins.json', store);
    const msg = newStreak > 1 ? `🔥 ${newStreak}-day streak! Keep it up!` : 'Welcome back! Streak started.';
    return { streak: newStreak, lastCheckin: todayISO, canCheckin: false, message: msg };
  }

  store[key] = { streak: 1, lastCheckin: todayISO, ...(txHash ? { txHash } : {}) };
  writeJSON('checkins.json', store);
  return { streak: 1, lastCheckin: todayISO, canCheckin: false, message: '✅ Day 1 — streak started!' };
}
