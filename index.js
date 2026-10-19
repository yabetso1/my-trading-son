require('dotenv').config();
const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const clientId = process.env.CTRADER_CLIENT_ID;
const clientSecret = process.env.CTRADER_CLIENT_SECRET;
const accessToken = process.env.CTRADER_ACCESS_TOKEN;

const executionHistory = [];
let currentBid = 0;
let currentAsk = 0;
let internalAccountId = null;
let goldSymbolId = null;
let connection = null;

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Interactive Quantitative Dashboard Route
app.get('/dashboard', async (req, res) => {
    try {
        if (!connection || !internalAccountId) {
            return res.send(`
                <body style="background:#0b0e14;color:#94a3b8;font-family:sans-serif;padding:40px;text-align:center;">
                    <h2>Connecting to cTrader API...</h2>
                    <p>The gateway is establishing connection. Refresh in 10 seconds.</p>
                </body>
            `);
        }

        const traderRes = await connection.sendCommand('ProtoOATraderReq', {
            ctidTraderAccountId: internalAccountId,
        });

        const reconcileRes = await connection.sendCommand('ProtoOAReconcileReq', {
            ctidTraderAccountId: internalAccountId,
        });

        let cleanDeals = [];
        try {
            const dealRes = await connection.sendCommand('ProtoOADealListReq', {
                ctidTraderAccountId: internalAccountId,
                fromTimestamp: Date.now() - (90 * 24 * 60 * 60 * 1000),
                toTimestamp: Date.now(),
                maxRows: 1000
            });

            const rawDeals = dealRes.deal || [];
            cleanDeals = rawDeals
                .filter(d => d.closePositionDetail)
                .map(d => ({
                    id: d.dealId,
                    timestamp: Number(d.executionTimestamp || Date.now()),
                    netProfit: ((d.closePositionDetail.netProfit || 0) / 100),
                    tradeSide: d.tradeSide,
                    volume: d.volume
                }))
                .sort((a, b) => a.timestamp - b.timestamp);
        } catch (e) {
            console.log("Deal query note:", e.message || e);
        }

        const balance = (traderRes.trader.balance / 100).toFixed(2);
        const positions = reconcileRes.position || [];

        let unrealizedPnl = 0;
        positions.forEach(p => {
            unrealizedPnl += ((p.grossProfit || 0) / 100);
        });
        const equity = (parseFloat(balance) + unrealizedPnl).toFixed(2);

        const openLongs = positions.filter(p => p.tradeSide === 'BUY' || p.tradeSide === 1).length;
        const openShorts = positions.filter(p => p.tradeSide === 'SELL' || p.tradeSide === 2).length;
        const liveSpread = (currentAsk > 0 && currentBid > 0) ? ((currentAsk - currentBid) / 100000).toFixed(2) : "0.00";

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alpha Trading Terminal | Gold XAUUSD</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; }
                .font-mono { font-family: 'JetBrains Mono', monospace; }
                .glow-green { text-shadow: 0 0 12px rgba(16, 185, 129, 0.4); }
                .glow-card { box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5); }
            </style>
        </head>
        <body class="bg-[#0b0e14] text-gray-200 min-h-screen p-4 lg:p-8">
            <div class="max-w-[1440px] mx-auto space-y-6">

                <header class="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#1e2638] gap-4">
                    <div>
                        <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                            Dashboard
                            <span class="text-xs px-2.5 py-0.5 rounded font-mono font-medium bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20">
                                ● XAU/USD AUTONOMOUS
                            </span>
                        </h1>
                        <p class="text-xs text-gray-500 mt-1">Real-time bot performance and positions</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-xs font-mono text-gray-500 bg-[#121824] px-3 py-1.5 rounded-lg border border-[#1e2638]">
                            Auto-Sync: <span class="text-emerald-400">30s</span>
                        </span>
                        <div class="px-3 py-1.5 rounded-lg bg-[#121824] border border-[#1e2638] text-xs font-mono text-gray-300">
                            Broker: <span class="text-white font-semibold">Pepperstone cTrader</span>
                        </div>
                    </div>
                </header>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div class="lg:col-span-8 bg-[#111622] rounded-xl border border-[#1e2638] p-6 glow-card flex flex-col justify-between">
                        <div>
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                <div>
                                    <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Realized P&L</span>
                                    <div class="flex items-baseline gap-3 mt-1">
                                        <span id="pnlDisplay" class="text-3xl font-mono font-bold text-[#10b981] glow-green">$0.00</span>
                                        <span id="rocDisplay" class="text-xs px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            +0.0% ROC
                                        </span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-lg border border-[#1e2638]">
                                    <button onclick="setTimeframe('1D')" id="btn-1D" class="tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white transition-all">Day</button>
                                    <button onclick="setTimeframe('1W')" id="btn-1W" class="tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white transition-all">Week</button>
                                    <button onclick="setTimeframe('1M')" id="btn-1M" class="tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white transition-all">Month</button>
                                    <button onclick="setTimeframe('ALL')" id="btn-ALL" class="tf-btn px-3 py-1 rounded text-xs font-mono text-emerald-400 font-bold bg-[#1a2133] border border-[#2a344d] transition-all">All</button>
                                </div>
                            </div>
                            <div class="h-64 w-full relative">
                                <canvas id="equityChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-4 bg-[#111622] rounded-xl border border-[#1e2638] p-6 glow-card flex flex-col justify-between space-y-6">
                        <div>
                            <div class="flex items-center justify-between border-b border-[#1e2638] pb-3">
                                <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Account Status</span>
                                <span class="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">ONLINE</span>
                            </div>
                            <div class="mt-5 space-y-4">
                                <div class="flex justify-between items-end">
                                    <div>
                                        <span class="text-xs text-gray-500 uppercase">Balance</span>
                                        <div class="text-3xl font-mono font-bold text-white mt-0.5">$${balance}</div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs text-gray-500 uppercase">Equity</span>
                                        <div class="text-2xl font-mono font-semibold ${parseFloat(equity) >= parseFloat(balance) ? 'text-emerald-400' : 'text-rose-400'} mt-0.5">$${equity}</div>
                                    </div>
                                </div>
                                <div class="space-y-1.5 pt-2">
                                    <div class="flex justify-between text-xs font-mono">
                                        <span class="text-gray-400">Active Positions</span>
                                        <span class="text-gray-200">${positions.length} / 2 MAX</span>
                                    </div>
                                    <div class="w-full bg-[#1c2436] rounded-full h-2 flex overflow-hidden">
                                        <div class="bg-emerald-500 h-2" style="width: ${positions.length > 0 ? (openLongs / positions.length) * 100 : 0}%"></div>
                                        <div class="bg-rose-500 h-2" style="width: ${positions.length > 0 ? (openShorts / positions.length) * 100 : 0}%"></div>
                                    </div>
                                    <div class="flex justify-between text-[11px] font-mono text-gray-500 pt-1">
                                        <span class="text-emerald-400">● Longs: ${openLongs}</span>
                                        <span class="text-rose-400">● Shorts: ${openShorts}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-[#0b0e14] p-4 rounded-lg border border-[#1e2638] space-y-2 text-xs font-mono">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Live Gold Spread</span>
                                <span class="text-white">$${liveSpread}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Per-Trade Risk</span>
                                <span class="text-amber-400">10.0% ($${(balance * 0.10).toFixed(2)})</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Target Risk/Reward</span>
                                <span class="text-emerald-400">1 : 2</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-[#111622] rounded-xl border border-[#1e2638] p-5 glow-card">
                    <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Highlights (<span id="highlightLabel">All Time</span>)</div>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 divide-y md:divide-y-0 md:divide-x divide-[#1e2638]">
                        <div class="px-2 pt-2 md:pt-0"><span class="text-[11px] text-gray-500 uppercase">Win Rate</span><p id="winrateDisplay" class="text-xl font-mono font-bold text-emerald-400 mt-1">0.0%</p></div>
                        <div class="px-2 pt-2 md:pt-0"><span class="text-[11px] text-gray-500 uppercase">Closed Trades</span><p id="totalTradesDisplay" class="text-xl font-mono font-bold text-white mt-1">0</p></div>
                        <div class="px-2 pt-2 md:pt-0"><span class="text-[11px] text-gray-500 uppercase">Avg Win</span><p id="avgWinDisplay" class="text-xl font-mono font-bold text-emerald-400 mt-1">+$0.00</p></div>
                        <div class="px-2 pt-2 md:pt-0"><span class="text-[11px] text-gray-500 uppercase">Avg Loss</span><p id="avgLossDisplay" class="text-xl font-mono font-bold text-rose-400 mt-1">-$0.00</p></div>
                        <div class="px-2 pt-2 md:pt-0"><span class="text-[11px] text-gray-500 uppercase">Profit Factor</span><p id="pfDisplay" class="text-xl font-mono font-bold text-emerald-400 mt-1">0.00</p></div>
                    </div>
                </div>

                <div class="bg-[#111622] rounded-xl border border-[#1e2638] overflow-hidden glow-card">
                    <div class="p-4 border-b border-[#1e2638] flex items-center justify-between">
                        <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-300">Active cTrader Positions</h3>
                        <span class="text-xs font-mono text-gray-500">${positions.length} open</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="bg-[#0b0e14] text-gray-500 uppercase border-b border-[#1e2638]">
                                <tr>
                                    <th class="p-3.5">ID</th>
                                    <th class="p-3.5">Side</th>
                                    <th class="p-3.5">Volume</th>
                                    <th class="p-3.5">Entry Price</th>
                                    <th class="p-3.5">Stop Loss</th>
                                    <th class="p-3.5">Take Profit</th>
                                    <th class="p-3.5">Gross P&L</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-[#1e2638] text-gray-300">
                                ${positions.length === 0 ? `
                                    <tr><td colspan="7" class="p-6 text-center text-gray-500">No active positions open.</td></tr>
                                ` : positions.map(p => `
                                    <tr class="hover:bg-[#161c2b] transition-colors">
                                        <td class="p-3.5 text-gray-400">#${p.positionId}</td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded text-[11px] font-bold ${p.tradeSide === 'BUY' || p.tradeSide === 1 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                                                ${p.tradeSide === 1 || p.tradeSide === 'BUY' ? 'BUY' : 'SELL'}
                                            </span>
                                        </td>
                                        <td class="p-3.5">${(p.volume / 100).toFixed(2)} oz</td> <td class="p-3.5 text-white">$${(p.price || 0).toFixed(2)}</td>
                                        <td class="p-3.5 text-rose-400">${p.stopLoss ? '$' + p.stopLoss.toFixed(2) : 'Dynamic'}</td>
                                        <td class="p-3.5 text-emerald-400">${p.takeProfit ? '$' + p.takeProfit.toFixed(2) : 'Dynamic'}</td>
                                        <td class="p-3.5 font-bold ${(p.grossProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                                            ${(p.grossProfit || 0) >= 0 ? '+$' + ((p.grossProfit || 0)/100).toFixed(2) : '-$' + Math.abs((p.grossProfit || 0)/100).toFixed(2)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-[#111622] rounded-xl border border-[#1e2638] overflow-hidden glow-card">
                    <div class="p-4 border-b border-[#1e2638] flex items-center justify-between">
                        <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-300">Recent Webhook Executions</h3>
                        <span class="text-xs font-mono text-gray-500">${executionHistory.length} logged</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="bg-[#0b0e14] text-gray-500 uppercase border-b border-[#1e2638]">
                                <tr>
                                    <th class="p-3.5">Time</th>
                                    <th class="p-3.5">Signal</th>
                                    <th class="p-3.5">Volume</th>
                                    <th class="p-3.5">SL Points</th>
                                    <th class="p-3.5">TP Points</th>
                                    <th class="p-3.5">Balance At Order</th>
                                    <th class="p-3.5">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-[#1e2638] text-gray-300">
                                ${executionHistory.length === 0 ? `
                                    <tr><td colspan="7" class="p-6 text-center text-gray-500">Awaiting AI signal from GitHub Actions scheduler.</td></tr>
                                ` : executionHistory.map(item => `
                                    <tr class="hover:bg-[#161c2b] transition-colors">
                                        <td class="p-3.5 text-gray-400">${item.timestamp}</td>
                                        <td class="p-3.5 font-bold ${item.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}">${item.action}</td>
                                        <td class="p-3.5">${item.volume}</td>
                                        <td class="p-3.5 text-gray-400">${item.slPoints} pts</td>
                                        <td class="p-3.5 text-gray-400">${item.tpPoints} pts</td> <td class="p-3.5 text-white">$${item.balanceAtTrade}</td>
                                        <td class="p-3.5"><span class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">SUCCESS</span></td>
                                    </tr>
                                `).join('')}
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
                    document.querySelectorAll('.tf-btn').forEach(btn => {
                        btn.className = 'tf-btn px-3 py-1 rounded text-xs font-mono text-gray-400 hover:text-white transition-all';
                    });
                    const activeBtn = document.getElementById('btn-' + tf);
                    if (activeBtn) {
                        activeBtn.className = 'tf-btn px-3 py-1 rounded text-xs font-mono text-emerald-400 font-bold bg-[#1a2133] border border-[#2a344d] transition-all';
                    }

                    const now = Date.now();
                    let cutoff = 0;
                    let tfLabel = 'All Time';

                    if (tf === '1D') {
                        cutoff = now - (24 * 60 * 60 * 1000);
                        tfLabel = 'Last 24 Hours';
                    } else if (tf === '1W') {
                        cutoff = now - (7 * 24 * 60 * 60 * 1000);
                        tfLabel = 'Last 7 Days';
                    } else if (tf === '1M') {
                        cutoff = now - (30 * 24 * 60 * 60 * 1000);
                        tfLabel = 'Last 30 Days';
                    }

                    document.getElementById('highlightLabel').innerText = tfLabel;
                    const filteredDeals = allDeals.filter(d => d.timestamp >= cutoff);

                    let periodPnl = 0;
                    let wins = 0;
                    let losses = 0;
                    let winSum = 0;
                    let lossSum = 0;

                    filteredDeals.forEach(d => {
                        periodPnl += d.netProfit;
                        if (d.netProfit > 0) {
                            wins++;
                            winSum += d.netProfit;
                        } else if (d.netProfit < 0) {
                            losses++;
                            lossSum += Math.abs(d.netProfit);
                        }
                    });

                    const totalClosed = wins + losses;
                    const winRate = totalClosed > 0 ? ((wins / totalClosed) * 100).toFixed(1) : "0.0";
                    const avgWin = wins > 0 ? (winSum / wins).toFixed(2) : "0.00";
                    const avgLoss = losses > 0 ? (lossSum / losses).toFixed(2) : "0.00";
                    const profitFactor = lossSum > 0 ? (winSum / lossSum).toFixed(2) : (winSum > 0 ? "MAX" : "0.00");
                    const roc = currentBalance > 0 ? ((periodPnl / currentBalance) * 100).toFixed(1) : "0.0";

                    const pnlEl = document.getElementById('pnlDisplay');
                    pnlEl.innerText = (periodPnl >= 0 ? '+$' : '-$') + Math.abs(periodPnl).toFixed(2);
                    pnlEl.className = 'text-3xl font-mono font-bold ' + (periodPnl >= 0 ? 'text-[#10b981] glow-green' : 'text-rose-500');

                    const rocEl = document.getElementById('rocDisplay');
                    rocEl.innerText = (roc >= 0 ? '↗ +' : '↘ ') + roc + '% ROC';
                    rocEl.className = 'text-xs px-2 py-0.5 rounded font-mono ' + (roc >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20');

                    document.getElementById('winrateDisplay').innerText = winRate + '%';
                    document.getElementById('totalTradesDisplay').innerText = totalClosed;
                    document.getElementById('avgWinDisplay').innerText = '+$' + avgWin;
                    document.getElementById('avgLossDisplay').innerText = '-$' + avgLoss;
                    document.getElementById('pfDisplay').innerText = profitFactor;

                    let labels = [];
                    let dataPoints = [];

                    if (filteredDeals.length === 0) {
                        labels = [tf === '1D' ? '24h Ago' : (tf === '1W' ? '7d Ago' : (tf === '1M' ? '30d Ago' : 'Start')), 'Current'];
                        dataPoints = [0, 0];
                    } else {
                        labels = ['Start'];
                        dataPoints = [0];
                        let running = 0;
                        filteredDeals.forEach(d => {
                            running += d.netProfit;
                            const dateObj = new Date(d.timestamp);
                            const timeStr = tf === '1D' 
                                ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                            labels.push(timeStr);
                            dataPoints.push(parseFloat(running.toFixed(2)));
                        });
                    }

                    renderChart(labels, dataPoints, periodPnl >= 0);
                }

                function renderChart(labels, data, isPositive) {
                    const ctx = document.getElementById('equityChart').getContext('2d');
                    const primaryColor = isPositive ? '#10b981' : '#f43f5e';
                    
                    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
                    gradient.addColorStop(0, isPositive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

                    if (chartInstance) {
                        chartInstance.destroy();
                    }

                    chartInstance = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: data,
                                borderColor: primaryColor,
                                borderWidth: 2,
                                fill: true,
                                backgroundColor: gradient,
                                tension: 0.3,
                                pointRadius: data.length > 20 ? 1 : 3,
                                pointBackgroundColor: primaryColor
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: {
                                    grid: { color: 'rgba(255,255,255,0.03)' },
                                    ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } }
                                },
                                y: {
                                    grid: { color: 'rgba(255,255,255,0.05)' },
                                    ticks: {
                                        color: '#6b7280',
                                        font: { family: 'JetBrains Mono', size: 10 },
                                        callback: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2)
                                    }
                                }
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
    } catch (error) {
        console.error('❌ Dashboard Error:', error);
        res.status(500).send("Error loading dashboard: " + error.message);
    }
});

// Webhook Receiver
app.post('/webhook', async (req, res) => {
    const { action, volume = 200 } = req.body; 
    console.log(`\n🚨 AI SIGNAL RECEIVED: ${action} ${volume} units of Gold`);

    try {
        if (currentAsk > 0 && currentBid > 0) {
            const spreadInPoints = currentAsk - currentBid;
            const MAX_SPREAD_POINTS = 50000;
            const actualSpread = (spreadInPoints / 100000).toFixed(2);

            if (spreadInPoints > MAX_SPREAD_POINTS) {
                console.log(`🛑 SPREAD TRIPPED: Spread is $${actualSpread}. Aborting order.`);
                return res.status(200).send({ success: true, message: "Spread too high, ignored." });
            }
            console.log(`✅ Spread Check Passed: $${actualSpread}`);
        }

        const reconcileRes = await connection.sendCommand('ProtoOAReconcileReq', {
            ctidTraderAccountId: internalAccountId,
        });
        const openPositions = reconcileRes.position || [];
        const MAX_TRADES = 2;

        if (openPositions.length >= MAX_TRADES) {
            console.log(`🛑 EXPOSURE CAP REACHED: ${openPositions.length} active trades. Ignoring signal.`);
            return res.status(200).send({ success: true, message: "Max trades reached, ignored." });
        }

        const traderRes = await connection.sendCommand('ProtoOATraderReq', {
            ctidTraderAccountId: internalAccountId,
        });
        
        const balanceInDollars = traderRes.trader.balance / 100;
        const RISK_PERCENTAGE = 0.10; 
        const riskInDollars = balanceInDollars * RISK_PERCENTAGE;

        const slPoints = 2000;
        const tpPoints = 4000;

        console.log(`💰 Live Balance: $${balanceInDollars.toFixed(2)} | Risking $${riskInDollars.toFixed(2)}`);
        console.log(`📏 Setting SL: ${slPoints} pts, TP: ${tpPoints} pts`);

        await connection.sendCommand('ProtoOANewOrderReq', {
            ctidTraderAccountId: internalAccountId,
            symbolId: goldSymbolId,
            orderType: 'MARKET',
            tradeSide: action, 
            volume: volume,
            relativeStopLoss: slPoints,
            relativeTakeProfit: tpPoints 
        });

        executionHistory.unshift({
            id: Date.now().toString().slice(-6),
            timestamp: new Date().toLocaleTimeString(),
            date: new Date().toLocaleDateString(),
            symbol: 'XAU/USD',
            action: action,
            volume: (volume / 100).toFixed(2) + ' oz',
            slPoints: slPoints,
            tpPoints: tpPoints,
            status: 'EXECUTED',
            balanceAtTrade: balanceInDollars.toFixed(2)
        });

        res.status(200).send({ success: true, message: "Trade Executed with Risk Parameters" });
    } catch (error) {
        console.error('❌ Execution Failed:', error);
        res.status(500).send({ success: false, error: error.message || error });
    }
});

app.listen(PORT, async () => {
    console.log(`✅ Web Server listening on port ${PORT}`);
    await startTradingBot();
});

async function startTradingBot() {
    console.log('\nConnecting to cTrader Demo API...');
    
    connection = new CTraderConnection({
        host: 'demo.ctraderapi.com',
        port: 5035,
    });

    try {
        await connection.open();
        console.log('✅ TCP Connection established!');

        await connection.sendCommand('ProtoOAApplicationAuthReq', {
            clientId: clientId,
            clientSecret: clientSecret,
        });

        const accountListRes = await connection.sendCommand('ProtoOAGetAccountListByAccessTokenReq', {
            accessToken: accessToken
        });
        internalAccountId = accountListRes.ctidTraderAccount[0].ctidTraderAccountId;

        await connection.sendCommand('ProtoOAAccountAuthReq', {
            ctidTraderAccountId: internalAccountId,
            accessToken: accessToken,
        });
        console.log(`✅ Trading Account [${internalAccountId}] Authorized!`);

        const symbolsRes = await connection.sendCommand('ProtoOASymbolsListReq', {
            ctidTraderAccountId: internalAccountId,
        });
        const goldSymbol = symbolsRes.symbol.find(s => s.symbolName === 'XAUUSD' || s.symbolName === 'XAU/USD');
        goldSymbolId = goldSymbol ? goldSymbol.symbolId : null;
        console.log(`✅ Gold Symbol ID found: ${goldSymbolId}`);

        connection.on('ProtoOASpotEvent', (event) => {
            if (event.symbolId === goldSymbolId) {
                if (event.bid) currentBid = event.bid;
                if (event.ask) currentAsk = event.ask;
            }
        });

        await connection.sendCommand('ProtoOASubscribeSpotsReq', {
            ctidTraderAccountId: internalAccountId,
            symbolId: [goldSymbolId]
        });
        console.log(`✅ Spread Filter Active. Monitoring live market prices.`);
        console.log(`📡 Dashboard & Webhook Active!`);

        setInterval(() => {
            if (connection) connection.sendHeartbeat();
        }, 25000);

    } catch (error) {
        console.error('❌ cTrader Connection Error:', error);
    }
}