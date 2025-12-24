import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  
  const client = await MongoClient.connect(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 5000,
  });
  
  cachedClient = client;
  cachedDb = client.db('trading_monitor');
  
  return { client, db: cachedDb };
}

export default async function handler(req, res) {
  // Set headers immediately
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Get symbol from query (optional)
    const symbol = req.query.symbol || null;
    
    let query = {};
    if (symbol && symbol !== 'ALL') {
      query = { symbol: symbol };
    }
    
    // Get latest trade with timeout
    const latest = await collection
      .findOne(query, { 
        sort: { updated_at: -1 },
        maxTimeMS: 3000 
      });
    
    if (!latest) {
      return res.status(200).json({
        status: 'no_data',
        message: 'No trades found in database',
        latest: null,
        timestamp: Math.floor(Date.now() / 1000)
      });
    }
    
    // Get recent trades (limit 10)
    const trades = await collection
      .find(query)
      .sort({ updated_at: -1 })
      .limit(10)
      .maxTimeMS(3000)
      .toArray();
    
    return res.status(200).json({
      status: 'success',
      count: trades.length,
      latest: latest,
      trades: trades,
      timestamp: Math.floor(Date.now() / 1000)
    });
    
  } catch (error) {
    console.error('GET API Error:', error);
    
    // Return mock data if MongoDB fails
    return res.status(200).json({
      status: 'error',
      message: error.message,
      latest: {
        symbol: 'BTCUSD',
        equity: 0,
        balance: 0,
        profit: 0,
        open_trades: 0,
        ml_confidence: 0,
        ml_trained: 0,
        current_price: 0,
        trades: []
      },
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}
