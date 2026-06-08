import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize GoogleGenAI server side
let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
} catch (err) {
  console.error("Failed to initialize GoogleGenAI:", err);
}

// Global Simulated Hermes State
let currentPrice = 2315.42;
let balance = 100000.00;
let dailyEquityStarting = 100000.00;
let weeklyEquityStarting = 100000.00;

let trades: any[] = [
  {
    id: "t_1",
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    instrument: "XAUUSD",
    direction: "BUY",
    type: "Order Block Tap",
    entryPrice: 2310.50,
    stopLoss: 2305.00,
    takeProfit: 2325.00,
    lotSize: 2.0,
    currentPrice: 2315.42,
    pnl: 984.00,
    status: "OPEN",
    stage: "paper",
    riskPercent: 0.9,
    rrRatio: 2.6,
    notes: "New York session open sweep of London Low, tapping bullish H1 Order Block."
  },
  {
    id: "t_2",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    instrument: "XAUUSD",
    direction: "SELL",
    type: "FVG Retest",
    entryPrice: 2322.10,
    stopLoss: 2326.50,
    takeProfit: 2312.00,
    lotSize: 1.5,
    currentPrice: 2315.42,
    pnl: 1002.00,
    status: "OPEN",
    stage: "live",
    riskPercent: 0.8,
    rrRatio: 2.3,
    notes: "H4 Bearish Fair Value Gap partial fill with SMT divergence in USD index."
  }
];

let closedTrades: any[] = [
  {
    id: "t_c1",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    instrument: "XAUUSD",
    direction: "BUY",
    type: "Liquidity Sweep",
    entryPrice: 2304.20,
    stopLoss: 2299.00,
    takeProfit: 2314.50,
    exitPrice: 2314.50,
    lotSize: 1.8,
    currentPrice: 2314.50,
    pnl: 1854.00,
    status: "CLOSED",
    stage: "live",
    riskPercent: 0.94,
    rrRatio: 1.98,
    closedAt: new Date(Date.now() - 86000000).toISOString(),
    notes: "Asian high sweep after London opening. Fully hit take profit."
  },
  {
    id: "t_c2",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    instrument: "XAUUSD",
    direction: "SELL",
    type: "Order Block Tap",
    entryPrice: 2328.00,
    stopLoss: 2332.00,
    takeProfit: 2318.00,
    exitPrice: 2332.00,
    lotSize: 2.5,
    currentPrice: 2332.00,
    pnl: -1000.00,
    status: "CLOSED",
    stage: "paper",
    riskPercent: 1.0,
    rrRatio: 2.5,
    closedAt: new Date(Date.now() - 171000000).toISOString(),
    notes: "Tapped bearish OB but news spikes swept stop-loss before target. Max risk limit protected equity."
  }
];

let fairValueGaps: any[] = [
  { id: "f_1", timestamp: new Date(Date.now() - 7200000).toISOString(), type: "BULLISH", high: 2312.00, low: 2308.20, midPoint: 2310.10, status: "ACTIVE" },
  { id: "f_2", timestamp: new Date(Date.now() - 18000000).toISOString(), type: "BEARISH", high: 2331.40, low: 2328.10, midPoint: 2329.75, status: "ACTIVE" }
];

let orderBlocks: any[] = [
  { id: "o_1", timestamp: new Date(Date.now() - 28800000).toISOString(), direction: "BULLISH", top: 2306.00, bottom: 2300.50, volume: 1540, status: "ACTIVE" },
  { id: "o_2", timestamp: new Date(Date.now() - 43200000).toISOString(), direction: "BEARISH", top: 2334.50, bottom: 2329.00, volume: 1890, status: "ACTIVE" }
];

let liquidityPools: any[] = [
  { id: "l_1", type: "BSL", price: 2338.50, timestamp: new Date(Date.now() - 21600000).toISOString(), swept: false },
  { id: "l_2", type: "SSL", price: 2298.10, timestamp: new Date(Date.now() - 21600000).toISOString(), swept: false }
];

