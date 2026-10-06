const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

// 🚨 CRITICAL: This allows our server to read JSON messages sent by the AI
app.use(express.json());

// ⚠ Keep your active credentials here
const clientId = '37330_gz9zL2bJLnWHZWBUsRkwgCLHGFhYvkt8B90keFDTf4FI7Jo7vB';
const clientSecret = 'zQQMixb51YnRQhcxXCBRRrZcfXaVT9J4baOLvSka6fAHlF6lif';
const accessToken = 'Atx62QmpoEhZ5FoUO7E7rxFxGK2zsjqGRIrxruARw2g';

app.get('/', (req, res) => {
    res.send('cTrader AI Gateway is Live!');
});

app.listen(PORT, async () => {
    console.log(`✅ Web Server listening on port ${PORT}`);
    await startTradingBot();
});

async function startTradingBot() {
    console.log('\nConnecting to cTrader Demo API...');
    
    const connection = new CTraderConnection({
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
        
        const internalAccountId = accountListRes.ctidTraderAccount[0].ctidTraderAccountId;

        await connection.sendCommand('ProtoOAAccountAuthReq', {
            ctidTraderAccountId: internalAccountId,
            accessToken: accessToken,
        });
        console.log(`✅ Trading Account Authorized Successfully!`);

        // 1. Automatically find the ID for Gold (XAUUSD) on this specific broker
        const symbolsRes = await connection.sendCommand('ProtoOASymbolsListReq', {
            ctidTraderAccountId: internalAccountId,
        });
        const goldSymbol = symbolsRes.symbol.find(s => s.symbolName === 'XAUUSD' || s.symbolName === 'XAU/USD');
        const goldSymbolId = goldSymbol ? goldSymbol.symbolId : null;
        
        console.log(`✅ Gold (XAUUSD) Symbol ID found: ${goldSymbolId}`);
        console.log(`📡 Webhook Listener Active. Waiting for AI signals...`);

        // 2. The Webhook Receiver for the AI
        app.post('/webhook', async (req, res) => {
            const { action, volume } = req.body; 
            console.log(`\n🚨 AI SIGNAL RECEIVED: ${action} ${volume} units of Gold`);

            try {
                // 3. Execute the market order
                await connection.sendCommand('ProtoOANewOrderReq', {
                    ctidTraderAccountId: internalAccountId,
                    symbolId: goldSymbolId,
                    orderType: 'MARKET',
                    tradeSide: action, // 'BUY' or 'SELL'
                    volume: volume, 
                });
                
                console.log(`✅ Trade Executed on cTrader!`);
                res.status(200).send({ success: true, message: "Trade Executed" });
            } catch (error) {
                console.error('❌ Execution Failed:', error);
                res.status(500).send({ success: false, error: error });
            }
        });

        setInterval(() => {
            connection.sendHeartbeat();
        }, 25000);

    } catch (error) {
        console.error('❌ cTrader Connection Error:', error);
    }
}