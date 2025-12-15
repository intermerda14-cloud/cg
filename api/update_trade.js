import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db('trading_monitor');
    cachedDb = { client, db };
    console.log('✅ Connected to MongoDB');
    return cachedDb;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log(`\n📨 [${new Date().toISOString()}] ${req.method} request to update_trade`);
  
  try {
    // Parse request body
    let tradeData = {};
    
    if (req.method === 'POST') {
      // Debug raw request
      console.log('📦 Raw body type:', typeof req.body);
      console.log('📦 Raw body length:', req.body ? req.body.length : 0);
      console.log('📦 Content-Type:', req.headers['content-type']);
      
      // Handle different content types
      if (req.headers['content-type']?.includes('application/json')) {
        if (typeof req.body === 'string') {
          try {
            tradeData = JSON.parse(req.body);
            console.log('✅ Successfully parsed JSON');
          } catch (e) {
            console.error('❌ JSON parse error:', e.message);
            // Try to fix common JSON issues
            const cleaned = req.body.replace(/\r\n/g, '').replace(/\n/g, '');
            try {
              tradeData = JSON.parse(cleaned);
              console.log('✅ Fixed and parsed JSON');
            } catch (e2) {
              console.error('❌ Still failed:', e2.message);
            }
          }
        } else if (typeof req.body === 'object') {
          tradeData = req.body;
          console.log('✅ Already parsed object');
        }
      } else {
        // Try to parse as JSON anyway
        try {
          tradeData = JSON.parse(req.body);
          console.log('✅ Parsed as JSON (no content-type)');
        } catch (e) {
          console.error('❌ Could not parse body:', e.message);
        }
      }
    } else if (req.method === 'GET') {
      tradeData = req.query;
      console.log('🔍 GET parameters:', tradeData);
    }
    
    // Log received data
    console.log('🔄 Received data:', JSON.stringify(tradeData, null, 2));
    
    // VALIDATE CRITICAL FIELDS
    if (!tradeData || Object.keys(tradeData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No data received',
        timestamp: Math.floor(Date.now() / 1000),
        debug: {
          method: req.method,
          body: req.body ? req.body.substring(0, 500) : 'empty',
          headers: req.headers
        }
      });
    }
    
    // Extract symbol with multiple fallbacks
    const symbol = tradeData.symbol || tradeData.Symbol || tradeData.SYMBOL || 
                   (tradeData.trades && tradeData.trades[0]?.symbol) || 
                   'UNKNOWN';
    
    // Extract timestamp
    let timestamp = tradeData.timestamp || tradeData.Timestamp || tradeData.time;
    if (!timestamp || timestamp === 0) {
      timestamp = Math.floor(Date.now() / 1000);
      console.log('🕐 Generated timestamp:', timestamp);
    }
    
    // Validate symbol
    if (!symbol || symbol === 'UNKNOWN') {
      return res.status(400).json({
        status: 'error',
        message: 'Symbol not found in data',
        received_data: tradeData,
        suggestions: [
          'EA harus mengirim field "symbol" dalam data JSON',
          'Contoh: {"symbol":"XAUUSD", ...}',
          'Data yang diterima: ' + JSON.stringify(tradeData).substring(0, 200)
        ]
      });
    }
    
    // Prepare data for MongoDB
    const mongoData = {
      ...tradeData,
      symbol: symbol,
      timestamp: parseInt(timestamp),
      server_received: Math.floor(Date.now() / 1000),
      updated_at: new Date().toISOString(),
      method: req.method,
      source: 'mt5_ea'
    };
    
    // Convert string numbers to numbers
    const numericFields = [
      'profit', 'profit_usd', 'profit_pips', 'lots', 'open_price',
      'current_price', 'sl', 'tp', 'balance', 'equity', 'margin',
      'total_profit_pips', 'total_profit_usd', 'ml_confidence'
    ];
    
    numericFields.forEach(field => {
      if (mongoData[field] !== undefined && mongoData[field] !== null) {
        const num = parseFloat(mongoData[field]);
        if (!isNaN(num)) {
          mongoData[field] = num;
        }
      }
    });
    
    // Convert open_trades to number
    if (mongoData.open_trades !== undefined) {
      mongoData.open_trades = parseInt(mongoData.open_trades) || 0;
    }
    
    // Convert ml_trained to number
    if (mongoData.ml_trained !== undefined) {
      mongoData.ml_trained = parseInt(mongoData.ml_trained) || 0;
    }
    
    console.log('💾 Data to save:', {
      symbol: mongoData.symbol,
      timestamp: mongoData.timestamp,
      open_trades: mongoData.open_trades,
      profit: mongoData.profit,
      has_trades: mongoData.trades ? mongoData.trades.length : 0
    });
    
    // Save to MongoDB
    const { client, db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Create unique key
    const uniqueKey = mongoData.ticket ? 
      { symbol: mongoData.symbol, ticket: mongoData.ticket } :
      { symbol: mongoData.symbol, timestamp: mongoData.timestamp };
    
    const result = await collection.updateOne(
      uniqueKey,
      { $set: mongoData },
      { upsert: true }
    );
    
    console.log(`✅ MongoDB: ${result.matchedCount} matched, ${result.modifiedCount} modified, ${result.upsertedCount} upserted`);
    
    // Return success response
    res.status(200).json({
      status: 'success',
      message: `Data for ${mongoData.symbol} saved successfully`,
      timestamp: mongoData.server_received,
      data: {
        symbol: mongoData.symbol,
        open_trades: mongoData.open_trades,
        profit: mongoData.profit,
        method: req.method,
        mongo_id: result.upsertedId
      },
      debug: process.env.NODE_ENV === 'development' ? {
        received: tradeData,
        processed: mongoData,
        mongo_result: result
      } : undefined
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error: ' + error.message,
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}
