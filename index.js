

const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠ Replace these with your ACTIVE 'yabgoldbot' credentials
const clientId = '37330_gz9zL2bJLnWHZWBUsRkwgCLHGFhYvkt8B90keFDTf4FI7Jo7vB';
const clientSecret = 'zQQMixb51YnRQhcxXCBRRrZcfXaVT9J4baOLvSka6fAHlF6lif';
const accessToken = 'Atx62QmpoEhZ5FoUO7E7rxFxGK2zsjqGRIrxruARw2g';

// 🚨 TYPE YOUR 7-DIGIT DEMO ACCOUNT NUMBER HERE (No quotes!)
const accountId = 10103694; 

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

        // 1. Authenticate the App
        await connection.sendCommand('ProtoOAApplicationAuthReq', {
            clientId: clientId,
            clientSecret: clientSecret,
        });
        console.log('✅ Application Authenticated!');

        // 2. Authorize the Trading Account directly (Bypassing the buggy library function)
        await connection.sendCommand('ProtoOAAccountAuthReq', {
            ctidTraderAccountId: accountId,
            accessToken: accessToken,
        });
        console.log(`✅ Trading Account [${accountId}] Authorized!`);

        // 3. Keep the connection alive 
        setInterval(() => {
            connection.sendHeartbeat();
        }, 25000);

    } catch (error) {
        console.error('❌ cTrader Connection Error:', error);
    }
}