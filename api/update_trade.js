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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Parse body - handle both JSON and form-urlencoded
    let data;
    
    if (typeof req.body === 'string') {
      // If body is string, parse as JSON
      data = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      // If body is already object, use directly
      data = req.body;
    } else {
      throw new Error('Invalid body format');
    }
    
    // Validate required fields
    const symbol = data.symbol || 'UNKNOWN';
    if (!symbol || symbol === 'UNKNOWN') {
      return res.status(400).json({
        error: 'Invalid symbol',
        received: data
      });
    }
    
    // Prepare trade data
    const tradeData = {
      symbol: symbol,
      timestamp: parseInt(data.timestamp) || Math.floor(Date.now() / 1000),
      equity: parseFloat(data.equity) || 0,
      balance: parseFloat(data.balance) || 0,
      profit: parseFloat(data.profit) || 0,
      open_trades: parseInt(data.open_trades) || 0,
      current_price: parseFloat(data.current_price) || 0,
      bid_price: parseFloat(data.bid_price) || 0,
      ask_price: parseFloat(data.ask_price) || 0,
      ml_confidence: parseFloat(data.ml_confidence) || 0,
      ml_trained: parseInt(data.ml_trained) || 0,
      trades: data.trades || [],
      total_profit_usd: parseFloat(data.total_profit_usd) || 0,
      updated_at: new Date()
    };
    
    // Connect to MongoDB
    const client = await connectToDatabase();
    const db = client.db('trading_monitor');
    const collection = db.collection('trades');
    
    // Upsert (update or insert)
    await collection.updateOne(
      { symbol: symbol },
      { $set: tradeData },
      { upsert: true }
    );
    
    return res.status(200).json({
      status: 'success',
      message: `Data saved for ${symbol}`,
      timestamp: tradeData.timestamp
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
}
