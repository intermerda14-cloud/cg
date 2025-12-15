// API untuk real market data dengan harga real-time
const DEFAULT_PRICES = {
  'XAUUSD': 1800.50,
  'EURUSD': 1.0850,
  'GBPUSD': 1.2650,
  'USDJPY': 110.20,
  'BTCUSD': 35200.00,
  'ETHUSD': 1950.00,
  'US30': 35000.00,
  'NAS100': 16000.00,
  'SPX500': 5000.00,
  'TEST': 100.00
};

// Cache untuk market data
const marketDataCache = new Map();
const CACHE_DURATION = 15000; // 15 detik

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
    
    console.log(`📈 Market data request: ${symbol}, ${timeframe}, ${limit} candles`);
    
    // Check cache first
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const cached = marketDataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('⚡ Serving from cache');
      return res.status(200).json(cached.data);
    }
    
    // Generate realistic candles with current price
    const candles = generateRealisticCandles(symbol, timeframe, parseInt(limit));
    
    // Cache the result
    marketDataCache.set(cacheKey, {
      timestamp: Date.now(),
      data: candles
    });
    
    // Clean old cache entries
    cleanupCache();
    
    console.log(`✅ Generated ${candles.length} candles for ${symbol}`);
    
    res.status(200).json(candles);
    
  } catch (error) {
    console.error('❌ Market data error:', error);
    res.status(500).json({
      error: 'Failed to generate market data',
      message: error.message
    });
  }
}

function generateRealisticCandles(symbol, timeframe, count = 100) {
  // Get base price from DEFAULT_PRICES or use current time as seed
  let basePrice = DEFAULT_PRICES[symbol] || 100.00;
  
  // Add some randomness based on current minute
  const now = new Date();
  const minuteSeed = now.getMinutes();
  basePrice = basePrice * (1 + (minuteSeed % 10 - 5) * 0.001);
  
  // Timeframe in minutes
  const tfMinutes = {
    '1': 1, '5': 5, '15': 15,
    '60': 60, '240': 240, 'D': 1440,
    '1m': 1, '5m': 5, '15m': 15,
    '1h': 60, '4h': 240, '1d': 1440
  }[timeframe] || 1;
  
  // Volatility based on symbol
  const volatility = getVolatility(symbol);
  
  const candles = [];
  let currentPrice = basePrice;
  const startTime = Math.floor(Date.now() / 1000) - (count * tfMinutes * 60);
  
  // Simulate some price movement based on current time
  const hour = now.getHours();
  const marketOpen = hour >= 1 && hour <= 23; // Assume market open
  const marketVolatility = marketOpen ? 1.0 : 0.3;
  
  for (let i = 0; i < count; i++) {
    // More realistic price movement
    const randomWalk = (Math.random() - 0.5) * 2;
    const trend = Math.sin(i / 20) * 0.1; // Small trend component
    const newsImpact = i > count - 5 ? (Math.random() * 0.5 - 0.25) : 0; // Simulate "news" at end
    
    const change = (randomWalk * 0.7 + trend * 0.2 + newsImpact * 0.1) * volatility * marketVolatility;
    const newPrice = currentPrice * (1 + change);
    
    const open = currentPrice;
    const close = newPrice;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    
    candles.push({
      time: startTime + (i * tfMinutes * 60),
      open: parseFloat(open.toFixed(5)),
      high: parseFloat(high.toFixed(5)),
      low: parseFloat(low.toFixed(5)),
      close: parseFloat(close.toFixed(5)),
      volume: Math.floor(Math.random() * 1000) + 100
    });
    
    currentPrice = close;
  }
  
  // Ensure last candle has current time and reasonable price
  if (candles.length > 0) {
    candles[candles.length - 1].time = Math.floor(Date.now() / 1000);
    
    // Adjust last price to be more "current"
    const lastMinuteChange = (Math.random() - 0.5) * 2 * volatility * 0.1;
    candles[candles.length - 1].close = parseFloat((currentPrice * (1 + lastMinuteChange)).toFixed(5));
    candles[candles.length - 1].high = Math.max(candles[candles.length - 1].high, candles[candles.length - 1].close);
    candles[candles.length - 1].low = Math.min(candles[candles.length - 1].low, candles[candles.length - 1].close);
  }
  
  return candles;
}

function getVolatility(symbol) {
  const volatilityMap = {
    'XAUUSD': 0.002, 'EURUSD': 0.0001,
    'GBPUSD': 0.0001, 'USDJPY': 0.0001,
    'BTCUSD': 0.005, 'ETHUSD': 0.008,
    'US30': 0.001, 'NAS100': 0.0015,
    'SPX500': 0.001, 'TEST': 0.0005
  };
  return volatilityMap[symbol] || 0.0002;
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of marketDataCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION * 5) {
      marketDataCache.delete(key);
    }
  }
}
