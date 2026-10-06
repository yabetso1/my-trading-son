const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️️ Replace these with the credentials from your ACTIVE 'yabgoldbot' application
const clientId = '37330_gz9zL2bJLnWHZWBUsRkwgCLHGFhYvkt8B90keFDTf4FI7Jo7vB';
const clientSecret = 'zQQMixb51YnRQhcxXCBRRrZcfXaVT9J4baOLvSka6fAHlF6lif';
const accessToken = 'z14TM0PJWdkEF29DcGC80QJjyd1WixL2-WdyOzr7By0';

app.get('/', (req, res) => {
    res.send('cTrader AI Gateway is Live!');
});

app.listen(PORT, async () => {
    console.log(`✅ Web Server listening on port ${PORT}`);
    await startTradingBot();
});

async function startTradingBot() {
    console.log('\nConnecting to cTrader Demo API...');
    
    // Connect to the cTrader Demo Server
    const connection = new CTraderConnection({
        host: 'demo.ctraderapi.com',
        port: 5035,
    });

    try {
        await connection.open();
        console.log('✅ TCP Connection established!');

        // 1. Authenticate the App itself
        await connection.sendCommand('ProtoOAApplicationAuthReq', {
            clientId: clientId,
            clientSecret: clientSecret,
        });
        console.log('✅ Application Authenticated!');

        // 2. Authorize the specific Trading Account using the token
        // First, we need to get the Account ID tied to the token
        const accountRes = await CTraderConnection.getAccessTokenAccounts(accessToken, 'demo.ctraderapi.com');
        const ctidTraderAccountId = accountRes[0].ctidTraderAccountId;

        await connection.sendCommand('ProtoOAAccountAuthReq', {
            ctidTraderAccountId,
            accessToken,
        });
        console.log(`✅ Trading Account [${ctidTraderAccountId}] Authorized!`);

        // 3. Keep the connection alive 
        setInterval(() => {
            connection.sendHeartbeat();
        }, 25000);

    } catch (error) {
        console.error('❌ cTrader Connection Error:', error);
    }
}