let logs: any[] = [
  { id: "log_1", timestamp: new Date(Date.now() - 10000).toISOString(), source: "SYSTEM", level: "INFO", text: "Hermes Autonomous Core daemon v0.15.2 initialized successfully." },
  { id: "log_2", timestamp: new Date(Date.now() - 9000).toISOString(), source: "RPC", level: "SUCCESS", text: "Successfully connected to Hermes Host RPC server at http://host.docker.internal:7778" },
  { id: "log_3", timestamp: new Date(Date.now() - 8000).toISOString(), source: "MT5_DATA", level: "SUCCESS", text: "MetaTrader 5 ZeroMQ Bridges linked: DATA:5555 connected" },
  { id: "log_4", timestamp: new Date(Date.now() - 7500).toISOString(), source: "MT5_ORDER", level: "SUCCESS", text: "MetaTrader 5 ZeroMQ Bridges linked: ORDER:5557 ready" },
  { id: "log_5", timestamp: new Date(Date.now() - 7000).toISOString(), source: "REDIS", level: "INFO", text: "Redis Pub/Sub listening on redis://redis:6379 channels [hermes:signals, hermes:logs]" },
  { id: "log_6", timestamp: new Date(Date.now() - 6500).toISOString(), source: "CHROMA", level: "SUCCESS", text: "Vector Database mapped to ChromaDB server at http://chromadb:8000" },
  { id: "log_7", timestamp: new Date(Date.now() - 6000).toISOString(), source: "SYSTEM", level: "INFO", text: "Obsidian Vault mounted at /data/obsidian (Local disk sync enabled)." },
  { id: "log_8", timestamp: new Date(Date.now() - 5000).toISOString(), source: "OLLAMA", level: "SUCCESS", text: "Ollama LLM connection verified at http://host.docker.internal:11434 with model hermes-3-llama-3.1" },
  { id: "log_9", timestamp: new Date(Date.now() - 3000).toISOString(), source: "SYSTEM", level: "INFO", text: "Loading custom SMC strategies from Obsidian /Strategy Cards/..." },
  { id: "log_10", timestamp: new Date(Date.now() - 1000).toISOString(), source: "SYSTEM", level: "SUCCESS", text: "Active trading methodology target: XAUUSD (Gold Intraday SMC/ICT Scalping)." }
];

let obsidianNotes: any[] = [
  {
    path: "Strategy Cards/XAUUSD_Liquidity_Sweep.md",
    title: "XAUUSD Liquidity Sweep & Displacement Strategy",
    content: "# XAUUSD Liquidity Sweep Strategy\n\n**Instrument**: XAUUSD\n**Timeframes**: Daily/H1 for Bias, M5/M1 for Entries\n\n## Core Rules\n1. Wait for Asian Session High/Low or Prev Daily High/Low to be swept.\n2. Look for strong Displacement in the opposite direction on M1/M5, leaving a Fair Value Gap (FVG).\n3. Set Buy/Sell Limit at the premium/discount level of the newly formed FVG.\n4. Risk strictly 1.0% per trade. Stop loss goes below/above the sweep candle swinging structure.\n\n## Status\nCurrent Stage: **live**\nWin Rate: 68%\nProfit Factor: 2.14",
    folder: "Strategy Cards",
    tags: ["SMC", "ICT", "XAUUSD", "Liquidity", "Live"],
    mtime: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    path: "Strategy Cards/Order_Block_Mitigation.md",
    title: "Order Block Mitigation Strategy",
    content: "# Order Block Mitigation Strategy\n\n**Instrument**: XAUUSD\n**Timeframes**: H4/H1 Bias, M5 Entries\n\n## Core Rules\n1. Identify a high-volume candle before an impulsive break of structure (BMS/MSD).\n2. Mark this candle zone as the Bullish or Bearish Order Block (OB).\n3. Place entry limit orders at the 50% Mean Threshold or the Open price of the OB candle, depending on risk tolerance.\n4. Close trade if immediate structure is broken against the setup.\n\n## Status\nCurrent Stage: **paper**\nWin Rate: 60%\nProfit Factor: 1.85",
    folder: "Strategy Cards",
    tags: ["OB", "Mitigation", "Gold", "SMC", "Paper"],
    mtime: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    path: "Trade Logs/XAUUSD_Sweep_Success_2026-06-07.md",
    title: "Trade Review: London Low Sweep Recovery",
    content: "# Trade Review - June 7, 2026\n\n* **Direction**: BUY\n* **Entry Level**: 2304.20\n* **Risk**: 0.94%\n* **P&L**: +$1,854.00 (Success)\n\n## Hypothesis & Setup\nLondon open took out Asian Low. Sharp displacement upwards on M1 left a clean bullish FVG. Entry took place on the retest. Trade reached full target at New York pre-market high.\n\n## Lesson\nDisplacement was fast. High spread during London open requires setting entry orders 0.2 pips above the FVG top.",
    folder: "Trade Logs",
    tags: ["TradeReview", "Gold", "Displacement", "Success"],
    mtime: new Date(Date.now() - 40000000).toISOString()
  }
];

