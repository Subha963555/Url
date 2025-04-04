require('dotenv').config();
const express = require('express');
const jsforce = require('jsforce');
const Faye = require('faye');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Start Express HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

const conn = new jsforce.Connection({
  oauth2: {
    loginUrl: process.env.SF_LOGIN_URL,
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    redirectUri: process.env.SF_REDIRECT_URI
  }
});

// Step 1: Start OAuth login
app.get('/', (req, res) => {
  const authUrl = conn.oauth2.getAuthorizationUrl({ scope: 'api refresh_token full' });
  res.redirect(authUrl);
});

// Step 2: OAuth callback from Salesforce
app.get('/callback', async (req, res) => {
  try {
    await conn.authorize(req.query.code);
    console.log('🔑 Access Token:', conn.accessToken);
    console.log('🌍 Instance URL:', conn.instanceUrl);

    subscribeToCDC(conn);
    res.send('✅ Connected to Salesforce CDC for AccountChangeEvent');
  } catch (err) {
    console.error('❌ OAuth Error:', err);
    res.status(500).send('OAuth Failed');
  }
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('🟢 WebSocket client connected');
  ws.send(JSON.stringify({ type: 'status', message: '✅ WebSocket is live! Waiting for CDC events...' }));

  ws.on('close', () => {
    console.log('🔴 WebSocket disconnected');
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err);
  });
});

// Subscribe to Change Data Capture events
function subscribeToCDC(connection) {
  const cometd = new Faye.Client(`${connection.instanceUrl}/cometd/58.0`);
  cometd.disable('websocket');
  cometd.setHeader('Authorization', `OAuth ${connection.accessToken}`);

  cometd.bind('transport:down', () => console.error('🚨 CometD DOWN'));
  cometd.bind('transport:up', () => console.log('🔗 CometD UP'));

  const channel = '/data/AccountChangeEvent';
  cometd.subscribe(channel, async (message) => {
    console.log('📥 CDC Event Received:');
    console.dir(message, { depth: null });

    const recordId = message?.payload?.ChangeEventHeader?.recordIds?.[0];

    if (recordId) {
      try {
        const record = await connection.sobject('Account').retrieve(recordId);
        console.log('✅ Full Account Data:', record);

        const payload = {
          type: 'AccountUpdate',
          data: record
        };

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });
      } catch (err) {
        console.error('❌ Error fetching Account:', err);
      }
    }
  }).then(() => {
    console.log(`📡 Subscribed to CDC channel: ${channel}`);
  }).catch(err => {
    console.error('❌ Subscription error:', err);
  });
}
