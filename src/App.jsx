import { useState, useEffect, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────
// After deploying AlphaOrFudContract.py, paste your contract address here:
const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS_HERE";
const GENLAYER_RPC = "https://studio.genlayer.com/api";
const MY_WALLET = "0xeb350f1692b16c8b7b02c66dedb76d018f6a9662";

// ─── GENLAYER RPC HELPERS ─────────────────────────────────
async function callView(method, params = []) {
  try {
    const res = await fetch(GENLAYER_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{
          to: CONTRACT_ADDRESS,
          data: JSON.stringify({ method, params }),
        }, "latest"],
      }),
    });
    const data = await res.json();
    if (data.result) return JSON.parse(data.result);
    return null;
  } catch {
    return null;
  }
}

async function callWrite(method, params = []) {
  try {
    const res = await fetch(GENLAYER_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_sendTransaction",
        params: [{
          from: MY_WALLET,
          to: CONTRACT_ADDRESS,
          data: JSON.stringify({ method, params }),
        }],
      }),
    });
    const data = await res.json();
    return data.result;
  } catch {
    return null;
  }
}

// Poll until tx accepted
async function waitForTx(txHash, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await fetch(GENLAYER_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });
      const data = await res.json();
      if (data.result?.status === "0x1") return true;
    } catch {}
  }
  return false;
}

// ─── STATIC DATA (fallback / demo mode) ──────────────────
const DEMO_CLAIMS = [
  { id: 1, ticker: "BTC", text: "Bitcoin will hit $200K by end of 2025 due to institutional ETF demand and post-halving supply shock." },
  { id: 2, ticker: "ETH", text: "Ethereum gas fees will drop 90% after the next upgrade, making it the dominant DeFi chain again." },
  { id: 3, ticker: "MEME", text: "This new meme coin with 0 utility will 100x because a celebrity tweeted about it." },
  { id: 4, ticker: "SOL", text: "Solana TVL surpassed Ethereum for the first time, signaling a major ecosystem shift." },
  { id: 5, ticker: "GEN", text: "GenLayer Intelligent Contracts will replace traditional oracles within 2 years." },
];

const VERDICTS = [
  { key: "strong", label: "🔥 Strong Alpha", color: "#00ff88", bg: "#003320" },
  { key: "neutral", label: "⚖️ Neutral",      color: "#ffcc00", bg: "#332800" },
  { key: "weak",   label: "⚠️ Weak Signal",   color: "#ff8800", bg: "#331a00" },
  { key: "fud",    label: "🚨 FUD / Noise",   color: "#ff3355", bg: "#330011" },
];

const DEMO_PLAYERS = [
  { id: MY_WALLET,              name: "0xEb...9662", avatar: "🦊" },
  { id: "0xAA...dF37",          name: "0xAA...dF37", avatar: "🐻" },
  { id: "0x12...7F21",          name: "0x12...7F21", avatar: "🦁" },
  { id: "0x99...3B09",          name: "0x99...3B09", avatar: "🐺" },
];

const ROUND_TIME = 15;
const TOTAL_ROUNDS = 5;
const IS_DEMO = CONTRACT_ADDRESS === "YOUR_CONTRACT_ADDRESS_HERE";

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function Tag({ children, color = "#333" }) {
  return (
    <span style={{ fontFamily: "monospace", fontSize: 10, color, border: `1px solid ${color}33`, padding: "2px 8px", borderRadius: 3 }}>
      {children}
    </span>
  );
}

