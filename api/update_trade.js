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
  
  console.log(`📨 Received ${req.method} request at ${new Date().toISOString()}`);
  console.log('📦 Request body:', req.body);
  console.log('🔍 Request query:', req.query);
  console.log('📋 Request headers:', req.headers);
  
  let tradeData = {};
  
  // ACCEPT BOTH GET AND POST
  if (req.method === 'POST') {
    // Try to parse JSON body
    if (typeof req.body === 'object' && req.body !== null) {
      tradeData = req.body;
    } else if (typeof req.body === 'string' && req.body.trim() !== '') {
      try {
        tradeData = JSON.parse(req.body);
      } catch (e) {
        // Try URL encoded form data
        try {
          const params = new URLSearchParams(req.body);
          tradeData = Object.fromEntries(params);
        } catch (e2) {
          console.error('Failed to parse body:', e2);
        }
      }
    }
  } else if (req.method === 'GET') {
    // Parse data from query parameters
    tradeData = req.query;
  }
  
  console.log('🔄 Parsed tradeData:', tradeData);
  
  // SPECIAL CASE: If EA sends data as form-urlencoded in POST body
  if (req.headers['content-type'] && 
      req.headers['content-type'].includes('application/x-www-form-urlencoded') &&
      typeof req.body === 'string') {
    try {
      const params = new URLSearchParams(req.body);
      tradeData = Object.fromEntries(params);
      console.log('🔄 Parsed as form-urlencoded:', tradeData);
    } catch (e) {
      console.error('Failed to parse form-urlencoded:', e);
    }
  }
  
  // Try to extract symbol and timestamp from various possible field names
  let symbol = tradeData.symbol || tradeData.Symbol || tradeData.SYMBOL || 
               tradeData.instrument || tradeData.Instrument || 
               tradeData.pair || tradeData.Pair;
  
  let timestamp = tradeData.timestamp || tradeData.Timestamp || tradeData.TIMESTAMP ||
                  tradeData.time || tradeData.Time || tradeData.TIME ||
                  tradeData.server_time || tradeData.serverTime;
  
  // If timestamp is not a number, try to parse it
  if (timestamp && isNaN(parseInt(timestamp))) {
    // Try to convert date string to timestamp
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      timestamp = Math.floor(date.getTime() / 1000);
    }
  }
  
  // Generate timestamp if missing
  if (!timestamp) {
    timestamp = Math.floor(Date.now() / 1000);
  }
  
  // If still no symbol, try to guess from other fields
  if (!symbol && tradeData.ticket) {
    symbol = `UNKNOWN_${tradeData.ticket}`;
  }
  
  console.log('🎯 Extracted symbol:', symbol, 'timestamp:', timestamp);
  
  if (!symbol) {
    return res.status(400).json({ 
      error: 'Missing required field: symbol',
      received_data: tradeData,
      raw_body: req.body,
      raw_query: req.query,
      headers: req.headers,
      suggestions: [
        'Make sure EA sends "symbol" field',
        'Check field name case (symbol vs Symbol vs SYMBOL)',
        'Check if data is JSON or form-urlencoded'
      ]
    });
  }
  
  try {
    // Add server metadata
    const finalTradeData = {
      ...tradeData,
      symbol: symbol,
      timestamp: parseInt(timestamp),
      server_received: Math.floor(Date.now() / 1000),
      updated_at: new Date().toISOString(),
      method_used: req.method,
      content_type: req.headers['content-type'] || 'unknown'
    };
    
    // Convert string numbers to actual numbers
    const numericFields = ['profit', 'profit_pips', 'lots', 'open_price', 
                          'current_price', 'sl', 'tp', 'balance', 'equity'];
    
    numericFields.forEach(field => {
      if (finalTradeData[field] !== undefined && finalTradeData[field] !== null) {
        const num = parseFloat(finalTradeData[field]);
        if (!isNaN(num)) {
          finalTradeData[field] = num;
        }
      }
    });
    
    console.log('💾 Final data to save:', finalTradeData);
    
    const { client, db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Use ticket as unique identifier if available
    const query = finalTradeData.ticket ? 
      { symbol: finalTradeData.symbol, ticket: finalTradeData.ticket } :
      { symbol: finalTradeData.symbol, timestamp: finalTradeData.timestamp };
    
    // Update or insert
    const result = await collection.updateOne(
      query,
      { $set: finalTradeData },
      { upsert: true }
    );
    
    console.log(`✅ Trade ${finalTradeData.ticket ? '#' + finalTradeData.ticket : ''} for ${finalTradeData.symbol} ${result.upsertedCount ? 'inserted' : 'updated'} via ${req.method}`);
    
    res.status(200).json({
      status: 'success',
      message: `Trade data saved for ${finalTradeData.symbol}`,
      timestamp: finalTradeData.server_received,
      data: {
        symbol: finalTradeData.symbol,
        ticket: finalTradeData.ticket,
        method: req.method,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount
      },
      debug: {
        received: tradeData,
        processed: finalTradeData
      }
    });
    
  } catch (error) {
    console.error('❌ Error saving trade:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      timestamp: Math.floor(Date.now() / 1000),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
