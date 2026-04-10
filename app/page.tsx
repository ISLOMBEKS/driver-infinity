'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import { useAccount, useConnect, useWriteContract } from 'wagmi';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';
import { parseUnits } from 'viem';
import { initGame, type GameController } from '@/lib/game';

// ── Constants ─────────────────────────────────────────────────────────────────
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

type Screen = 'start' | 'playing' | 'continue' | 'leaderboard' | 'checkin';

interface LeaderboardEntry {
  rank: number;
  fid: number;
  username: string;
  score: number;
  date: string;
}

interface CheckinData {
  streak: number;
  lastCheckin: string | null;
  canCheckin: boolean;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1a1a2e',
  },
  gc: {
    width: '100%', height: '100%', maxWidth: 520,
    position: 'relative',
  },
  canvas: { display: 'block', width: '100%', height: '100%', touchAction: 'none' },
  score: {
    position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
    color: '#fff', fontFamily: '"Courier New", monospace', fontSize: 26,
    fontWeight: 'bold', textShadow: '0 2px 10px rgba(0,0,0,0.9)',
    pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
  },
  speedWrap: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    width: 140, pointerEvents: 'none', zIndex: 10,
  },
  speedLabel: { color: '#fff', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginBottom: 4, opacity: 0.65 },
  speedBg: { width: '100%', height: 7, background: 'rgba(255,255,255,.15)', borderRadius: 4 },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 20,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.78)',
    color: '#fff', fontFamily: '"Courier New", monospace',
    userSelect: 'none',
  },
  titleFrame: {
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
    padding: '22px 48px 18px',
    marginBottom: 28,
    borderRadius: 14,
    background: 'linear-gradient(rgba(10,10,30,0.55),rgba(10,10,30,0.55)) padding-box, linear-gradient(160deg,#0a1a4a,#1a4aaa 35%,#e87040 70%,#f0c060) border-box',
    border: '3px solid transparent',
    boxShadow: '0 0 28px rgba(232,112,64,0.18)',
  },
  titleH1: {
    fontSize: 64, margin: 0, letterSpacing: 6,
    fontFamily: '"Bebas Neue", "Courier New", monospace', lineHeight: 1,
  },
  infinity: {
    fontSize: 22, letterSpacing: 12, opacity: 0.55,
    fontFamily: '"Bebas Neue", "Courier New", monospace', margin: 0,
  },
  tap: { fontSize: 22, animation: 'pulse 1.4s infinite' },
  // Panels
  panel: {
    background: 'rgba(12,12,24,0.96)',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: 18,
    padding: '24px 24px 20px',
    width: 'min(90vw, 360px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
  },
  panelTitle: {
    fontSize: 32, letterSpacing: 2,
    fontFamily: '"Bebas Neue", "Courier New", monospace',
    margin: 0,
  },
  btnPrimary: {
    background: 'linear-gradient(180deg,#0052FF,#0041CC)',
    color: '#fff', border: 'none', borderRadius: 12,
    padding: '13px 18px', width: '100%',
    fontFamily: '"Courier New", monospace', fontSize: 16,
    fontWeight: 'bold', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,82,255,0.4)',
  },
  btnGold: {
    background: 'linear-gradient(180deg,#ffd86b,#f29d38)',
    color: '#10131a', border: 'none', borderRadius: 12,
    padding: '13px 18px', width: '100%',
    fontFamily: '"Courier New", monospace', fontSize: 16,
    fontWeight: 'bold', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(242,157,56,0.4)',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.10)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12, padding: '11px 18px', width: '100%',
    fontFamily: '"Courier New", monospace', fontSize: 15,
    cursor: 'pointer',
  },
  // Top-left HUD buttons
  hudBtn: {
    position: 'absolute', top: 14, left: 14, zIndex: 30,
    display: 'flex', gap: 8,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', backdropFilter: 'blur(4px)',
  },
};

