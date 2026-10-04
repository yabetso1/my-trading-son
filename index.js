const express = require('express');
const WebSocket = require('ws');

const app = express();
// Render automatically provides the PORT environment variable
const PORT = process.env.PORT || 3000; 

const app_id = '34A2FBJ96ftdZ3NlbpMAC'; // You can change this back to your App ID once it connects
const api_token = 'pat_04f42f3ef352e734ab0366a1cb4818dfceced7811c7886c68506ac3912a3ed31'; 

const derivServers = [
    'ws.binaryws.com',
    'ws.derivws.com',
    'frontend.binaryws.com'
];
let currentServerIndex = 0;

// 1. Start the web server (This stops Render from killing the app)
app.get('/', (req, res) => {
    res.send('AI Trading Bot Execution Gateway is Live!');
});

app.listen(PORT, () => {
    console.log(`✅ Express Web Server listening on port ${PORT}`);
    // 2. Only attempt to connect to Deriv AFTER the server is successfully running
    connectToDeriv();
});

// 3. The WebSocket Connection Logic
function connectToDeriv() {
    const serverURL = derivServers[currentServerIndex];
    console.log(`Attempting to connect to Deriv via: ${serverURL}...`);

    const ws = new WebSocket(`wss://${serverURL}/websockets/v3?app_id=${app_id}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://app.deriv.com' // 🚨 CRITICAL: This fixes the 520 Cloudflare Error
        }
    });

    ws.on('open', () => {
        console.log(`✅ Connected to ${serverURL}! Sending login token...`);
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
        currentServerIndex++;
        
        if (currentServerIndex < derivServers.length) {
            console.log('Switching to backup server in 2 seconds...');
            setTimeout(connectToDeriv, 2000);
        } else {
            console.error('🚨 All servers rejected connection.');
        }
    });

    ws.on('close', () => {
        console.log('Connection closed by server.');
    });
}