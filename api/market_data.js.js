// Simple market data API with caching
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Default prices for common symbols
const DEFAULT_PRICES = {
  'XAUUSD': 1800.50,
  'EURUSD': 1.0850,
  'GBPUSD': 1.2650,
  'USDJPY': 110.20,
  'BTCUSD': 35200.00,
  'ETHUSD': 1950.00,
  'US30': 35000.00,
  'NAS100': 16000.00,
  'SPX500': 5000.00
};

// Generate realistic candles
function generateCandles(symbol, timeframe, count = 100) {
  const cacheKey = `${symbol}_${timeframe}_${count}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const basePrice = DEFAULT_PRICES[symbol] || 100.00;
  const volatility = getVolatility(symbol);
  
  // Timeframe in minutes
  const tfMinutes = {
    '1': 1, '5': 5, '15': 15,
    '60': 60, '240': 240, 'D': 1440,
    '1m': 1, '5m': 5, '15m': 15,
    '1h': 60, '4h': 240, '1d': 1440
  }[timeframe] || 1;
  
  const candles = [];
  let currentPrice = basePrice;
  const startTime = Math.floor(Date.now() / 1000) - (count * tfMinutes * 60);
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility;
    const newPrice = currentPrice * (1 + change);
    
    const open = currentPrice;
    const close = newPrice;
    const high = Math.max(open, close) * (1 + Math.random() * 0.001);
    const low = Math.min(open, close) * (1 - Math.random() * 0.001);
    
    candles.push({
      time: startTime + (i * tfMinutes * 60),
      open: parseFloat(open.toFixed(5)),
      high: parseFloat(high.toFixed(5)),
      low: parseFloat(low.toFixed(5)),
      close: parseFloat(close.toFixed(5)),
      volume: Math.floor(Math.random() * 100) + 10
    });
    
    currentPrice = close;
  }
  
  // Update last candle with current time
  if (candles.length > 0) {
    candles[candles.length - 1].time = Math.floor(Date.now() / 1000);
  }
  
  cache.set(cacheKey, {
    timestamp: Date.now(),
    data: candles
  });
  
  // Clean old cache
  cleanupCache();
  
  return candles;
}

function getVolatility(symbol) {
  const volatilityMap = {
    'XAUUSD': 0.002, 'EURUSD': 0.0001,
    'GBPUSD': 0.0001, 'USDJPY': 0.0001,
    'BTCUSD': 0.005, 'ETHUSD': 0.008,
    'US30': 0.001, 'NAS100': 0.0015,
    'SPX500': 0.001
  };
  return volatilityMap[symbol] || 0.0002;
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 5) {
      cache.delete(key);
    }
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
  
  try {
    const { symbol, timeframe = '1m', limit = 100 } = req.query;
    
    if (!symbol) {
      return res.status(400).json({
        error: 'Symbol parameter is required',
        example: '/api/market_data.js?symbol=XAUUSD&timeframe=1m&limit=100',
        available_symbols: Object.keys(DEFAULT_PRICES)
      });
    }
    
    const candles = generateCandles(symbol, timeframe, parseInt(limit));
    
    res.status(200).json(candles);
    
  } catch (error) {
    console.error('Market data error:', error);
    res.status(500).json({
      error: 'Failed to generate market data',
      message: error.message
    });
  }
}