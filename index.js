const WebSocket = require('ws');

const app_id = '34A2FBJ96ftdZ3NlbpMAC'; 
const api_token = 'pat_04f42f3ef352e734ab0366a1cb4818dfceced7811c7886c68506ac3912a3ed31'; 

// An array of Deriv's official backup API clusters
const derivServers = [
    'ws.binaryws.com',
    'ws.derivws.com',
    'frontend.binaryws.com',
    'blue.binaryws.com'
];

let currentServerIndex = 0;

function connectToDeriv() {
    const serverURL = derivServers[currentServerIndex];
    console.log(`\nAttempting to connect to Deriv via: ${serverURL}...`);

    const ws = new WebSocket(`wss://${serverURL}/websockets/v3?app_id=${app_id}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    });

    ws.on('open', () => {
        console.log(`✅ Successfully connected to ${serverURL}!`);
        console.log('Sending login token...');
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
        
        // If it fails (like a 520 error), automatically try the next server
        currentServerIndex++;
        if (currentServerIndex < derivServers.length) {
            console.log('Switching to backup server in 2 seconds...');
            setTimeout(connectToDeriv, 2000); // Wait 2 seconds, then try again
        } else {
            console.error('🚨 ALL Deriv servers are currently rejecting connections. The Deriv API may be temporarily down.');
        }
    });

    ws.on('close', () => {
        console.log('Connection closed.');
    });
}

// Start the connection process
connectToDeriv();