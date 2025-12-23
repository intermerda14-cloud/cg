// api/grid_stats.js
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
  
  try {
    const client = await connectToDatabase();
    const db = client.db('trading_monitor');
    const trades = db.collection('trades');
    const mlTraining = db.collection('ml_training');
    
    // Get latest trade data
    const latestTrade = await trades.findOne({}, { sort: { timestamp: -1 } });
    
    // Get ML statistics
    const mlStats = await mlTraining.findOne({}, { sort: { training_count: -1 } });
    
    // Get grid statistics
    const gridInfo = latestTrade?.grid_info ? JSON.parse(latestTrade.grid_info) : [];
    
    const stats = {
      current_equity: latestTrade?.equity || 0,
      floating_pl: latestTrade?.profit || 0,
      open_grids: latestTrade?.open_trades || 0,
      grid_details: gridInfo,
      ml_training_count: mlStats?.training_count || 0,
      ml_win_rate: mlStats?.win_rate || 0,
      last_update: latestTrade?.timestamp || 0
    };
    
    return res.status(200).json(stats);
    
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}
