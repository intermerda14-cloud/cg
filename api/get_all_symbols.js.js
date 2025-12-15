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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { client, db } = await connectToDatabase();
    
    // Get all unique symbols
    const collection = db.collection('trades');
    const symbols = await collection.distinct('symbol');
    
    if (symbols.length === 0) {
      return res.status(200).json({
        status: 'no_data',
        message: 'No trading data found',
        timestamp: Math.floor(Date.now() / 1000),
        symbols: []
      });
    }
    
    const result = {};
    
    for (const symbol of symbols) {
      // Get latest data for each symbol
      const latest = await collection
        .find({ symbol })
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
      
      if (latest.length > 0) {
        const data = latest[0];
        
        // Get open trades for this symbol
        const openTrades = await collection
          .find({ symbol, status: 'open' })
          .toArray();
        
        // Calculate totals
        const totalProfit = openTrades.reduce((sum, trade) => 
          sum + (parseFloat(trade.profit_usd) || 0), 0);
        
        const totalProfitPips = openTrades.reduce((sum, trade) => 
          sum + (parseFloat(trade.profit_pips) || 0), 0);
        
        result[symbol] = {
          ...data,
          open_trades: openTrades.length,
          trades: openTrades,
          profit: totalProfit.toFixed(2),
          total_profit_pips: totalProfitPips.toFixed(1),
          equity: (parseFloat(data.balance || 0) + totalProfit).toFixed(2)
        };
      }
    }
    
    // Add summary
    const summary = {
      total_symbols: Object.keys(result).length,
      total_open_trades: Object.values(result).reduce((sum, data) => 
        sum + (data.open_trades || 0), 0),
      total_profit: Object.values(result).reduce((sum, data) => 
        sum + parseFloat(data.profit || 0), 0).toFixed(2),
      server_time: Math.floor(Date.now() / 1000)
    };
    
    res.status(200).json({
      ...result,
      _summary: summary,
      status: 'success'
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}