let skills: any[] = [
  {
    name: "skill_liquidity_sweep_detector.py",
    description: "Detects real-time buy-stop/sell-stop liquidity sweeps in M1-M5 data and publishes events to Redis.",
    code: `import numpy as np
import pandas as pd

def detect_liquidity_sweep(highs, lows, closes, threshold=0.0005):
    """
    SMC/ICT Sweep Detector
    Calculates swing highs/lows and verifies shadow penetration with immediate body displacement.
    """
    sweeps = []
    # Identify local peaks from high-volume sessions
    # (Implementation verified on MT5 Tick feeds)
    return sweeps`,
    successRate: 84.5,
    usageCount: 328,
    lastUpdated: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    name: "skill_fvg_mitigation_tracker.py",
    description: "Tracks active H1/M15 Fair Value Gaps and marks them as mitigated upon tick overlap.",
    code: `def track_fvg_mitigation(ticks, active_fvgs):
    """
    Monitors live bid/ask quotes and flags gaps that have been 50% or 100% neutralized.
    """
    updated_fvgs = []
    # Real-time overlap evaluation
    return updated_fvgs`,
    successRate: 78.2,
    usageCount: 512,
    lastUpdated: new Date(Date.now() - 86400000 * 6).toISOString()
  }
];

let autonomousLoops = {
  nightlyMarketScan: { lastRun: new Date(Date.now() - 17280000 * 2).toISOString(), status: "IDLE", outcome: "H1 setup candidate detected on Thursday daily structure, logged to Obsidian vault." },
  skillAutoCreation: { lastRun: new Date(Date.now() - 86400000 * 3).toISOString(), status: "IDLE", outcome: "Self-evolved OB momentum tracker.py code successfully generated and compiled into Hermes Skill system." },
  paperTradeReview: { lastRun: new Date(Date.now() - 86400000 * 1).toISOString(), status: "IDLE", outcome: "Assessed weekly P&L: Weekly equity growth of 2.1% achieved, drawdown controlled within 1.2% maximum." },
  hypothesisRandD: { lastRun: new Date(Date.now() - 1200000).toISOString(), status: "RUNNING", outcome: "Simulating backtests for aggressive New York Silver Divergence logic on M1." }
};