export default function GamePage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gameRef    = useRef<GameController | null>(null);
  const scoreRef   = useRef(0);

  const [screen, setScreen]   = useState<Screen>('start');
  const [score, setScore]     = useState(0);
  const [speedPct, setSpeedPct] = useState(0);
  const [countdown, setCountdown] = useState(15);

  const [userFid, setUserFid]       = useState<number | null>(null);
  const [username, setUsername]     = useState('Player');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [checkin, setCheckin]       = useState<CheckinData | null>(null);
  const [checkinMsg, setCheckinMsg] = useState('');

  const [payStatus, setPayStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  const { address } = useAccount();
  const { connect }  = useConnect();
  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: () => {
        setPayStatus('success');
        gameRef.current?.resume();
        setScreen('playing');
      },
      onError: () => setPayStatus('error'),
    },
  });

  // ── Init Farcaster SDK ──────────────────────────────────────────────────────
  useEffect(() => {
    sdk.actions.ready().catch(console.warn);
    sdk.context.then(ctx => {
      if (ctx?.user) {
        setUserFid(ctx.user.fid);
        setUsername(ctx.user.username || ctx.user.displayName || 'Player');
      }
    }).catch(console.warn);
  }, []);

  // ── Init Three.js game ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    const game = initGame(canvasRef.current, {
      onScoreUpdate: (s) => { scoreRef.current = s; setScore(s); },
      onSpeedUpdate: (pct) => setSpeedPct(pct),
      onGameOver:    (s)   => { setScore(s); setScreen('continue'); resetCountdown(); },
      onStateChange: (st)  => { if (st === 'playing') setScreen('playing'); },
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, []);

  // ── Countdown for continue offer ────────────────────────────────────────────
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function resetCountdown() {
    setCountdown(15);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          setScreen('start');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    postScore(0); // clear pending
    gameRef.current?.start();
    setScreen('playing');
  }, []);

  const handleContinuePay = useCallback(async () => {
    if (!address) {
      connect({ connector: farcasterFrame() });
      return;
    }
    const recipient = process.env.NEXT_PUBLIC_GAME_WALLET as `0x${string}`;
    if (!recipient || recipient === '0x0000000000000000000000000000000000000000') {
      alert('Game wallet not configured. Set NEXT_PUBLIC_GAME_WALLET in .env.local');
      return;
    }
    setPayStatus('pending');
    if (countdownRef.current) clearInterval(countdownRef.current);
    writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [recipient, parseUnits('0.1', 6)],
    });
  }, [address, connect, writeContract]);

  const handleContinueNo = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    postScore(scoreRef.current);
    setScreen('start');
  }, []);

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboard(data.entries ?? []);
    } catch {}
  }, []);

  async function postScore(s: number) {
    if (!userFid || s === 0) return;
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: userFid, username, score: s }),
      });
    } catch {}
  }

  // Save score when game ends
  useEffect(() => {
    if (screen === 'continue' && userFid) postScore(score);
  }, [screen]);

  // ── Daily check-in ────────────────────────────────────────────────────────────
  const fetchCheckin = useCallback(async () => {
    if (!userFid) return;
    try {
      const res = await fetch(`/api/checkin?fid=${userFid}`);
      const data = await res.json();
      setCheckin(data);
    } catch {}
  }, [userFid]);

  const handleCheckin = useCallback(async () => {
    if (!userFid) return;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid: userFid, username }),
      });
      const data = await res.json();
      setCheckin(data);
      setCheckinMsg(data.message || '');
    } catch {}
  }, [userFid, username]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const showOverlay = screen !== 'playing';

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
        @keyframes pop { 0%{transform:scale(.85);opacity:0} 100%{transform:scale(1);opacity:1} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html,body { width:100%; height:100%; overflow:hidden; background:#0d1117; }
        button:disabled { opacity:0.55; cursor:wait; }
      `}</style>

      <div style={styles.root}>
        <div style={styles.gc}>
          <canvas ref={canvasRef} style={styles.canvas} />

          {/* HUD — Score */}
          <div style={styles.score}>{score} m</div>

          {/* HUD — Speed bar */}
          <div style={styles.speedWrap}>
            <div style={styles.speedLabel}>SPEED</div>
            <div style={styles.speedBg}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: 'linear-gradient(90deg,#0f0,#ff0,#f00)',
                width: `${speedPct}%`, transition: 'width .1s',
              }} />
            </div>
          </div>

          {/* HUD buttons (always visible) */}
          {screen === 'playing' && (
            <div style={styles.hudBtn}>
              <div style={styles.iconBtn} title="Leaderboard"
                onClick={() => { fetchLeaderboard(); setScreen('leaderboard'); }}>🏆</div>
              <div style={styles.iconBtn} title="Check-in"
                onClick={() => { fetchCheckin(); setScreen('checkin'); }}>📅</div>
            </div>
          )}

          {/* ── Overlays ── */}
          {showOverlay && (
            <div style={styles.overlay}>

              {/* START */}
              {screen === 'start' && (
                <>
                  <div style={styles.titleFrame}>
                    <h1 style={styles.titleH1}>DRIVER</h1>
                    <p style={styles.infinity}>INFINITY</p>
                  </div>

                  {/* Quick actions */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    <button style={{ ...styles.iconBtn, position: 'static' }} title="Leaderboard"
                      onClick={() => { fetchLeaderboard(); setScreen('leaderboard'); }}>🏆</button>
                    <button style={{ ...styles.iconBtn, position: 'static' }} title="Check-in"
                      onClick={() => { fetchCheckin(); setScreen('checkin'); }}>📅</button>
                  </div>

                  <p style={styles.tap} onClick={handleStart}>► Tap to Start ◄</p>
                  <p style={{ fontSize: 13, opacity: 0.4, marginTop: 12 }}>
                    {username !== 'Player' ? `Hey, ${username}!` : 'Connect Farcaster to save scores'}
                  </p>
                </>
              )}

              {/* CONTINUE */}
              {screen === 'continue' && (
                <div style={{ ...styles.panel, animation: 'pop .25s ease-out', border: '2px solid rgba(0,82,255,0.5)' }}>
                  <p style={{ ...styles.panelTitle, color: '#ffd86b' }}>CONTINUE?</p>
                  <p style={{ fontSize: 28, fontWeight: 'bold' }}>{score} m</p>
                  <p style={{ fontSize: 14, opacity: 0.7, textAlign: 'center' }}>
                    Pay $0.10 USDC on Base to keep your run
                  </p>

                  {payStatus === 'error' && (
                    <p style={{ color: '#ff6b6b', fontSize: 13 }}>Transaction failed. Try again.</p>
                  )}

                  <button
                    style={styles.btnGold}
                    disabled={payStatus === 'pending'}
                    onClick={handleContinuePay}
                  >
                    {payStatus === 'pending' ? 'Waiting for wallet…' : '💎 Continue — $0.10 USDC'}
                  </button>

                  <div style={{ fontSize: 26, fontWeight: 'bold', color: '#fff' }}>
                    {countdown}
                  </div>

                  <button style={styles.btnGhost} onClick={handleContinueNo}>
                    No, end run
                  </button>
                </div>
              )}

              {/* LEADERBOARD */}
              {screen === 'leaderboard' && (
                <div style={{ ...styles.panel, maxHeight: '85vh', overflowY: 'auto' }}>
                  <p style={{ ...styles.panelTitle, color: '#ffd86b' }}>🏆 LEADERBOARD</p>

                  {leaderboard.length === 0 ? (
                    <p style={{ opacity: 0.5, fontSize: 14 }}>No scores yet. Be first!</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px' }}>#</th>
                          <th style={{ padding: '4px 6px' }}>Player</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((e) => (
                          <tr key={e.fid}
                            style={{
                              background: e.fid === userFid ? 'rgba(0,82,255,0.2)' : 'transparent',
                              borderRadius: 8,
                            }}>
                            <td style={{ padding: '7px 6px', color: e.rank <= 3 ? '#ffd86b' : '#fff' }}>
                              {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}
                            </td>
                            <td style={{ padding: '7px 6px', color: e.fid === userFid ? '#4af' : '#fff' }}>
                              {e.username}
                            </td>
                            <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 'bold' }}>
                              {e.score.toLocaleString()} m
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <button style={styles.btnPrimary} onClick={() => setScreen('start')}>← Back</button>
                </div>
              )}

              {/* CHECK-IN */}
              {screen === 'checkin' && (
                <div style={{ ...styles.panel, animation: 'pop .25s ease-out' }}>
                  <p style={{ ...styles.panelTitle }}>📅 DAILY CHECK-IN</p>

                  {!userFid ? (
                    <p style={{ opacity: 0.6, fontSize: 14, textAlign: 'center' }}>
                      Connect via Farcaster to use daily check-ins
                    </p>
                  ) : (
                    <>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 14, opacity: 0.6 }}>Current streak</p>
                        <p style={{ fontSize: 52, fontWeight: 'bold', lineHeight: 1.1 }}>
                          {checkin?.streak ?? 0}
                          <span style={{ fontSize: 18 }}> days</span>
                        </p>
                      </div>

                      {checkinMsg && (
                        <p style={{ color: '#4aff91', fontSize: 15, textAlign: 'center' }}>{checkinMsg}</p>
                      )}

                      {checkin?.canCheckin ? (
                        <button style={styles.btnGold} onClick={handleCheckin}>
                          ✅ Check in today!
                        </button>
                      ) : (
                        <p style={{ opacity: 0.5, fontSize: 13, textAlign: 'center' }}>
                          Already checked in today.<br />Come back tomorrow!
                        </p>
                      )}

                      {checkin?.lastCheckin && (
                        <p style={{ opacity: 0.35, fontSize: 11 }}>
                          Last: {new Date(checkin.lastCheckin).toLocaleDateString()}
                        </p>
                      )}
                    </>
                  )}

                  <button style={styles.btnGhost} onClick={() => setScreen('start')}>← Back</button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </>
  );
}
