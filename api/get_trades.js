import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const client = await connectToDatabase();
    const db = client.db('trading_monitor');
    const collection = db.collection('trades');
    
    // Get symbol from query parameter (optional)
    const symbol = req.query.symbol || null;
    
    let query = {};
    if (symbol) {
      query = { symbol: symbol };
    }
    
    // Get all trades or specific symbol
    const trades = await collection
      .find(query)
      .sort({ updated_at: -1 })
      .limit(10)
      .toArray();
    
    // Get latest trade for dashboard
    const latest = trades.length > 0 ? trades[0] : null;
    
    return res.status(200).json({
      status: 'success',
      count: trades.length,
      latest: latest,
      trades: trades,
      timestamp: Math.floor(Date.now() / 1000)
    });
    
  } catch (error) {
    console.error('GET API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
