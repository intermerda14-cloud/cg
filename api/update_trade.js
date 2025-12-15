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
  
  console.log(`📨 [${new Date().toISOString()}] ${req.method} request received`);
  
  let tradeData = {};
  
  try {
    // Handle POST request (from EA MT5)
    if (req.method === 'POST') {
      // EA mengirim JSON string, parse langsung
      if (typeof req.body === 'string') {
        try {
          tradeData = JSON.parse(req.body);
          console.log('✅ Parsed JSON from EA:', JSON.stringify(tradeData, null, 2));
        } catch (e) {
          console.error('❌ Failed to parse JSON:', e.message);
          console.log('Raw body:', req.body);
          
          // Try to extract data from string
          if (req.body.includes('symbol') && req.body.includes('timestamp')) {
            // Manual extraction
            const symbolMatch = req.body.match(/"symbol"\s*:\s*"([^"]+)"/);
            const timestampMatch = req.body.match(/"timestamp"\s*:\s*(\d+)/);
            
            if (symbolMatch && timestampMatch) {
              tradeData.symbol = symbolMatch[1];
              tradeData.timestamp = parseInt(timestampMatch[1]);
              console.log('🔍 Extracted manually:', tradeData);
            }
          }
        }
      } else if (typeof req.body === 'object') {
        tradeData = req.body;
        console.log('✅ Received object:', tradeData);
      }
    }
    // Handle GET request (for testing)
    else if (req.method === 'GET') {
      tradeData = req.query;
      console.log('🔍 GET params:', tradeData);
    }
    
    // VALIDATE DATA
    console.log('🔄 Final tradeData:', tradeData);
    
    // Check for symbol (try multiple field names)
    const symbol = tradeData.symbol || tradeData.Symbol || tradeData.SYMBOL;
    
    // Check for timestamp (try multiple field names)
    let timestamp = tradeData.timestamp || tradeData.Timestamp || tradeData.TIMESTAMP || 
                    tradeData.time || tradeData.Time || tradeData.TIME;
    
    // Convert to number if string
    if (timestamp && typeof timestamp === 'string') {
      timestamp = parseInt(timestamp);
    }
    
    // Generate timestamp if missing
    if (!timestamp || isNaN(timestamp)) {
      timestamp = Math.floor(Date.now() / 1000);
      console.log('🕐 Generated timestamp:', timestamp);
    }
    
    // Check required fields
    if (!symbol) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required field: symbol',
        received_data: tradeData,
        raw_body: req.body,
        suggestions: [
          'EA harus mengirim field "symbol" dalam JSON',
          'Contoh: {"symbol":"XAUUSD","timestamp":1234567890,...}',
          'Pastikan Content-Type: application/json'
        ],
        debug_info: {
          method: req.method,
          content_type: req.headers['content-type'],
          body_type: typeof req.body,
          body_length: req.body ? req.body.length : 0
        }
      });
    }
    
    // Prepare data for MongoDB
    const mongoData = {
      ...tradeData,
      symbol: symbol,
      timestamp: timestamp,
      server_received: Math.floor(Date.now() / 1000),
      updated_at: new Date().toISOString(),
      ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };
    
    // Convert numeric fields
    const numericFields = [
      'profit', 'profit_usd', 'profit_pips', 'lots', 'open_price',
      'current_price', 'sl', 'tp', 'balance', 'equity', 'margin'
    ];
    
    numericFields.forEach(field => {
      if (mongoData[field] !== undefined && mongoData[field] !== null) {
        const num = parseFloat(mongoData[field]);
        if (!isNaN(num)) {
          mongoData[field] = num;
        }
      }
    });
    
    console.log('💾 Saving to MongoDB:', {
      symbol: mongoData.symbol,
      timestamp: mongoData.timestamp,
      trades: mongoData.trades ? mongoData.trades.length || 'array' : 'none',
      profit: mongoData.profit
    });
    
    // Save to MongoDB
    const { client, db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Use symbol + timestamp as key, or symbol + ticket
    const query = mongoData.ticket ? 
      { symbol: mongoData.symbol, ticket: mongoData.ticket } :
      { symbol: mongoData.symbol, timestamp: mongoData.timestamp };
    
    const result = await collection.updateOne(
      query,
      { $set: mongoData },
      { upsert: true }
    );
    
    console.log(`✅ MongoDB result: ${result.matchedCount} matched, ${result.modifiedCount} modified, ${result.upsertedCount} upserted`);
    
    // Send success response
    res.status(200).json({
      status: 'success',
      message: `Trade data for ${mongoData.symbol} saved successfully`,
      timestamp: mongoData.server_received,
      data: {
        symbol: mongoData.symbol,
        ticket: mongoData.ticket,
        open_trades: mongoData.open_trades,
        profit: mongoData.profit,
        method: req.method,
        mongo_result: {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          upserted: result.upsertedCount
        }
      }
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: Math.floor(Date.now() / 1000),
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
}