function ScoreBar({ score, max = 500 }) {
  return (
    <div style={{ background: "#111", borderRadius: 4, height: 5, width: "100%", overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${Math.min((score / max) * 100, 100)}%`, background: "linear-gradient(90deg,#00ff88,#00ccff)", borderRadius: 4, transition: "width 0.8s ease" }} />
    </div>
  );
}

export default function App() {
  const [screen, setScreen]         = useState("lobby");
  const [claims, setClaims]         = useState([]);
  const [round, setRound]           = useState(0);
  const [timer, setTimer]           = useState(ROUND_TIME);
  const [myVote, setMyVote]         = useState(null);
  const [aiResult, setAiResult]     = useState(null);
  const [scores, setScores]         = useState({});
  const [playerVotes, setPlayerVotes] = useState({});
  const [isLoading, setIsLoading]   = useState(false);
  const [txStatus, setTxStatus]     = useState("");
  const [roomCode]                  = useState("GL-" + Math.floor(Math.random() * 9000 + 1000));
  const timerRef = useRef(null);

  const currentClaim = claims[round];

  // Load claims from contract or use demo
  useEffect(() => {
    async function loadClaims() {
      if (!IS_DEMO) {
        const data = await callView("get_weekly_claims");
        if (data) { setClaims(shuffle(data).slice(0, TOTAL_ROUNDS)); return; }
      }
      setClaims(shuffle(DEMO_CLAIMS).slice(0, TOTAL_ROUNDS));
    }
    loadClaims();
  }, []);

  // Timer
  useEffect(() => {
    if (screen === "game" && !myVote) {
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current); handleVote(null); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, round, myVote]);

  async function startGame() {
    setRound(0);
    setScores(Object.fromEntries(DEMO_PLAYERS.map(p => [p.id, 0])));
    setMyVote(null);
    setAiResult(null);
    setPlayerVotes({});
    setTimer(ROUND_TIME);
    setScreen("game");

    if (!IS_DEMO) {
      setTxStatus("Creating room on-chain...");
      const tx = await callWrite("create_room", [roomCode, MY_WALLET]);
      if (tx) { await waitForTx(tx); }
      setTxStatus("");
    }
  }

  async function handleVote(verdict) {
    if (myVote !== null) return;
    clearInterval(timerRef.current);
    setMyVote(verdict || "timeout");

    // Simulate other players
    const others = {};
    DEMO_PLAYERS.slice(1).forEach(p => {
      others[p.id] = VERDICTS[Math.floor(Math.random() * 4)].key;
    });
    const allVotes = { [MY_WALLET]: verdict, ...others };
    setPlayerVotes(allVotes);

    setScreen("reveal");
    setIsLoading(true);
    setTxStatus("");

    if (!IS_DEMO && verdict) {
      setTxStatus("Submitting vote on-chain...");
      const tx = await callWrite("submit_vote", [roomCode, round, currentClaim.id, MY_WALLET, verdict]);
      if (tx) await waitForTx(tx);

      setTxStatus("Summoning AI judge via Intelligent Contract...");
      const players = DEMO_PLAYERS.map(p => p.id).join(",");
      const tx2 = await callWrite("judge_round", [roomCode, round, currentClaim.id, players]);
      if (tx2) await waitForTx(tx2, 60000);

      const result = await callView("get_last_result");
      if (result) {
        setAiResult(result);
        const newScores = { ...scores };
        Object.entries(result.points_awarded || {}).forEach(([p, pts]) => {
          newScores[p] = (newScores[p] || 0) + pts;
        });
        setScores(newScores);
        setIsLoading(false);
        setTxStatus("");
        return;
      }
    }

    // Demo mode: simulate AI
    await new Promise(r => setTimeout(r, 2500));
    const aiVerdicts = { 1:"strong", 2:"neutral", 3:"fud", 4:"neutral", 5:"strong" };
    const correct = aiVerdicts[currentClaim?.id] || "neutral";
    const reasons = {
      strong: "Strong on-chain fundamentals and institutional data back this thesis.",
      neutral: "Mixed signals — some validity but insufficient conviction for a strong call.",
      weak:   "Speculative claim, lacks verifiable on-chain evidence.",
      fud:    "No credible basis found. Classic misleading narrative pattern detected.",
    };
    const simulatedResult = {
      verdict: correct,
      ai_score: { strong:85, neutral:62, weak:38, fud:15 }[correct],
      confidence: { strong:"high", neutral:"medium", weak:"low", fud:"low" }[correct],
      reason: reasons[correct],
      ticker: currentClaim?.ticker,
      points_awarded: Object.fromEntries(
        DEMO_PLAYERS.map(p => {
          const pv = allVotes[p.id];
          const pts = pv === correct ? 100 : (
            (pv === "strong" && correct === "neutral") || (pv === "neutral" && correct === "strong") ||
            (pv === "weak" && correct === "neutral") || (pv === "neutral" && correct === "weak")
          ) ? 40 : 0;
          return [p.id, pts];
        })
      ),
    };
    setAiResult(simulatedResult);
    const newScores = { ...scores };
    Object.entries(simulatedResult.points_awarded).forEach(([p, pts]) => {
      newScores[p] = (newScores[p] || 0) + pts;
    });
    setScores(newScores);
    setIsLoading(false);
  }

  function nextRound() {
    if (round + 1 >= TOTAL_ROUNDS) { setScreen("leaderboard"); return; }
    setRound(r => r + 1);
    setMyVote(null);
    setAiResult(null);
    setPlayerVotes({});
    setTimer(ROUND_TIME);
    setScreen("game");
  }

  const timerColor = timer > 8 ? "#00ff88" : timer > 4 ? "#ffcc00" : "#ff3355";
  const timerPct = (timer / ROUND_TIME) * 100;
  const verdictObj = VERDICTS.find(v => v.key === aiResult?.verdict);
  const myVoteObj = VERDICTS.find(v => v.key === myVote);
  const isCorrect = myVote === aiResult?.verdict;
  const sortedPlayers = [...DEMO_PLAYERS].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

  // ─── LOBBY ───────────────────────────────────────────────
  if (screen === "lobby") return (
    <div style={S.root}>
      <div style={S.scanlines} />
      <div style={S.center}>
        <div style={{ marginBottom: 8 }}>
          {IS_DEMO
            ? <Tag color="#ff8800">DEMO MODE</Tag>
            : <Tag color="#00ff88">LIVE · BRADBURY TESTNET</Tag>
          }
        </div>
        <div style={S.logo}>
          <span style={{ color: "#00ff88" }}>ALPHA</span>
          <span style={{ color: "#222" }}> or </span>
          <span style={{ color: "#ff3355" }}>FUD</span>
          <div style={{ fontSize: 11, color: "#444", fontFamily: "monospace", letterSpacing: 4, marginTop: 6 }}>
            POWERED BY GENLAYER AI
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 11, color: "#444", fontFamily: "monospace", marginBottom: 6 }}>ROOM CODE</div>
          <div style={{ fontSize: 26, color: "#00ccff", fontFamily: "monospace", letterSpacing: 6, marginBottom: 20 }}>{roomCode}</div>

          {DEMO_PLAYERS.map((p, i) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #111" }}>
              <span style={{ fontSize: 18 }}>{p.avatar}</span>
              <span style={{ fontFamily:"monospace", color: i===0?"#00ff88":"#444", fontSize:12 }}>{p.name}</span>
              <span style={{ marginLeft:"auto", fontSize:10, fontFamily:"monospace", color: i===0?"#00ff88":"#333" }}>
                {i===0?"YOU ●":"READY"}
              </span>
            </div>
          ))}

          <div style={S.infoBox}>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#444", lineHeight:1.8 }}>
              🎮 {TOTAL_ROUNDS} rounds · ⏱ {ROUND_TIME}s per round<br/>
              🤖 AI judges via Intelligent Contract<br/>
              ⛓️ Optimistic Democracy Consensus
            </div>
          </div>

          {IS_DEMO && (
            <div style={{ fontFamily:"monospace", fontSize:10, color:"#555", textAlign:"center", marginTop:12, lineHeight:1.6 }}>
              To go LIVE: deploy AlphaOrFudContract.py<br/>and set CONTRACT_ADDRESS in code
            </div>
          )}

          <button onClick={startGame} style={{ ...S.btnGreen, marginTop: 16 }}>
            START GAME →
          </button>
        </div>
      </div>
    </div>
  );

  // ─── GAME ─────────────────────────────────────────────────
  if (screen === "game" && currentClaim) return (
    <div style={S.root}>
      <div style={S.scanlines} />

      <div style={S.topBar}>
        <span style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>
          ROUND <span style={{ color:"#00ccff" }}>{round+1}</span>/{TOTAL_ROUNDS}
        </span>
        <span style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>{roomCode}</span>
        <span style={{ fontFamily:"monospace", fontSize:11, color:"#00ff88" }}>
          {scores[MY_WALLET]||0} XP
        </span>
      </div>

      <div style={{ height:3, background:"#0a0a0a" }}>
        <div style={{ height:"100%", width:`${timerPct}%`, background:timerColor, transition:"width 1s linear, background 0.3s" }} />
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        <Tag color="#00ccff">${currentClaim.ticker}</Tag>

        <div style={S.claimBox}>
          <div style={{ fontSize:11, color:"#444", fontFamily:"monospace", marginBottom:10 }}>⚡ CRYPTO CLAIM</div>
          <div style={{ fontSize:15, color:"#ddd", lineHeight:1.7, fontFamily:"'Georgia',serif" }}>
            "{currentClaim.text}"
          </div>
        </div>

        <div style={{ textAlign:"center", margin:"16px 0" }}>
          <span style={{ fontFamily:"monospace", fontSize:40, color:timerColor, fontWeight:900 }}>
            {String(timer).padStart(2,"0")}
          </span>
          <span style={{ fontFamily:"monospace", fontSize:12, color:"#333", marginLeft:6 }}>SEC</span>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {VERDICTS.map(v => (
            <button key={v.key} onClick={() => handleVote(v.key)} disabled={!!myVote}
              style={{ ...S.voteBtn,
                borderColor: myVote === v.key ? v.color : "#1a1a1a",
                background: myVote === v.key ? v.bg : "#0d0d0d",
                color: myVote === v.key ? v.color : "#555",
              }}>
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop:20, display:"flex", gap:16, justifyContent:"center" }}>
          {DEMO_PLAYERS.slice(1).map(p => (
            <div key={p.id} style={{ textAlign:"center" }}>
              <div style={{ fontSize:20 }}>{p.avatar}</div>
              <div style={{ fontSize:10, fontFamily:"monospace", color: myVote?"#00ff88":"#333", marginTop:3 }}>
                {myVote ? "✓" : "···"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── REVEAL ───────────────────────────────────────────────
  if (screen === "reveal") return (
    <div style={S.root}>
      <div style={S.scanlines} />
      <div style={{ padding: 20 }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#444", marginBottom:4 }}>ROUND {round+1} · AI VERDICT</div>
          {currentClaim && <Tag color="#00ccff">${currentClaim.ticker}</Tag>}
        </div>

        {isLoading ? (
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <div style={{ fontSize:30, marginBottom:16 }}>🤖</div>
            <div style={{ fontFamily:"monospace", color:"#00ff88", fontSize:13 }}>
              {txStatus || "GenLayer AI analyzing..."}
            </div>
            <div style={{ fontFamily:"monospace", color:"#333", fontSize:11, marginTop:8 }}>
              Running Optimistic Democracy consensus
            </div>
            <div style={{ marginTop:20, display:"flex", gap:6, justifyContent:"center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#00ff88",
                  animation:`pulse 1s ${i*0.3}s infinite`, opacity:0.4 }} />
              ))}
            </div>
          </div>
        ) : aiResult ? (
          <>
            {/* AI Verdict card */}
            <div style={{ border:`1px solid ${verdictObj?.color||"#333"}`, background:verdictObj?.bg||"#0a0a0a",
              borderRadius:10, padding:18, marginBottom:14, textAlign:"center" }}>
              <div style={{ fontSize:10, fontFamily:"monospace", color:"#555", marginBottom:6 }}>🤖 GENLAYER AI VERDICT</div>
              <div style={{ fontSize:22, color:verdictObj?.color, fontFamily:"monospace", fontWeight:900, letterSpacing:1 }}>
                {verdictObj?.label}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:11, color:"#555", marginTop:6 }}>
                Score: <span style={{ color:verdictObj?.color }}>{aiResult.ai_score}/100</span>
                &nbsp;·&nbsp;Confidence: <span style={{ color:"#888" }}>{aiResult.confidence}</span>
              </div>
              <div style={{ fontSize:13, color:"#666", marginTop:12, fontStyle:"italic", lineHeight:1.6 }}>
                "{aiResult.reason}"
              </div>
            </div>

            {/* My result */}
            <div style={{ border:`1px solid ${isCorrect?"#00ff8833":"#ff335533"}`,
              background:isCorrect?"#001a0d":"#1a0006",
              borderRadius:8, padding:14, marginBottom:14,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, fontFamily:"monospace", color:"#444" }}>YOUR VOTE</div>
                <div style={{ fontSize:14, color:myVoteObj?.color||"#555", fontFamily:"monospace", marginTop:4 }}>
                  {myVoteObj?.label || "⏰ Time's up"}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:28, color:isCorrect?"#00ff88":"#ff3355" }}>{isCorrect?"✓":"✗"}</div>
                <div style={{ fontSize:13, fontFamily:"monospace", color:isCorrect?"#00ff88":"#555" }}>
                  +{aiResult.points_awarded?.[MY_WALLET]||0} XP
                </div>
              </div>
            </div>

            {/* All players */}
            <div style={{ marginBottom:16 }}>
              {DEMO_PLAYERS.map(p => {
                const pv = playerVotes[p.id];
                const pvObj = VERDICTS.find(v => v.key === pv);
                const correct = pv === aiResult.verdict;
                return (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #0d0d0d" }}>
                    <span>{p.avatar}</span>
                    <span style={{ fontFamily:"monospace", fontSize:11, color:"#444", flex:1 }}>{p.name}</span>
                    <span style={{ fontFamily:"monospace", fontSize:11, color:pvObj?.color||"#333" }}>{pvObj?.label||"—"}</span>
                    <span style={{ fontFamily:"monospace", fontSize:11, color:correct?"#00ff88":"#333" }}>
                      +{aiResult.points_awarded?.[p.id]||0}
                    </span>
                  </div>
                );
              })}
            </div>

            <button onClick={nextRound} style={S.btnGreen}>
              {round+1 >= TOTAL_ROUNDS ? "VIEW LEADERBOARD →" : "NEXT ROUND →"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  // ─── LEADERBOARD ──────────────────────────────────────────
  if (screen === "leaderboard") return (
    <div style={S.root}>
      <div style={S.scanlines} />
      <div style={{ padding: 20 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#444", letterSpacing:4, marginBottom:8 }}>GAME OVER</div>
          <div style={{ fontSize:30, fontFamily:"monospace", fontWeight:900 }}>
            <span style={{ color:"#00ff88" }}>FINAL </span>
            <span style={{ color:"#fff" }}>SCORES</span>
          </div>
          {IS_DEMO && <div style={{ marginTop:8 }}><Tag color="#ff8800">DEMO MODE</Tag></div>}
        </div>

        {sortedPlayers.map((p, i) => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", marginBottom:10,
            borderRadius:8, background:i===0?"#001a0d":"#0a0a0a",
            border:`1px solid ${i===0?"#00ff88":"#111"}` }}>
            <div style={{ fontFamily:"monospace", fontSize:18, width:28, textAlign:"center", color:i===0?"#00ff88":"#333" }}>
              {["🏆","🥈","🥉","4️⃣"][i]||`#${i+1}`}
            </div>
            <span style={{ fontSize:22 }}>{p.avatar}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"monospace", fontSize:12, color: p.id===MY_WALLET?"#00ff88":"#666" }}>
                {p.name}{p.id===MY_WALLET?" (YOU)":""}
              </div>
              <ScoreBar score={scores[p.id]||0} />
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"monospace", fontSize:22, color:i===0?"#00ff88":"#555" }}>
                {scores[p.id]||0}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:10, color:"#333" }}>XP</div>
            </div>
          </div>
        ))}

        <div style={S.infoBox}>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"#444", textAlign:"center", lineHeight:1.8 }}>
            🤖 All verdicts determined by GenLayer Intelligent Contract<br/>
            ⛓️ Optimistic Democracy · Bradbury Testnet
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:16 }}>
          <button onClick={startGame} style={S.btnGreen}>PLAY AGAIN</button>
          <button onClick={() => setScreen("lobby")} style={{ ...S.btnGreen, background:"transparent", color:"#555", border:"1px solid #222" }}>
            LOBBY
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}

