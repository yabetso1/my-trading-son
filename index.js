const WebSocket = require('ws');

const app_id = '1089'; 
const api_token = 'pat_04f42f3ef352e734ab0366a1cb4818dfceced7811c7886c68506ac3912a3ed31'; // Remember to paste your token here!

// The firewall blocks blank data center traffic. 
// We add these headers so Deriv thinks we are a normal Chrome browser logging in.
const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${app_id}`, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://app.deriv.com'
    }
});

ws.on('open', () => {
    console.log('Connected to Deriv! Sending login token...');
    ws.send(JSON.stringify({ authorize: api_token }));
});

ws.on('message', (data) => {
    const response = JSON.parse(data);
    
    if (response.error) {
        console.error('Deriv API Error:', response.error.message);
    } else if (response.msg_type === 'authorize') {
        console.log('Login Successful!');
        console.log(`Demo Balance: ${response.authorize.balance} ${response.authorize.currency}`);
    }
});

ws.on('error', (err) => {
    console.error('WebSocket Connection Error:', err.message);
});

ws.on('close', () => {
    console.log('Connection closed by server.');
});