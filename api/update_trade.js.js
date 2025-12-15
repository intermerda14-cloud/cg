import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db('trading_monitor');
  cachedDb = { client, db };
  
  return cachedDb;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use POST.' 
    });
  }
  
  try {
    const tradeData = req.body;
    
    // Validate required fields
    if (!tradeData.symbol || !tradeData.timestamp) {
      return res.status(400).json({ 
        error: 'Missing required fields: symbol and timestamp are required' 
      });
    }
    
    // Add server metadata
    tradeData.server_received = Math.floor(Date.now() / 1000);
    tradeData.updated_at = new Date().toISOString();
    
    const { client, db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Use ticket as unique identifier if available
    const query = tradeData.ticket ? 
      { symbol: tradeData.symbol, ticket: tradeData.ticket } :
      { symbol: tradeData.symbol, timestamp: tradeData.timestamp };
    
    // Update or insert
    const result = await collection.updateOne(
      query,
      { $set: tradeData },
      { upsert: true }
    );
    
    console.log(`Trade ${tradeData.ticket ? '#' + tradeData.ticket : ''} for ${tradeData.symbol} ${result.upsertedCount ? 'inserted' : 'updated'}`);
    
    res.status(200).json({
      status: 'success',
      message: `Trade data ${result.upsertedCount ? 'saved' : 'updated'} successfully`,
      timestamp: tradeData.server_received,
      data: {
        symbol: tradeData.symbol,
        ticket: tradeData.ticket,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount
      }
    });
    
  } catch (error) {
    console.error('Error saving trade:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}