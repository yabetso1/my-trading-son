const express = require('express');
const WebSocket = require('ws');

const app = express();
// Render automatically provides the PORT environment variable
const PORT = process.env.PORT || 3000; 

// ⚠️ Replace this with your actual Deriv API Token!
// You can also change the app_id back to your personal one if you want.
const app_id = '34A2FBJ96ftdZ3NlbpMAC'; 
const api_token = 'pat_04f42f3ef352e734ab0366a1cb4818dfceced7811c7886c68506ac3912a3ed31'; 

// Deriv's primary and backup server clusters
const derivServers = [
    'ws.derivws.com',
    'ws.binaryws.com',
    'frontend.binaryws.com'
];
let currentServerIndex = 0;

// 1. Start the web server (Keeps Render from crashing the app)
app.get('/', (req, res) => {
    res.send('AI Trading Bot Execution Gateway is Live!');
});

app.listen(PORT, () => {
    console.log(`✅ Express Web Server listening on port ${PORT}`);
    // 2. Only attempt to connect to Deriv AFTER the server is successfully running
    connectToDeriv();
});

// 3. The Clean WebSocket Connection Logic
function connectToDeriv() {
    const serverURL = derivServers[currentServerIndex];
    console.log(`\nAttempting clean server-to-server connection via: ${serverURL}...`);

    // NO HEADERS. We are proudly connecting as a backend server.
    const ws = new WebSocket(`wss://${serverURL}/websockets/v3?app_id=${app_id}`);

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
        console.error(`❌ Connection failed on ${serverURL}: ${err.message}`);
        currentServerIndex++;
        
        if (currentServerIndex < derivServers.length) {
            console.log('Switching to backup server in 2 seconds...');
            setTimeout(connectToDeriv, 2000);
        } else {
            console.error('🚨 All servers rejected connection. The API may be temporarily down.');
            // Reset to try the primary server again later if needed
            currentServerIndex = 0; 
        }
    });

    ws.on('close', () => {
        console.log('Connection closed by server.');
    });
}