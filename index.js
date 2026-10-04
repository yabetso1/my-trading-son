const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000; 

// 🚨 CRITICAL: You MUST use your personal App ID (the numbers you generated).
// Cloudflare aggressively blocks the public '1089' ID from cloud servers.
const app_id = '34A2FBJ96ftdZ3NlbpMAC'; 
const api_token = 'pat_04f42f3ef352e734ab0366a1cb4818dfceced7811c7886c68506ac3912a3ed31'; 

app.get('/', (req, res) => {
    res.send('AI Trading Bot Execution Gateway is Live!');
});

app.listen(PORT, () => {
    console.log(`✅ Express Web Server listening on port ${PORT}`);
    connectToDeriv();
});

function connectToDeriv() {
    // We add the exact language and brand parameters Deriv's internal systems expect
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${app_id}&l=EN&brand=deriv`;
    console.log(`\nConnecting to Deriv API...`);

    const ws = new WebSocket(url, {
        headers: {
            // Tell Cloudflare exactly what we are: a Node API client, not a fake browser.
            'User-Agent': 'Deriv-NodeJS-API-Client',
            // Deriv's backend expects this origin for API developer connections.
            'Origin': 'https://developers.deriv.com'
        }
    });

    ws.on('open', () => {
        console.log(`✅ Connected successfully! Sending login token...`);
        ws.send(JSON.stringify({ authorize: api_token }));
    });

    ws.on('message', (data) => {
        const response = JSON.parse(data);
        
        if (response.error) {
            console.error('❌ API Error:', response.error.message);
        } else if (response.msg_type === 'authorize') {
            console.log('✅ Login Successful!');
            console.log(`💰 Demo Balance: ${response.authorize.balance} ${response.authorize.currency}`);
        }
    });

    ws.on('error', (err) => {
        console.error(`❌ Connection failed: ${err.message}`);
    });

    ws.on('close', () => {
        console.log('Connection closed by server.');
    });
}