// Periodic tick simulation to simulate live MT5 Tick feeds
setInterval(() => {
  // Move price a bit
  const change = (Math.random() - 0.495) * 0.4; // Slightly positive bias
  currentPrice = parseFloat((currentPrice + change).toFixed(2));
  
  // Randomly update open trades P&L
  trades = trades.map(t => {
    let pnl = t.pnl;
    if (t.direction === "BUY") {
      pnl = (currentPrice - t.entryPrice) * t.lotSize * 100;
    } else {
      pnl = (t.entryPrice - currentPrice) * t.lotSize * 100;
    }
    return { ...t, currentPrice, pnl: parseFloat(pnl.toFixed(2)) };
  });

  // Periodically add active or mitigated FVGs / swept liquidity
  if (Math.random() > 0.98) {
    const isBull = Math.random() > 0.5;
    const keyPrice = currentPrice + (Math.random() - 0.5) * 10;
    const fvgType = isBull ? "BULLISH" : "BEARISH";
    fairValueGaps.push({
      id: "f_" + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      type: fvgType,
      high: parseFloat((keyPrice + 1.2).toFixed(2)),
      low: parseFloat((keyPrice - 1.2).toFixed(2)),
      midPoint: parseFloat(keyPrice.toFixed(2)),
      status: "ACTIVE"
    });
    
    logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      source: "MT5_DATA",
      level: "INFO",
      text: `SMC Discovery: New H1 ${fvgType} Fair Value Gap formed near ${keyPrice.toFixed(2)}`
    });
  }

  // Sweep Liquidity Pool
  liquidityPools = liquidityPools.map(l => {
    if (!l.swept) {
      if ((l.type === "BSL" && currentPrice >= l.price) || (l.type === "SSL" && currentPrice <= l.price)) {
        logs.push({
          id: "log_" + Date.now(),
          timestamp: new Date().toISOString(),
          source: "REDIS",
          level: "SUCCESS",
          text: `SMC SIGNAL SENT: Liquidity sweep triggered at ${l.type} pool (${l.price}). Dispatching order rule.`
        });
        return { ...l, swept: true, sweptAt: new Date().toISOString() };
      }
    }
    return l;
  });

  // Trim logs if they become too many
  if (logs.length > 100) {
    logs.shift();
  }
}, 3000);

// API Endpoints
app.get("/api/status", (req, res) => {
  res.json({
    ollama: ai ? 'connected' : 'disconnected',
    hermesRpc: 'connected',
    mt5Zmq: {
      data: 'connected',
      draw: 'connected',
      order: 'connected'
    },
    redis: 'connected',
    chromaDb: 'connected',
    obsidian: 'connected'
  });
});

app.get("/api/market", (req, res) => {
  res.json({
    currentPrice,
    dailyHigh: 2329.80,
    dailyLow: 2301.20,
    sessions: {
      asian: { open: false, range: "2301.20 - 2311.50" },
      london: { open: true, range: "2304.20 - 2322.10" },
      newYork: { open: true, range: "2310.50 - 2329.80" }
    },
    fairValueGaps,
    orderBlocks,
    liquidityPools
  });
});

app.get("/api/trades", (req, res) => {
  res.json({
    active: trades,
    closed: closedTrades,
    balance,
    equity: balance + trades.reduce((acc, t) => acc + t.pnl, 0),
    dailyDDPercent: 0.85,  // Under max 4%
    weeklyDDPercent: 1.45 // Under max 8%
  });
});

app.post("/api/trades", (req, res) => {
  const { direction, type, entryPrice, stopLoss, takeProfit, lotSize, stage, riskPercent } = req.body;
  
  if (riskPercent > 1.0) {
    return res.status(400).json({ error: "SMC Risk Gatekeeper: Cannot execute trade. Risk percentage exceeds maximum allowed 1.0% setup limit." });
  }

  const newTrade = {
    id: "t_" + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    instrument: "XAUUSD",
    direction,
    type,
    entryPrice: parseFloat(entryPrice) || currentPrice,
    stopLoss: parseFloat(stopLoss),
    takeProfit: parseFloat(takeProfit),
    lotSize: parseFloat(lotSize) || 1.0,
    currentPrice,
    pnl: 0,
    status: "OPEN",
    stage: stage || "paper",
    riskPercent: parseFloat(riskPercent) || 0.5,
    rrRatio: parseFloat(((takeProfit - entryPrice) / (entryPrice - stopLoss)).toFixed(2)) || 2.0,
    notes: `${stage} order route initiated directly from Hermes agent dashboard.`
  };

  trades.push(newTrade);
  
  logs.push({
    id: "log_" + Date.now(),
    timestamp: new Date().toISOString(),
    source: "MT5_ORDER",
    level: "SUCCESS",
    text: `Order Router: Successfully deployed [${direction}] trade ticket for ${newTrade.lotSize} lots at ${newTrade.entryPrice} on ZeroMQ Port 5557.`
  });

  res.json(newTrade);
});

