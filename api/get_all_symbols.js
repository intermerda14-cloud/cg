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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log(`\n📊 [${new Date().toISOString()}] Fetching all symbols data`);
  
  try {
    const { client, db } = await connectToDatabase();
    const collection = db.collection('trades');
    
    // Get ALL documents, sorted by timestamp
    const allTrades = await collection.find({}).sort({ timestamp: -1 }).toArray();
    
    console.log(`📈 Found ${allTrades.length} total documents in database`);
    
    if (allTrades.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No trading data found in database',
        timestamp: Math.floor(Date.now() / 1000),
        symbols: [],
        _summary: {
          total_symbols: 0,
          total_open_trades: 0,
          total_profit: '0.00',
          server_time: Math.floor(Date.now() / 1000)
        }
      });
    }
    
    // Group by symbol and get latest for each
    const symbolsMap = new Map();
    
    allTrades.forEach(trade => {
      const symbol = trade.symbol;
      if (!symbol) return;
      
      // Ensure trades field is an array
      if (!Array.isArray(trade.trades)) {
        trade.trades = [];
      }
      
      // Only keep the latest entry for each symbol
      if (!symbolsMap.has(symbol) || trade.timestamp > symbolsMap.get(symbol).timestamp) {
        symbolsMap.set(symbol, {
          symbol: trade.symbol,
          timestamp: trade.timestamp || Math.floor(Date.now() / 1000),
          equity: parseFloat(trade.equity) || 0,
          balance: parseFloat(trade.balance) || 0,
          profit: parseFloat(trade.profit) || 0,
          open_trades: parseInt(trade.open_trades) || 0,
          current_price: parseFloat(trade.current_price) || 0,
          bid_price: parseFloat(trade.bid_price) || 0,
          ask_price: parseFloat(trade.ask_price) || 0,
          spread: parseInt(trade.spread) || 0,
          ml_confidence: parseFloat(trade.ml_confidence) || 0,
          ml_trained: parseInt(trade.ml_trained) || 0,
          total_profit_pips: parseFloat(trade.total_profit_pips) || 0,
          total_profit_usd: parseFloat(trade.total_profit_usd) || 0,
          trades: Array.isArray(trade.trades) ? trade.trades : []
        });
      }
    });
    
    console.log(`🎯 Processed ${symbolsMap.size} unique symbols`);
    
    // Convert Map to object
    const result = {};
    symbolsMap.forEach((tradeData, symbol) => {
      result[symbol] = tradeData;
    });
    
    // Calculate summary
    let totalOpenTrades = 0;
    let totalProfit = 0;
    
    symbolsMap.forEach(data => {
      totalOpenTrades += data.open_trades || 0;
      totalProfit += parseFloat(data.profit) || 0;
    });
    
    const summary = {
      total_symbols: symbolsMap.size,
      total_open_trades: totalOpenTrades,
      total_profit: totalProfit.toFixed(2),
      server_time: Math.floor(Date.now() / 1000)
    };
    
    // Add summary to result
    result._summary = summary;
    result.status = 'success';
    
    console.log('📋 Summary:', summary);
    
    res.status(200).json(result);
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}
