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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ACCEPT BOTH GET AND POST
  let tradeData;
  
  if (req.method === 'POST') {
    tradeData = req.body;
  } else if (req.method === 'GET') {
    // Parse data from query parameters for GET requests
    tradeData = req.query;
  } else {
    return res.status(405).json({ 
      error: `Method ${req.method} not allowed. Use GET or POST.` 
    });
  }
  
  try {
    // Validate required fields
    if (!tradeData.symbol || !tradeData.timestamp) {
      return res.status(400).json({ 
        error: 'Missing required fields: symbol and timestamp are required',
        received_data: tradeData
      });
    }
    
    // Add server metadata
    tradeData.server_received = Math.floor(Date.now() / 1000);
    tradeData.updated_at = new Date().toISOString();
    tradeData.method_used = req.method;
    
    // Convert string numbers to actual numbers
    if (tradeData.profit) tradeData.profit = parseFloat(tradeData.profit);
    if (tradeData.profit_pips) tradeData.profit_pips = parseFloat(tradeData.profit_pips);
    if (tradeData.lots) tradeData.lots = parseFloat(tradeData.lots);
    if (tradeData.open_price) tradeData.open_price = parseFloat(tradeData.open_price);
    if (tradeData.current_price) tradeData.current_price = parseFloat(tradeData.current_price);
    if (tradeData.sl) tradeData.sl = parseFloat(tradeData.sl);
    if (tradeData.tp) tradeData.tp = parseFloat(tradeData.tp);
    
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
    
    console.log(`Trade ${tradeData.ticket ? '#' + tradeData.ticket : ''} for ${tradeData.symbol} ${result.upsertedCount ? 'inserted' : 'updated'} via ${req.method}`);
    
    res.status(200).json({
      status: 'success',
      message: `Trade data ${result.upsertedCount ? 'saved' : 'updated'} successfully via ${req.method}`,
      timestamp: tradeData.server_received,
      data: {
        symbol: tradeData.symbol,
        ticket: tradeData.ticket,
        method: req.method,
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
