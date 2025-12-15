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
    
    // Get ALL documents, not just distinct symbols
    const allTrades = await collection.find({}).sort({ timestamp: -1 }).toArray();
    
    console.log(`📈 Found ${allTrades.length} total documents in database`);
    
    if (allTrades.length === 0) {
      return res.status(200).json({
        status: 'no_data',
        message: 'No trading data found in database',
        timestamp: Math.floor(Date.now() / 1000),
        symbols: []
      });
    }
    
    // Group by symbol and get latest for each
    const symbolsMap = new Map();
    
    allTrades.forEach(trade => {
      const symbol = trade.symbol;
      
      // Only keep the latest entry for each symbol
      if (!symbolsMap.has(symbol) || trade.timestamp > symbolsMap.get(symbol).timestamp) {
        symbolsMap.set(symbol, trade);
      }
    });
    
    // Convert to object
    const result = {};
    symbolsMap.forEach((tradeData, symbol) => {
      result[symbol] = {
        symbol: tradeData.symbol,
        timestamp: tradeData.timestamp,
        equity: tradeData.equity || 0,
        balance: tradeData.balance || 0,
        profit: tradeData.profit || 0,
        open_trades: tradeData.open_trades || 0,
        current_price: tradeData.current_price || 0,
        bid_price: tradeData.bid_price || 0,
        ask_price: tradeData.ask_price || 0,
        spread: tradeData.spread || 0,
        ml_confidence: tradeData.ml_confidence || 0,
        ml_trained: tradeData.ml_trained || 0,
        total_profit_pips: tradeData.total_profit_pips || 0,
        total_profit_usd: tradeData.total_profit_usd || 0,
        trades: tradeData.trades || []
      };
    });
    
    console.log(`🎯 Processed ${symbolsMap.size} unique symbols`);
    
    // Add summary
    const summary = {
      total_symbols: symbolsMap.size,
      total_open_trades: Array.from(symbolsMap.values()).reduce((sum, data) => 
        sum + (data.open_trades || 0), 0),
      total_profit: Array.from(symbolsMap.values()).reduce((sum, data) => 
        sum + parseFloat(data.profit || 0), 0).toFixed(2),
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