app.post("/api/trades/close/:id", (req, res) => {
  const tradeIndex = trades.findIndex(t => t.id === req.params.id);
  if (tradeIndex !== -1) {
    const trade = trades[tradeIndex];
    trades.splice(tradeIndex, 1);
    const completed = {
      ...trade,
      status: "CLOSED",
      exitPrice: currentPrice,
      closedAt: new Date().toISOString(),
      notes: "Closed manually by supervisor from web terminal."
    };
    closedTrades.push(completed);
    balance += completed.pnl;

    logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      source: "MT5_ORDER",
      level: "INFO",
      text: `Order Router: Position ${completed.id} cleared. Net PnL realized: $${completed.pnl.toFixed(2)}`
    });

    res.json(completed);
  } else {
    res.status(404).json({ error: "Trade ticket not found" });
  }
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

app.post("/api/logs", (req, res) => {
  const { source, level, text } = req.body;
  const newLog = {
    id: "log_" + Date.now(),
    timestamp: new Date().toISOString(),
    source: source || "SYSTEM",
    level: level || "INFO",
    text
  };
  logs.push(newLog);
  res.json(newLog);
});

app.get("/api/vault", (req, res) => {
  res.json(obsidianNotes);
});

app.post("/api/vault", (req, res) => {
  const { title, content, folder, tags } = req.body;
  const path = `${folder}/${title.replace(/\s+/g, '_')}.md`;
  const newNote = {
    path,
    title,
    content,
    folder,
    tags: tags || [],
    mtime: new Date().toISOString()
  };
  obsidianNotes.push(newNote);
  
  logs.push({
    id: "log_" + Date.now(),
    timestamp: new Date().toISOString(),
    source: "SYSTEM",
    level: "SUCCESS",
    text: `Obsidian Vault Synchronizer: Successfully compiled note ${newNote.path} inside mounted directory.`
  });

  res.json(newNote);
});

app.get("/api/skills", (req, res) => {
  res.json(skills);
});

app.post("/api/skills", (req, res) => {
  const { name, description, code } = req.body;
  const newSkill = {
    name,
    description,
    code,
    successRate: 75.0,
    usageCount: 1,
    lastUpdated: new Date().toISOString()
  };
  skills.push(newSkill);

  logs.push({
    id: "log_" + Date.now(),
    timestamp: new Date().toISOString(),
    source: "SYSTEM",
    level: "SUCCESS",
    text: `Hermes Autonomous loop: New trading skill compiled successfully [${name}]. Adding to skills index.`
  });

  res.json(newSkill);
});

app.get("/api/loops", (req, res) => {
  res.json(autonomousLoops);
});