const S = {
  root: { minHeight:"100vh", background:"#060606", color:"#eee", position:"relative", maxWidth:480, margin:"0 auto" },
  scanlines: { position:"fixed", inset:0, background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.12) 2px,rgba(0,0,0,0.12) 4px)", pointerEvents:"none", zIndex:10 },
  center: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", padding:20 },
  logo: { fontSize:38, fontWeight:900, fontFamily:"monospace", textAlign:"center", marginBottom:28, letterSpacing:-1 },
  card: { width:"100%", maxWidth:400, background:"#0a0a0a", border:"1px solid #1a1a1a", borderRadius:12, padding:22 },
  topBar: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid #111" },
  claimBox: { background:"#0d0d0d", border:"1px solid #1a1a1a", borderRadius:8, padding:16, margin:"14px 0" },
  voteBtn: { padding:"14px 8px", borderRadius:8, border:"1px solid", cursor:"pointer", fontFamily:"monospace", fontSize:12, fontWeight:"bold", transition:"all 0.15s" },
  btnGreen: { width:"100%", padding:14, background:"#00ff88", color:"#000", border:"none", borderRadius:8, fontFamily:"monospace", fontSize:13, fontWeight:"bold", cursor:"pointer", letterSpacing:2 },
  infoBox: { background:"#0a0a0a", border:"1px solid #111", borderRadius:6, padding:12, marginTop:14 },
};
