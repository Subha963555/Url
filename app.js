const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const wss = new WebSocket.Server({ noServer: true });

let clients = [];

wss.on('connection', (ws) => {
    console.log('WebSocket Client Connected');
    clients.push(ws);

    ws.on('close', () => {
        console.log('WebSocket Client Disconnected');
        clients = clients.filter(client => client !== ws);
    });
});

app.post('/notify', (req, res) => {
    const data = req.body;
    console.log('Received from Salesforce:', JSON.stringify(data));

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });

    res.status(200).send({ message: 'Success' });
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});
