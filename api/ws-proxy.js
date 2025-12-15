// WebSocket proxy info endpoint
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const wsServerUrl = process.env.WS_SERVER_URL || 'wss://bb-scalper-ws.onrender.com';
  
  res.status(200).json({
    service: 'WebSocket Proxy Information',
    status: 'active',
    websocket_server: wsServerUrl,
    protocol: 'Socket.IO',
    supported_events: [
      'connect',
      'price_update',
      'subscribe',
      'unsubscribe',
      'timeframe_change'
    ],
    instructions: [
      '1. Connect to the WebSocket server URL above',
      '2. Send subscribe event with symbol and timeframe',
      '3. Receive real-time price updates',
      '4. Handle disconnect/reconnect automatically'
    ],
    example_connection: `const socket = io("${wsServerUrl}");`,
    example_subscribe: `socket.emit('subscribe', { symbol: 'XAUUSD', timeframe: '1m' });`,
    timestamp: new Date().toISOString()
  });
}