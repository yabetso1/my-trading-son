

const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠ Replace these with your ACTIVE 'yabgoldbot' credentials
const clientId = '37330_gz9zL2bJLnWHZWBUsRkwgCLHGFhYvkt8B90keFDTf4FI7Jo7vB';
const clientSecret = 'zQQMixb51YnRQhcxXCBRRrZcfXaVT9J4baOLvSka6fAHlF6lif';
const accessToken = 'Atx62QmpoEhZ5FoUO7E7rxFxGK2zsjqGRIrxruARw2g';

const express = require('express');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠ Replace these with your ACTIVE 'yabgoldbot' credentials
const clientId = '37330_gz9zL2bJLnWHZWBUsRkwgCLHGFhYvkt8B90keFDTf4FI7Jo7vB';
const clientSecret = 'YOUR_CLIENT_SECRET';
const accessToken = 'YOUR_ACCESS_TOKEN';

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

        // 2. Ask the TCP server for your hidden internal cTID Account ID
        const accountListRes = await connection.sendCommand('ProtoOAGetAccountListByAccessTokenReq', {
            accessToken: accessToken
        });
        
        // Extract the hidden ID from the server's response
        const internalAccountId = accountListRes.ctidTraderAccount[0].ctidTraderAccountId;
        console.log(`✅ Discovered internal cTID Account ID: ${internalAccountId}`);

        // 3. Authorize the Trading Account using the correct internal ID
        await connection.sendCommand('ProtoOAAccountAuthReq', {
            ctidTraderAccountId: internalAccountId,
            accessToken: accessToken,
        });
        console.log(`✅ Trading Account Authorized Successfully!`);

        // 4. Keep the connection alive 
        setInterval(() => {
            connection.sendHeartbeat();
        }, 25000);

    } catch (error) {
        console.error('❌ cTrader Connection Error:', error);
    }
}