'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import { useAccount, useConnect, useWriteContract } from 'wagmi';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';
import { parseUnits } from 'viem';
import { initGame, type GameController } from '@/lib/game';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const USDC_ABI = [
  {
    name: 'transfer', type: 'function',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }], stateMutability: 'nonpayable',
  },
] as const;

type Screen = 'start' | 'playing' | 'continue' | 'leaderboard' | 'checkin';

interface LeaderboardEntry { rank: number; fid: number; username: string; score: number; }
interface CheckinData { streak: number; lastCheckin: string | null; canCheckin: boolean; }

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef   = useRef<GameController | null>(null);
  const scoreRef  = useRef(0);

  const [screen, setScreen]     = useState<Screen>('start');
  const [score, setScore]       = useState(0);
  const [speedPct, setSpeedPct] = useState(0);
  const [countdown, setCountdown] = useState(15);
  const [userFid, setUserFid]   = useState<number | null>(null);
  const [username, setUsername] = useState('Player');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [checkin, setCheckin]   = useState<CheckinData | null>(null);
  const [checkinMsg, setCheckinMsg] = useState('');
  const [payStatus, setPayStatus] = useState<'idle'|'pending'|'success'|'error'>('idle');

  const { address } = useAccount();
  const { connect } = useConnect();
  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: () => { setPayStatus('success'); gameRef.current?.resume(); setScreen('playing'); },
      onError:   () => setPayStatus('error'),
    },
  });

  useEffect(() => {
    sdk.actions.ready().catch(console.warn);
    sdk.context.then(ctx => {
      if (ctx?.user) { setUserFid(ctx.user.fid); setUsername(ctx.user.username || ctx.user.displayName || 'Player'); }
    }).catch(console.warn);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = initGame(canvasRef.current, {
      onScoreUpdate: (s)  => { scoreRef.current = s; setScore(s); },
      onSpeedUpdate: (pct) => setSpeedPct(pct),
      onGameOver:    (s)  => { setScore(s); setScreen('continue'); resetCountdown(); },
      onStateChange: (st) => { if (st === 'playing') setScreen('playing'); },
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, []);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function resetCountdown() {
    setCountdown(15);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          postScore(scoreRef.current);
          gameRef.current?.start(); // таймер истёк → новая игра автоматически
          setScreen('playing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const handleStart = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    gameRef.current?.start(); setScreen('playing');
  }, []);

  const handleContinuePay = useCallback(async () => {
    if (!address) { connect({ connector: farcasterFrame() }); return; }
    const recipient = process.env.NEXT_PUBLIC_GAME_WALLET as `0x${string}`;
    setPayStatus('pending');
    if (countdownRef.current) clearInterval(countdownRef.current);
    writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'transfer', args: [recipient, parseUnits('0.1', 6)] });
  }, [address, connect, writeContract]);

  const handleContinueNo = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    postScore(scoreRef.current);
    // Сразу запускаем новую игру — не идём на стартовый экран
    gameRef.current?.start();
    setScreen('playing');
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try { const r = await fetch('/api/leaderboard'); const d = await r.json(); setLeaderboard(d.entries ?? []); } catch {}
  }, []);

  async function postScore(s: number) {
    if (!userFid || s === 0) return;
    try { await fetch('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fid: userFid, username, score: s }) }); } catch {}
  }

  useEffect(() => { if (screen === 'continue' && userFid) postScore(score); }, [screen]);

  const fetchCheckin = useCallback(async () => {
    if (!userFid) return;
    try { const r = await fetch(`/api/checkin?fid=${userFid}`); setCheckin(await r.json()); } catch {}
  }, [userFid]);

  const handleCheckin = useCallback(async () => {
    if (!userFid) return;
    try {
      const r = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fid: userFid, username }) });
      const d = await r.json(); setCheckin(d); setCheckinMsg(d.message || '');
    } catch {}
  }, [userFid, username]);

  const showOverlay = screen !== 'playing';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes pop   { from{transform:scale(.9) translateY(10px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        * { box-sizing:border-box; margin:0; padding:0; }
        html,body { width:100%; height:100%; overflow:hidden; background:#0d1117; }
        button { font-family:'Inter',sans-serif; }
        button:disabled { opacity:.5; cursor:wait; }
        button:active { transform:scale(.97); }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:rgba(255,255,255,.05); }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.2); border-radius:2px; }
      `}</style>

      <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#1a1a2e' }}>
        <div style={{ width:'100%', height:'100%', maxWidth:520, position:'relative' }}>
          <canvas ref={canvasRef} style={{ display:'block', width:'100%', height:'100%', touchAction:'none' }} />

          {/* ── TOP-LEFT STATS FRAME ── */}
          {screen === 'playing' && (
            <div style={{
              position:'absolute', top:14, left:14, zIndex:30,
              background:'rgba(8,8,20,0.72)',
              border:'1.5px solid rgba(0,82,255,0.4)',
              borderRadius:14, padding:'10px 14px',
              backdropFilter:'blur(12px)',
              display:'flex', flexDirection:'column', gap:6,
              minWidth:130,
              boxShadow:'0 4px 24px rgba(0,82,255,0.15)',
            }}>
              {/* Score */}
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:16 }}>🛣️</span>
                <div>
                  <div style={{ color:'rgba(255,255,255,0.45)', fontSize:9, fontFamily:'Inter,sans-serif', letterSpacing:1, textTransform:'uppercase' }}>Distance</div>
                  <div style={{ color:'#fff', fontSize:17, fontWeight:700, fontFamily:'Inter,sans-serif', lineHeight:1.1 }}>{score.toLocaleString()} <span style={{ fontSize:11, opacity:.6 }}>m</span></div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'1px 0' }} />

              {/* Speed */}
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:15 }}>⚡</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:'rgba(255,255,255,0.45)', fontSize:9, fontFamily:'Inter,sans-serif', letterSpacing:1, textTransform:'uppercase', marginBottom:3 }}>Speed</div>
                  <div style={{ height:5, background:'rgba(255,255,255,0.1)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, background:'linear-gradient(90deg,#00c853,#ffd600,#ff3d00)', width:`${speedPct}%`, transition:'width .12s' }} />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'1px 0' }} />

              {/* Streak */}
              {checkin && (
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ fontSize:15 }}>🔥</span>
                  <div>
                    <div style={{ color:'rgba(255,255,255,0.45)', fontSize:9, fontFamily:'Inter,sans-serif', letterSpacing:1, textTransform:'uppercase' }}>Streak</div>
                    <div style={{ color:'#ffd86b', fontSize:15, fontWeight:700, fontFamily:'Inter,sans-serif', lineHeight:1.1 }}>{checkin.streak} <span style={{ fontSize:10, opacity:.7, color:'#fff' }}>days</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RIGHT SIDE BUTTONS ── */}
          {screen === 'playing' && (
            <div style={{ position:'absolute', top:14, right:14, zIndex:30, display:'flex', flexDirection:'column', gap:8 }}>
              <button
                onClick={() => { fetchLeaderboard(); setScreen('leaderboard'); }}
                style={{
                  background:'rgba(8,8,20,0.72)', border:'1.5px solid rgba(255,215,0,0.35)',
                  borderRadius:12, padding:'8px 12px', color:'#fff', cursor:'pointer',
                  backdropFilter:'blur(12px)', display:'flex', alignItems:'center', gap:7,
                  boxShadow:'0 4px 16px rgba(255,215,0,0.1)',
                  transition:'all .15s',
                }}>
                <span style={{ fontSize:18 }}>🏆</span>
                <span style={{ fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', letterSpacing:.3 }}>Board</span>
              </button>

              <button
                onClick={() => { fetchCheckin(); setScreen('checkin'); }}
                style={{
                  background:'rgba(8,8,20,0.72)', border:'1.5px solid rgba(0,200,100,0.35)',
                  borderRadius:12, padding:'8px 12px', color:'#fff', cursor:'pointer',
                  backdropFilter:'blur(12px)', display:'flex', alignItems:'center', gap:7,
                  boxShadow:'0 4px 16px rgba(0,200,100,0.08)',
                  transition:'all .15s',
                }}>
                <span style={{ fontSize:18 }}>📅</span>
                <span style={{ fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', letterSpacing:.3 }}>Check-in</span>
              </button>
            </div>
          )}

          {/* ── OVERLAYS ── */}
          {showOverlay && (
            <div style={{
              position:'absolute', inset:0, zIndex:20,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,0.80)', color:'#fff',
              userSelect:'none', animation:'fadeIn .2s ease',
            }}>

              {/* START */}
              {screen === 'start' && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>
                  {/* Title */}
                  <div style={{
                    display:'inline-flex', flexDirection:'column', alignItems:'center',
                    padding:'24px 52px 20px', marginBottom:32, borderRadius:16,
                    background:'linear-gradient(rgba(8,8,24,0.6),rgba(8,8,24,0.6)) padding-box, linear-gradient(160deg,#0a1a4a,#1a4aaa 35%,#e87040 70%,#f0c060) border-box',
                    border:'2.5px solid transparent',
                    boxShadow:'0 0 40px rgba(232,112,64,0.15), 0 20px 60px rgba(0,0,0,0.4)',
                  }}>
                    <h1 style={{ fontSize:72, margin:0, letterSpacing:8, fontFamily:'"Bebas Neue",sans-serif', lineHeight:1, background:'linear-gradient(180deg,#fff 60%,rgba(255,255,255,.6))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>DRIVER</h1>
                    <p style={{ fontSize:20, letterSpacing:14, opacity:.5, fontFamily:'"Bebas Neue",sans-serif', margin:0 }}>INFINITY</p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:10, marginBottom:28 }}>
                    <button
                      onClick={() => { fetchLeaderboard(); setScreen('leaderboard'); }}
                      style={{
                        background:'rgba(255,215,0,0.12)', border:'1.5px solid rgba(255,215,0,0.3)',
                        borderRadius:12, padding:'10px 18px', color:'#fff', cursor:'pointer',
                        display:'flex', alignItems:'center', gap:8, fontSize:14, fontWeight:600,
                      }}>
                      🏆 Leaderboard
                    </button>
                    <button
                      onClick={() => { fetchCheckin(); setScreen('checkin'); }}
                      style={{
                        background:'rgba(0,200,100,0.12)', border:'1.5px solid rgba(0,200,100,0.3)',
                        borderRadius:12, padding:'10px 18px', color:'#fff', cursor:'pointer',
                        display:'flex', alignItems:'center', gap:8, fontSize:14, fontWeight:600,
                      }}>
                      📅 Check-in
                    </button>
                  </div>

                  <p style={{ fontSize:22, animation:'pulse 1.4s infinite', fontFamily:'"Bebas Neue",sans-serif', letterSpacing:3, cursor:'pointer' }} onClick={handleStart}>
                    ► TAP TO START ◄
                  </p>
                  <p style={{ fontSize:12, opacity:.35, marginTop:14, fontFamily:'Inter,sans-serif' }}>
                    {username !== 'Player' ? `👋 ${username}` : 'Open in Farcaster to save scores'}
                  </p>
                </div>
              )}

              {/* CONTINUE */}
              {screen === 'continue' && (
                <div style={{
                  background:'linear-gradient(160deg,rgba(12,12,28,0.97),rgba(8,8,20,0.97))',
                  border:'2px solid rgba(0,82,255,0.4)',
                  borderRadius:22, padding:'28px 24px 22px',
                  width:'min(92vw,360px)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:14,
                  animation:'pop .25s cubic-bezier(.34,1.56,.64,1)',
                  boxShadow:'0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,82,255,0.1)',
                }}>
                  <div style={{ fontSize:11, letterSpacing:3, opacity:.5, fontFamily:'Inter,sans-serif', textTransform:'uppercase' }}>Game Over</div>
                  <div style={{ fontSize:40, fontFamily:'"Bebas Neue",sans-serif', letterSpacing:2, color:'#ffd86b' }}>CONTINUE?</div>

                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:42, fontWeight:800, fontFamily:'Inter,sans-serif' }}>{score.toLocaleString()}</div>
                    <div style={{ fontSize:13, opacity:.5, fontFamily:'Inter,sans-serif' }}>metres</div>
                  </div>

                  <div style={{ height:1, width:'100%', background:'rgba(255,255,255,0.08)' }} />
                  <div style={{ fontSize:13, opacity:.65, textAlign:'center', fontFamily:'Inter,sans-serif', lineHeight:1.5 }}>
                    Pay <strong>$0.10 USDC</strong> on Base<br/>to continue your run
                  </div>

                  {payStatus === 'error' && (
                    <div style={{ background:'rgba(255,60,60,0.15)', border:'1px solid rgba(255,60,60,0.3)', borderRadius:8, padding:'8px 14px', fontSize:13, color:'#ff8080', fontFamily:'Inter,sans-serif' }}>
                      Transaction failed. Try again.
                    </div>
                  )}

                  <button
                    disabled={payStatus === 'pending'}
                    onClick={handleContinuePay}
                    style={{
                      background:'linear-gradient(180deg,#ffd86b,#f29d38)',
                      color:'#0d1117', border:'none', borderRadius:14,
                      padding:'15px 18px', width:'100%', fontSize:16, fontWeight:700,
                      cursor:'pointer', boxShadow:'0 8px 24px rgba(242,157,56,0.35)',
                      fontFamily:'Inter,sans-serif',
                    }}>
                    {payStatus === 'pending' ? '⏳ Waiting for wallet…' : '💎 Continue — $0.10 USDC'}
                  </button>

                  <div style={{
                    width:48, height:48, borderRadius:'50%',
                    border:'3px solid rgba(255,255,255,0.15)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:20, fontWeight:700, fontFamily:'Inter,sans-serif',
                    color: countdown <= 5 ? '#ff6b6b' : '#fff',
                  }}>
                    {countdown}
                  </div>

                  <button onClick={handleContinueNo} style={{
                    background:'transparent', color:'rgba(255,255,255,0.4)',
                    border:'none', padding:'6px 18px', fontSize:14, cursor:'pointer',
                    fontFamily:'Inter,sans-serif', textDecoration:'underline',
                  }}>
                    No thanks, end run
                  </button>
                </div>
              )}

              {/* LEADERBOARD */}
              {screen === 'leaderboard' && (
                <div style={{
                  background:'linear-gradient(160deg,rgba(12,12,28,0.97),rgba(8,8,20,0.97))',
                  border:'2px solid rgba(255,215,0,0.2)',
                  borderRadius:22, padding:'24px 20px 20px',
                  width:'min(92vw,380px)', maxHeight:'85vh',
                  display:'flex', flexDirection:'column', gap:16,
                  animation:'pop .25s cubic-bezier(.34,1.56,.64,1)',
                  boxShadow:'0 20px 60px rgba(0,0,0,0.6)',
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:11, letterSpacing:3, opacity:.4, fontFamily:'Inter,sans-serif', textTransform:'uppercase' }}>Global</div>
                      <div style={{ fontSize:32, fontFamily:'"Bebas Neue",sans-serif', letterSpacing:2, color:'#ffd86b' }}>🏆 Leaderboard</div>
                    </div>
                    <button onClick={() => setScreen('start')} style={{
                      background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)',
                      borderRadius:10, width:36, height:36, color:'#fff', fontSize:18, cursor:'pointer',
                    }}>✕</button>
                  </div>

                  <div style={{ overflowY:'auto', flex:1 }}>
                    {leaderboard.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'32px 0', opacity:.4, fontFamily:'Inter,sans-serif', fontSize:14 }}>
                        No scores yet.<br/>Be the first! 🚀
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {leaderboard.map((e) => (
                          <div key={e.fid} style={{
                            display:'flex', alignItems:'center', gap:10,
                            background: e.fid === userFid ? 'rgba(0,82,255,0.15)' : 'rgba(255,255,255,0.04)',
                            border: e.fid === userFid ? '1px solid rgba(0,82,255,0.3)' : '1px solid transparent',
                            borderRadius:12, padding:'10px 14px',
                          }}>
                            <div style={{ width:32, textAlign:'center', fontSize:18, flexShrink:0 }}>
                              {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : <span style={{ fontSize:13, opacity:.5, fontFamily:'Inter,sans-serif' }}>{e.rank}</span>}
                            </div>
                            <div style={{ flex:1, overflow:'hidden' }}>
                              <div style={{ fontSize:14, fontWeight:600, fontFamily:'Inter,sans-serif', color: e.fid === userFid ? '#6ab4ff' : '#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {e.username}
                                {e.fid === userFid && <span style={{ fontSize:10, marginLeft:6, opacity:.6 }}>you</span>}
                              </div>
                            </div>
                            <div style={{ fontSize:15, fontWeight:700, fontFamily:'Inter,sans-serif', color:'#ffd86b', flexShrink:0 }}>
                              {e.score.toLocaleString()} <span style={{ fontSize:11, opacity:.6, color:'#fff' }}>m</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={handleStart} style={{
                    background:'linear-gradient(180deg,#0052FF,#0041CC)',
                    color:'#fff', border:'none', borderRadius:14,
                    padding:'14px 18px', fontSize:15, fontWeight:700,
                    cursor:'pointer', boxShadow:'0 6px 20px rgba(0,82,255,0.3)',
                    fontFamily:'Inter,sans-serif',
                  }}>
                    🚗 Play Now
                  </button>
                </div>
              )}

              {/* CHECK-IN */}
              {screen === 'checkin' && (
                <div style={{
                  background:'linear-gradient(160deg,rgba(12,12,28,0.97),rgba(8,8,20,0.97))',
                  border:'2px solid rgba(0,200,100,0.25)',
                  borderRadius:22, padding:'28px 24px 22px',
                  width:'min(92vw,360px)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:16,
                  animation:'pop .25s cubic-bezier(.34,1.56,.64,1)',
                  boxShadow:'0 20px 60px rgba(0,0,0,0.6)',
                }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
                    <div>
                      <div style={{ fontSize:11, letterSpacing:3, opacity:.4, fontFamily:'Inter,sans-serif', textTransform:'uppercase' }}>Daily</div>
                      <div style={{ fontSize:32, fontFamily:'"Bebas Neue",sans-serif', letterSpacing:2 }}>📅 Check-in</div>
                    </div>
                    <button onClick={() => setScreen('start')} style={{
                      background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)',
                      borderRadius:10, width:36, height:36, color:'#fff', fontSize:18, cursor:'pointer',
                    }}>✕</button>
                  </div>

                  {!userFid ? (
                    <div style={{ textAlign:'center', padding:'16px 0', opacity:.5, fontFamily:'Inter,sans-serif', fontSize:14, lineHeight:1.6 }}>
                      Open in Farcaster<br/>to use daily check-ins
                    </div>
                  ) : (
                    <>
                      {/* Streak display */}
                      <div style={{
                        background:'rgba(255,140,0,0.1)', border:'1.5px solid rgba(255,140,0,0.25)',
                        borderRadius:16, padding:'20px 32px', textAlign:'center', width:'100%',
                      }}>
                        <div style={{ fontSize:56, lineHeight:1 }}>🔥</div>
                        <div style={{ fontSize:48, fontWeight:800, fontFamily:'Inter,sans-serif', lineHeight:1.1 }}>{checkin?.streak ?? 0}</div>
                        <div style={{ fontSize:13, opacity:.5, fontFamily:'Inter,sans-serif', marginTop:2 }}>day streak</div>
                      </div>

                      {checkinMsg && (
                        <div style={{
                          background:'rgba(0,200,100,0.12)', border:'1px solid rgba(0,200,100,0.25)',
                          borderRadius:10, padding:'10px 16px', fontSize:14,
                          color:'#4aff91', fontFamily:'Inter,sans-serif', textAlign:'center', width:'100%',
                        }}>
                          {checkinMsg}
                        </div>
                      )}

                      {checkin?.canCheckin ? (
                        <button onClick={handleCheckin} style={{
                          background:'linear-gradient(180deg,#00c853,#009624)',
                          color:'#fff', border:'none', borderRadius:14,
                          padding:'15px 18px', width:'100%', fontSize:16, fontWeight:700,
                          cursor:'pointer', boxShadow:'0 8px 24px rgba(0,200,83,0.3)',
                          fontFamily:'Inter,sans-serif',
                        }}>
                          ✅ Check in today!
                        </button>
                      ) : (
                        <div style={{
                          background:'rgba(255,255,255,0.05)', borderRadius:12,
                          padding:'14px', textAlign:'center', width:'100%',
                          fontSize:13, opacity:.5, fontFamily:'Inter,sans-serif', lineHeight:1.6,
                        }}>
                          Already checked in today ✓<br/>
                          <span style={{ fontSize:11 }}>Come back tomorrow!</span>
                        </div>
                      )}

                      {checkin?.lastCheckin && (
                        <div style={{ fontSize:11, opacity:.25, fontFamily:'Inter,sans-serif' }}>
                          Last check-in: {new Date(checkin.lastCheckin).toLocaleDateString()}
                        </div>
                      )}
                    </>
                  )}

                  <button onClick={handleStart} style={{
                    background:'linear-gradient(180deg,#0052FF,#0041CC)',
                    color:'#fff', border:'none', borderRadius:14,
                    padding:'14px 18px', width:'100%', fontSize:15, fontWeight:700,
                    cursor:'pointer', fontFamily:'Inter,sans-serif',
                  }}>
                    🚗 Play Now
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </>
  );
}