app.post("/api/loops/trigger/:loop", (req, res) => {
  const loop = req.params.loop as keyof typeof autonomousLoops;
  if (autonomousLoops[loop]) {
    autonomousLoops[loop].status = "RUNNING";
    autonomousLoops[loop].lastRun = new Date().toISOString();
    
    logs.push({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString(),
      source: "RPC",
      level: "INFO",
      text: `Hermes Daemon: Triggering macro workstream [${loop}] via asynchronous pipeline.`
    });

    setTimeout(() => {
      autonomousLoops[loop].status = "IDLE";
      let outcomeText = "";
      if (loop === "nightlyMarketScan") {
        outcomeText = "Completed session scans. Analyzed London/New York high-volume breakouts. Zero new mitigations triggered.";
      } else if (loop === "skillAutoCreation") {
        const num = Math.floor(Math.random() * 99) + 10;
        const skillName = `skill_reversal_edge_${num}.py`;
        const newS = {
          name: skillName,
          description: "SMC displacement rate assessor developed by Ollama.",
          code: "def evaluate_momentum():\n    return 'EDGE_CONFIRMED'",
          successRate: 80.4,
          usageCount: 0,
          lastUpdated: new Date().toISOString()
        };
        skills.push(newS);
        outcomeText = `Successfully generated, linted, and deployed new edge parser [${skillName}].`;
      } else if (loop === "paperTradeReview") {
        outcomeText = "Finished paper metric sweeps: Sharpe ratio: 2.11, drawdown limit checks passed.";
      } else if (loop === "hypothesisRandD") {
        outcomeText = "Standard walk-forward backtest yielded 1.94 profit factor across 40 simulated trials.";
      }
      autonomousLoops[loop].outcome = outcomeText;
      
      logs.push({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString(),
        source: "RPC",
        level: "SUCCESS",
        text: `Hermes Daemon: Workstream [${loop}] successfully execution finished. Result: ${outcomeText}`
      });
    }, 5000);

    res.json(autonomousLoops[loop]);
  } else {
    res.status(400).json({ error: "Unknown loop identifier" });
  }
});

// Gemini Chat & Analysis Endpoint
app.post("/api/gemini/analyze", async (req, res) => {
  const { prompt, type } = req.body;
  
  if (!ai) {
    return res.json({ 
      text: `### Ollama Offline - Hermes Agent Assistant Mode (SMC Analysis Framework)

The actual Gemini API is currently offline or the API key is not configured inside this testbed. However, let me evaluate this gold SMC/ICT setup mathematically based on Hermes system properties:

* **Asset**: XAUUSD (Gold)
* **Structure Price**: $${currentPrice.toFixed(2)}
* **Active FVG**: ${fairValueGaps.map(f => `[$${f.low} - $${f.high}]`).join(', ') || 'No active gaps detected'}
* **Major Liquidity**: SSL established at $2298.10, BSL established at $2338.50.

**Analysis & Strategy Suggestion**:
Since high-volume liquidity pools remain intact, expect a hunt for the sell-stops at $2298.10 before any major bullish expansion. Keep entry risks strictly bounded to **0.9%** with a stop-loss directly outside the swing swing candle high to satisfy strict staged security guidelines (Max Daily limit of 4%).`
    });
  }

  try {
    let customPrompt = prompt;
    if (type === "smc-audit") {
      customPrompt = `You are "Hermes Trading Agent" - a highly specialized autonomous SMC/ICT algorithmic trader analyzing the XAUUSD market.
Current Gold Price: $${currentPrice}
Active Fair Value Gaps (FVG): ${JSON.stringify(fairValueGaps)}
Open Order Blocks: ${JSON.stringify(orderBlocks)}
Active Liquidity Levels BSL/SSL: ${JSON.stringify(liquidityPools)}

Analyze this market context using classic SMC/ICT frameworks. Identify potential trade setups, and comment specifically on managing the trade within our risk constraints:
- Maximum 1% risk per trade
- Staged trust level verification (hypothesis -> backtest -> paper -> live_candidate -> live)

Give your analysis in clear, highly professional Markdown formatting. Do not assume any external indicators, focus strictly on Price Action, displacement, sweeps, and structural displacement.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: customPrompt,
      config: {
        systemInstruction: "You are the core consciousness of the Hermes Trading Agent, a sophisticated SMC/ICT trading system designed for Gold. You are meticulous, speak with professional precision, and always demand rigorous risk management.",
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini call failed:", error);
    res.status(500).json({ error: "Gemini server call failure: " + error.message });
  }
});


async function startServer() {
  // Serve static files in production setup or proxy Vite in development setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
