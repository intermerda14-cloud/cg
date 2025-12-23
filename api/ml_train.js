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
    let data;
    
    if (typeof req.body === 'string') {
      data = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      data = req.body;
    } else {
      throw new Error('Invalid body format');
    }
    
    const mlData = {
      symbol: data.symbol || 'UNKNOWN',
      training_count: parseInt(data.training_count) || 0,
      win_trades: parseInt(data.win_trades) || 0,
      total_trades: parseInt(data.total_trades) || 0,
      win_rate: parseFloat(data.win_rate) || 0,
      last_profit: parseFloat(data.last_profit) || 0,
      timestamp: parseInt(data.timestamp) || Math.floor(Date.now() / 1000),
      updated_at: new Date()
    };
    
    const client = await connectToDatabase();
    const db = client.db('trading_monitor');
    const collection = db.collection('ml_training');
    
    await collection.insertOne(mlData);
    
    return res.status(200).json({
      status: 'success',
      message: 'ML training data saved',
      data: mlData
    });
    
  } catch (error) {
    console.error('ML API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
