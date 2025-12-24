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
  });
  
  cachedClient = client;
  cachedDb = client.db('trading_monitor');
  
  return { client, db: cachedDb };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests'
    });
  }
  
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    const symbol = req.query.symbol || null;
    
    let query = {};
    if (symbol && symbol !== 'ALL') {
      query = { symbol: symbol };
    }
    
    // Get latest trade
    const latest = await collection
      .findOne(query, { 
        sort: { updated_at: -1 }
      });
    
    if (!latest) {
      return res.status(200).json({
        status: 'no_data',
        message: 'No trades found. EA may not have sent data yet.',
        latest: null,
        trades: [],
        count: 0,
        timestamp: Math.floor(Date.now() / 1000)
      });
    }
    
    // Get recent trades
    const trades = await collection
      .find(query)
      .sort({ updated_at: -1 })
      .limit(10)
      .toArray();
    
    return res.status(200).json({
      status: 'success',
      count: trades.length,
      latest: latest,
      trades: trades,
      timestamp: Math.floor(Date.now() / 1000)
    });
    
  } catch (error) {
    console.error('GET Trades Error:', error);
    
    return res.status(500).json({
      status: 'error',
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
