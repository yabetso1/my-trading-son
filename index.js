require('dotenv').config();
const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

const clientId = process.env.CTRADER_CLIENT_ID;
const clientSecret = process.env.CTRADER_CLIENT_SECRET;
const accessToken = process.env.CTRADER_ACCESS_TOKEN;
const apiHost = process.env.CTRADER_HOST || 'demo.ctraderapi.com';
const isLiveAccount = !apiHost.includes('demo');

// Global App State
const executionHistory = [];
let currentBid = 0;
let currentAsk = 0;
let internalAccountId = null;
let goldSymbolId = null;
let connection = null;

// Global AI State tracker
let aiState = {
    lastUpdate: Date.now(),
    action: 'INITIALIZING',
    confidence: 0.0,
    message: 'Awaiting market data from GitHub Actions...'
};

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/ping', (req, res) => {
    res.status(200).send("OK - Server is awake!");
});

app.get('/dashboard', async (req, res) => {
    try {
        if (!connection || !internalAccountId) {
            return res.send(`
                <body style="background:#05070a;color:#94a3b8;font-family:sans-serif;padding:40px;text-align:center;">
                    <h2 style="color:#fff;">Connecting to Broker API...</h2>
                    <p>The institutional gateway is establishing connection. Refreshing in 5 seconds...</p>
                    <script>setTimeout(()=>window.location.reload(), 5000);</script>
                </body>
            `);
        }

        const traderRes = await connection.sendCommand('ProtoOATraderReq', { ctidTraderAccountId: internalAccountId });
        const reconcileRes = await connection.sendCommand('ProtoOAReconcileReq', { ctidTraderAccountId: internalAccountId });

        let cleanDeals = [];
        try {
            const dealRes = await connection.sendCommand('ProtoOADealListReq', {
                ctidTraderAccountId: internalAccountId,
                fromTimestamp: Date.now() - (90 * 24 * 60 * 60 * 1000),
                toTimestamp: Date.now(),
                maxRows: 1000
            });
            const rawDeals = dealRes.deal || [];
            cleanDeals = rawDeals.filter(d => d.closePositionDetail).map(d => ({
                id: d.dealId,
                timestamp: Number(d.executionTimestamp || Date.now()),
                netProfit: ((d.closePositionDetail.netProfit || 0) / 100),
                tradeSide: d.tradeSide,
                volume: d.volume
            })).sort((a, b) => a.timestamp - b.timestamp);
        } catch (e) {
            console.log("Deal query note:", e.message || e);
        }

        const balance = (traderRes.trader.balance / 100).toFixed(2);
        const positions = reconcileRes.position || [];
        
        let unrealizedPnl = 0;
        positions.forEach(p => unrealizedPnl += ((p.grossProfit || 0) / 100));
        const equity = (parseFloat(balance) + unrealizedPnl).toFixed(2);
        
        const openLongs = positions.filter(p => p.tradeSide === 'BUY' || p.tradeSide === 1).length;
        const openShorts = positions.filter(p => p.tradeSide === 'SELL' || p.tradeSide === 2).length;
        const liveSpread = (currentAsk > 0 && currentBid > 0) ? ((currentAsk - currentBid) / 100000).toFixed(2) : "0.00";
        const reversedDeals = [...cleanDeals].reverse();

        // Calculate AI styling
        const timeSinceUpdate = Math.floor((Date.now() - aiState.lastUpdate) / 60000);
        const timeText = timeSinceUpdate === 0 ? 'Just now' : `${timeSinceUpdate} min ago`;
        const aiColor = aiState.action === 'BUY' ? 'text-emerald-400' : (aiState.action === 'SELL' ? 'text-rose-400' : (aiState.action === 'HOLD' ? 'text-amber-400' : 'text-gray-400'));

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quant Terminal | XAUUSD</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #05070a; color: #a1a1aa; }
                .font-mono { font-family: 'JetBrains Mono', monospace; }
                .glow-card { background: #0c1017; border: 1px solid #1a2332; box-shadow: 0 4px 30px rgba(0,0,0,0.5); }
                .terminal-header { background: linear-gradient(180deg, #111827 0%, #0c1017 100%); border-bottom: 1px solid #1a2332; }
                .blink { animation: blinker 2s linear infinite; }
                @keyframes blinker { 50% { opacity: 0; } }
            </style>
        </head>
        <body class="min-h-screen pb-10">
            <!-- Top Navigation Bar -->
            <div class="terminal-header px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
                <div class="flex items-center gap-4">
                    <div class="w-2 h-2 rounded-full bg-emerald-500 blink" style="box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);"></div>
                    <h1 class="text-xl font-bold text-white tracking-tight">ALGORITHMIC TRADING TERMINAL</h1>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${isLiveAccount ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}">
                        ${isLiveAccount ? 'LIVE ENVIRONMENT' : 'DEMO ENVIRONMENT'}
                    </span>
                </div>
                <div class="flex items-center gap-4 text-xs font-mono">
                    <div class="flex items-center gap-2"><span class="text-gray-500">ASSET:</span><span class="text-white font-bold">XAU/USD (GOLD)</span></div>
                    <div class="w-px h-4 bg-gray-800"></div>
                    <div class="flex items-center gap-2"><span class="text-gray-500">BROKER:</span><span class="text-white">IC MARKETS</span></div>
                </div>
            </div>

            <div class="max-w-[1500px] mx-auto px-4 mt-6 space-y-4">
                
                <!-- AI Diagnostics Panel -->
                <div class="glow-card rounded-xl p-5">
                    <div class="flex items-center gap-2 mb-4 pb-3 border-b border-[#1a2332]">
                        <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">XGBoost AI Diagnostics</h3>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <span class="text-[10px] text-gray-500 uppercase tracking-wider">Current Posture</span>
                            <div class="text-2xl font-mono font-bold mt-1 ${aiColor}">${aiState.action}</div>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-500 uppercase tracking-wider">Model Confidence</span>
                            <div class="text-2xl font-mono font-bold text-white mt-1">${aiState.confidence}%</div>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-500 uppercase tracking-wider">Last Evaluation</span>
                            <div class="text-lg font-mono text-gray-300 mt-2">${timeText}</div>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-500 uppercase tracking-wider">System Message</span>
                            <div class="text-xs font-mono text-gray-400 mt-2 bg-[#05070a] p-2 rounded border border-[#1a2332]">${aiState.message}</div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <!-- Chart Module -->
                    <div class="lg:col-span-8 glow-card rounded-xl p-5 flex flex-col justify-between">
                        <div class="flex flex-col sm:flex-row justify-between gap-4 mb-4">
                            <div>
                                <span class="text-[10px] text-gray-500 uppercase tracking-wider">Account Equity Curve</span>
                                <div class="flex items-baseline gap-3 mt-1">
                                    <span id="pnlDisplay" class="text-3xl font-mono font-bold text-white">$0.00</span>
                                    <span id="rocDisplay" class="text-xs px-2 py-0.5 rounded font-mono border">0.0%</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1 bg-[#05070a] p-1 rounded-lg border border-[#1a2332]">
                                <button onclick="setTimeframe('1D')" id="btn-1D" class="tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white">Day</button>
                                <button onclick="setTimeframe('1W')" id="btn-1W" class="tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white">Week</button>
                                <button onclick="setTimeframe('ALL')" id="btn-ALL" class="tf-btn px-3 py-1 rounded text-xs font-mono text-blue-400 font-bold bg-[#111827] border border-[#1f2937]">All</button>
                            </div>
                        </div>
                        <div class="h-64 w-full relative"><canvas id="equityChart"></canvas></div>
                    </div>

                    <!-- Status Module -->
                    <div class="lg:col-span-4 glow-card rounded-xl p-5 flex flex-col justify-between space-y-6">
                        <div>
                            <div class="text-[10px] text-gray-500 uppercase tracking-wider border-b border-[#1a2332] pb-2 mb-4">Capital Overview</div>
                            <div class="space-y-4">
                                <div class="flex justify-between items-end">
                                    <div><span class="text-xs text-gray-500">Balance</span><div class="text-2xl font-mono font-bold text-white mt-1">$${balance}</div></div>
                                    <div class="text-right"><span class="text-xs text-gray-500">Equity</span><div class="text-xl font-mono font-semibold ${parseFloat(equity) >= parseFloat(balance) ? 'text-emerald-400' : 'text-rose-400'} mt-1">$${equity}</div></div>
                                </div>
                                <div class="bg-[#05070a] p-3 rounded-lg border border-[#1a2332] space-y-2 mt-4 text-xs font-mono">
                                    <div class="flex justify-between"><span class="text-gray-500">Live Spread</span><span class="text-white">${liveSpread} pts</span></div>
                                    <div class="flex justify-between"><span class="text-gray-500">Risk Allocation</span><span class="text-amber-400">10.0% ($${(balance * 0.10).toFixed(2)})</span></div>
                                    <div class="flex justify-between"><span class="text-gray-500">Active Exposure</span><span class="text-white">${positions.length}/2 Positions</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Live Positions -->
                <div class="glow-card rounded-xl overflow-hidden mt-4">
                    <div class="p-4 border-b border-[#1a2332] flex items-center justify-between bg-[#0a0d14]">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-300">Live Market Positions</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="bg-[#05070a] text-gray-500 uppercase border-b border-[#1a2332]">
                                <tr>
                                    <th class="p-3">ID</th><th class="p-3">Side</th><th class="p-3">Volume</th>
                                    <th class="p-3">Entry</th><th class="p-3">Stop Loss</th><th class="p-3">Take Profit</th><th class="p-3 text-right">Unrealized P&L</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-[#1a2332] text-gray-300">
                                ${positions.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-gray-600">No active positions.</td></tr>` : positions.map(p => `
                                    <tr class="hover:bg-[#111827] transition-colors">
                                        <td class="p-3 text-gray-500">#${p.positionId}</td>
                                        <td class="p-3 font-bold ${p.tradeSide === 'BUY' || p.tradeSide === 1 ? 'text-emerald-400' : 'text-rose-400'}">${p.tradeSide === 1 || p.tradeSide === 'BUY' ? 'LONG' : 'SHORT'}</td>
                                        <td class="p-3">${(p.volume / 100).toFixed(2)} oz</td> <td class="p-3">$${(p.price || 0).toFixed(2)}</td>
                                        <td class="p-3 text-rose-400/80">${p.stopLoss ? '$' + p.stopLoss.toFixed(2) : 'Dynamic'}</td>
                                        <td class="p-3 text-emerald-400/80">${p.takeProfit ? '$' + p.takeProfit.toFixed(2) : 'Dynamic'}</td>
                                        <td class="p-3 text-right font-bold ${(p.grossProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                                            ${(p.grossProfit || 0) >= 0 ? '+$' : '-$'}${Math.abs((p.grossProfit || 0)/100).toFixed(2)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Trade History -->
                <div class="glow-card rounded-xl overflow-hidden mt-4">
                    <div class="p-4 border-b border-[#1a2332] flex items-center justify-between bg-[#0a0d14]">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-300">Execution Ledger</h3>
                        <span class="text-[10px] font-mono text-gray-500">Showing last 50 trades</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="bg-[#05070a] text-gray-500 uppercase border-b border-[#1a2332]">
                                <tr>
                                    <th class="p-3">Execution Time</th><th class="p-3">Action</th>
                                    <th class="p-3">Volume</th><th class="p-3">Net Result</th><th class="p-3 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-[#1a2332] text-gray-300">
                                ${reversedDeals.length === 0 ? `<tr><td colspan="5" class="p-6 text-center text-gray-600">Ledger empty. Awaiting AI execution.</td></tr>` : reversedDeals.slice(0, 50).map(item => {
                                    const isProfit = item.netProfit >= 0;
                                    return `
                                    <tr class="hover:bg-[#111827] transition-colors">
                                        <td class="p-3 text-gray-500">${new Date(item.timestamp).toLocaleString()}</td>
                                        <td class="p-3 ${item.tradeSide === 'BUY' || item.tradeSide === 1 ? 'text-emerald-400' : 'text-rose-400'}">
                                            ${item.tradeSide === 1 || item.tradeSide === 'BUY' ? 'LONG' : 'SHORT'}
                                        </td>
                                        <td class="p-3 text-gray-400">${(item.volume / 100).toFixed(2)} oz</td>
                                        <td class="p-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}">
                                            ${isProfit ? '+$' : '-$'}${Math.abs(item.netProfit).toFixed(2)}
                                        </td>
                                        <td class="p-3 text-right"><span class="text-gray-500 uppercase text-[10px] border border-gray-700 px-1.5 py-0.5 rounded">Settled</span></td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <script>
                const allDeals = ${JSON.stringify(cleanDeals)};
                const currentBalance = ${balance};
                let chartInstance = null;

                function setTimeframe(tf) {
                    document.querySelectorAll('.tf-btn').forEach(btn => btn.className = 'tf-btn px-3 py-1 rounded text-xs font-mono text-gray-500 hover:text-white transition-all');
                    const activeBtn = document.getElementById('btn-' + tf);
                    if (activeBtn) activeBtn.className = 'tf-btn px-3 py-1 rounded text-xs font-mono text-blue-400 font-bold bg-[#111827] border border-[#1f2937] transition-all';

                    const now = Date.now();
                    let cutoff = 0;
                    if (tf === '1D') cutoff = now - (24 * 60 * 60 * 1000);
                    else if (tf === '1W') cutoff = now - (7 * 24 * 60 * 60 * 1000);
                    
                    const filteredDeals = allDeals.filter(d => d.timestamp >= cutoff);
                    let periodPnl = 0;
                    filteredDeals.forEach(d => periodPnl += (parseFloat(d.netProfit) || 0));

                    const roc = currentBalance > 0 ? ((periodPnl / currentBalance) * 100).toFixed(2) : "0.00";
                    const pnlEl = document.getElementById('pnlDisplay');
                    pnlEl.innerText = (periodPnl >= 0 ? '+$' : '-$') + Math.abs(periodPnl).toFixed(2);
                    pnlEl.className = 'text-3xl font-mono font-bold ' + (periodPnl >= 0 ? 'text-emerald-400' : 'text-rose-500');

                    const rocEl = document.getElementById('rocDisplay');
                    rocEl.innerText = (roc >= 0 ? '↗ +' : '↘ ') + roc + '% ROC';
                    rocEl.className = 'text-xs px-2 py-0.5 rounded font-mono border ' + (roc >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20');

                    let labels = ['Start'], dataPoints = [0], running = 0;
                    if (filteredDeals.length > 0) {
                        filteredDeals.forEach(d => {
                            running += (parseFloat(d.netProfit) || 0);
                            labels.push(new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                            dataPoints.push(parseFloat(running.toFixed(2)));
                        });
                    } else {
                        labels = ['No Data', 'Current']; dataPoints = [0, 0];
                    }

                    renderChart(labels, dataPoints, periodPnl >= 0);
                }

                function renderChart(labels, data, isPositive) {
                    const ctx = document.getElementById('equityChart').getContext('2d');
                    const primaryColor = isPositive ? '#34d399' : '#fb7185';
                    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
                    gradient.addColorStop(0, isPositive ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 113, 133, 0.2)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

                    if (chartInstance) chartInstance.destroy();

                    chartInstance = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{ data: data, borderColor: primaryColor, borderWidth: 2, fill: true, backgroundColor: gradient, tension: 0.2, pointRadius: 0 }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } },
                            scales: {
                                x: { display: false },
                                y: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#52525b', font: { family: 'JetBrains Mono', size: 10 }, callback: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } }
                            }
                        }
                    });
                }

                setTimeframe('ALL');
                setTimeout(() => window.location.reload(), 30000);
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } 
    catch (error) {
        console.error('❌ Dashboard Error:', error);
        res.status(500).send("Error loading dashboard");
    }
});

// UPGRADED WEBHOOK: Handles HOLD signals and Confidence tracking
app.post('/webhook', async (req, res) => {
    const { action, volume = 1000, confidence = 0 } = req.body; 
    
    // Update global state for dashboard
    aiState.lastUpdate = Date.now();
    aiState.action = action.toUpperCase();
    aiState.confidence = parseFloat(confidence).toFixed(1);

    console.log(`\n🚨 AI SIGNAL: ${action} | Confidence: ${aiState.confidence}%`);

    if (action === 'HOLD') {
        aiState.message = 'Market noise detected. Statistical edge too low to execute.';
        return res.status(200).send({ success: true, message: "HOLD status updated on dashboard." });
    }

    try {
        if (currentAsk > 0 && currentBid > 0) {
            const spreadInPoints = currentAsk - currentBid;
            if (spreadInPoints > 50000) {
                aiState.message = 'Signal aborted. Broker spread exceeded safety limits.';
                return res.status(200).send({ success: true, message: "Spread too high." });
            }
        }

        const reconcileRes = await connection.sendCommand('ProtoOAReconcileReq', { ctidTraderAccountId: internalAccountId });
        if ((reconcileRes.position || []).length >= 2) {
            aiState.message = 'Signal aborted. Max open positions reached (2/2).';
            return res.status(200).send({ success: true, message: "Max trades reached." });
        }

        const traderRes = await connection.sendCommand('ProtoOATraderReq', { ctidTraderAccountId: internalAccountId });
        const balanceInDollars = traderRes.trader.balance / 100;
        const riskInDollars = balanceInDollars * 0.10;
        const priceDistance = riskInDollars / (volume / 100); 
        const slPoints = Math.round(priceDistance * 100) * 1000;
        const tpPoints = slPoints * 2;

        await connection.sendCommand('ProtoOANewOrderReq', {
            ctidTraderAccountId: internalAccountId,
            symbolId: goldSymbolId,
            orderType: 'MARKET',
            tradeSide: action, 
            volume: volume,
            relativeStopLoss: slPoints,
            relativeTakeProfit: tpPoints 
        });

        aiState.message = `Successfully executed ${volume/100}oz order on IC Markets.`;
        res.status(200).send({ success: true, message: "Trade Executed" });
    } catch (error) {
        aiState.message = `Broker execution failed: ${error.message}`;
        res.status(500).send({ success: false, error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`✅ Server live on ${PORT}`);
    await startTradingBot();
});

async function startTradingBot() {
    connection = new CTraderConnection({ host: apiHost, port: 5035 });
    try {
        await connection.open();
        await connection.sendCommand('ProtoOAApplicationAuthReq', { clientId, clientSecret });
        const accList = await connection.sendCommand('ProtoOAGetAccountListByAccessTokenReq', { accessToken });
        internalAccountId = accList.ctidTraderAccount[0].ctidTraderAccountId;
        await connection.sendCommand('ProtoOAAccountAuthReq', { ctidTraderAccountId: internalAccountId, accessToken });
        
        const symbols = await connection.sendCommand('ProtoOASymbolsListReq', { ctidTraderAccountId: internalAccountId });
        const gold = symbols.symbol.find(s => s.symbolName === 'XAUUSD' || s.symbolName === 'XAU/USD');
        goldSymbolId = gold ? gold.symbolId : null;

        connection.on('ProtoOASpotEvent', (e) => {
            if (e.symbolId === goldSymbolId) {
                if (e.bid) currentBid = e.bid;
                if (e.ask) currentAsk = e.ask;
            }
        });
        await connection.sendCommand('ProtoOASubscribeSpotsReq', { ctidTraderAccountId: internalAccountId, symbolId: [goldSymbolId] });
        setInterval(() => { if (connection) connection.sendHeartbeat(); }, 25000);
    } catch (error) { console.error('Connection Error:', error); }
}