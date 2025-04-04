require('dotenv').config();
const express = require('express');
const jsforce = require('jsforce');
const Faye = require('faye');
const WebSocket = require('ws');
const { exec } = require('child_process');
const os = require('os');

// Cross-platform browser opener
function openBrowser(url) {
  let command;

  switch (os.platform()) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "" "${url}"`;
      break;
    case 'linux': // Linux
      command = `xdg-open "${url}"`;
      break;
    default:
      console.error('❌ Unsupported OS. Open this manually:', url);
      return;
  }

  exec(command, (err) => {
    if (err) {
      console.error('❌ Failed to open browser:', err.message);
    } else {
      console.log('✅ Browser opened successfully!');
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

const conn = new jsforce.Connection({
  oauth2: {
    loginUrl: process.env.SF_LOGIN_URL,
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    redirectUri: process.env.SF_REDIRECT_URI
  }
});

const server = app.listen(PORT, () => {
  const authUrl = conn.oauth2.getAuthorizationUrl({ scope: 'api refresh_token full' });
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('🌐 Opening Salesforce OAuth login...');
  openBrowser(authUrl);
});

const wss = new WebSocket.Server({ server });

// Step 1: OAuth Redirect
app.get('/', (req, res) => {
  const authUrl = conn.oauth2.getAuthorizationUrl({ scope: 'api refresh_token full' });
  res.redirect(authUrl);
});

// Step 2: Callback after Salesforce Login
app.get('/callback', async (req, res) => {
  try {
    await conn.authorize(req.query.code);
    console.log('🔑 Access Token:', conn.accessToken);
    console.log('🌍 Instance URL:', conn.instanceUrl);

    subscribeToCDC(conn);

    res.send('✅ Connected to Salesforce CDC for AccountChangeEvent');
  } catch (err) {
    console.error('❌ OAuth Error:', err);
    res.status(500).send('❌ OAuth Failed');
  }
});

// CDC Subscription Function
function subscribeToCDC(connection) {
  const cometd = new Faye.Client(`${connection.instanceUrl}/cometd/58.0`);
  cometd.disable('websocket');
  cometd.setHeader('Authorization', `OAuth ${connection.accessToken}`);

  cometd.bind('transport:down', () => {
    console.error('🚨 CometD connection DOWN');
  });

  cometd.bind('transport:up', () => {
    console.log('🔗 CometD connection UP');
  });

  const channel = '/data/AccountChangeEvent';
  cometd.subscribe(channel, message => {
    console.log('📥 CDC Event Received:');
    console.dir(message, { depth: null });

    // Send message to all WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }).then(() => {
    console.log(`📡 Subscribed to CDC channel: ${channel}`);
  }).catch(err => {
    console.error('❌ Subscription error:', err);
  });
}

// WebSocket Listener
wss.on('connection', ws => {
  console.log('🟢 WebSocket client connected');
  ws.send(JSON.stringify({
    type: 'info',
    message: 'WebSocket is live! Waiting for CDC events...'
  }));
});
