// api/ml_train.js
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
    const {
      training_count,
      win_trades,
      total_trades,
      win_rate,
      last_profit,
      timestamp,
      symbol
    } = req.body;
    
    const client = await connectToDatabase();
    const db = client.db('trading_monitor');
    const collection = db.collection('ml_training');
    
    const trainingData = {
      training_count: parseInt(training_count),
      win_trades: parseInt(win_trades),
      total_trades: parseInt(total_trades),
      win_rate: parseFloat(win_rate),
      last_profit: parseFloat(last_profit),
      symbol: symbol,
      timestamp: parseInt(timestamp),
      created_at: new Date()
    };
    
    await collection.insertOne(trainingData);
    
    return res.status(200).json({
      status: 'success',
      message: 'ML training data saved',
      training_count: training_count
    });
    
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
