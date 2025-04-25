const { contextBridge, ipcRenderer } = require('electron');

// 缓存数据
let btcPriceCache = null;
let goldPriceCache = null;
let lastUpdateTime = 0;
let currentDisplayMode = 'btc'; // 'btc' 或 'gold'
let fastUpdateMode = false; // 快速更新模式标志
let debugMode = true; // 调试模式，输出更多日志

// 向渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 关闭窗口
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // 切换BTC/黄金价格显示
  toggleDisplay: () => {
    currentDisplayMode = currentDisplayMode === 'btc' ? 'gold' : 'btc';
    console.log('切换显示模式为:', currentDisplayMode);
    return currentDisplayMode;
  },
  
  // 切换快速更新模式
  toggleFastUpdate: () => {
    fastUpdateMode = !fastUpdateMode;
    console.log('快速更新模式:', fastUpdateMode);
    if (fastUpdateMode) {
      // 30秒后自动关闭快速更新模式
      setTimeout(() => {
        fastUpdateMode = false;
        console.log('自动关闭快速更新模式');
        ipcRenderer.send('fast-update-ended');
      }, 30000);
    }
    return fastUpdateMode;
  },
  
  // 获取快速更新模式状态
  isFastUpdateMode: () => fastUpdateMode,
  
  // 获取当前显示模式
  getCurrentDisplayMode: () => currentDisplayMode,
  
  // 获取价格 - 根据当前模式返回BTC或黄金价格
  getPrice: async (forceRefresh = false) => {
    if (debugMode) console.log('获取价格, 模式:', currentDisplayMode, '强制刷新:', forceRefresh);
    
    // 如果不是强制刷新，且有缓存，且缓存时间不超过10秒，则使用缓存
    const currentTime = Date.now();
    const useCache = !forceRefresh && 
                    (currentDisplayMode === 'btc' ? btcPriceCache : goldPriceCache) && 
                    (currentTime - lastUpdateTime < (fastUpdateMode ? 900 : 9000));
    
    if (useCache) {
      if (debugMode) console.log('使用缓存数据');
      return currentDisplayMode === 'btc' ? btcPriceCache : goldPriceCache;
    }
    
    // 更新缓存时间
    lastUpdateTime = currentTime;
    
    // 根据当前模式获取价格
    try {
      if (currentDisplayMode === 'btc') {
        btcPriceCache = await fetchBTCPrice();
        if (debugMode) console.log('获取到BTC价格:', btcPriceCache);
        return btcPriceCache;
      } else {
        goldPriceCache = await fetchGoldPrice();
        if (debugMode) console.log('获取到黄金价格:', goldPriceCache);
        return goldPriceCache;
      }
    } catch (error) {
      console.error('获取价格出错:', error);
      // 出错时返回模拟数据
      return provideFallbackData(currentDisplayMode);
    }
  }
});

// 获取BTC价格 - 多API源尝试
async function fetchBTCPrice() {
  // 定义所有API源及其处理函数
  const apiSources = [
    {
      name: 'OKX',
      url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
      handler: (data) => {
        if (data && data.data && data.data[0]) {
          const price = parseFloat(data.data[0].last);
          // OKX没有直接返回24小时变化百分比，我们计算一下
          const open24h = parseFloat(data.data[0].open24h);
          const priceChange = ((price - open24h) / open24h) * 100;
          
          return {
            bitcoin: {
              usd: price,
              usd_24h_change: priceChange
            }
          };
        }
        throw new Error('无效的OKX响应格式');
      }
    },
    {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
      handler: (data) => {
        if (data) {
          const price = parseFloat(data.lastPrice);
          const priceChange = parseFloat(data.priceChangePercent);
          
          return {
            bitcoin: {
              usd: price,
              usd_24h_change: priceChange
            }
          };
        }
        throw new Error('无效的Binance响应格式');
      }
    },
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      handler: (data) => {
        if (data && data.bitcoin) {
          return data;
        }
        throw new Error('无效的CoinGecko响应格式');
      }
    }
  ];
  
  // 依次尝试每个API源
  for (const api of apiSources) {
    try {
      console.log(`尝试从${api.name}获取BTC价格...`);
      const response = await makeRequest(api.url);
      const data = api.handler(response);
      console.log(`${api.name}数据获取成功:`, data);
      return data;
    } catch (error) {
      console.error(`${api.name}获取失败:`, error.message);
      // 继续尝试下一个API
      continue;
    }
  }
  
  // 所有API都失败，返回模拟数据
  console.log('所有API都失败，使用模拟数据');
  return provideFallbackData('btc');
}

// 获取黄金价格
async function fetchGoldPrice() {
  // 定义黄金价格API源
  const goldApiSources = [
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=gold&vs_currencies=cny&include_24hr_change=true',
      handler: (data) => {
        if (data && data.gold && data.gold.cny) {
          // CoinGecko返回的价格是每盎司价格，需要转换为每克
          const pricePerOunce = parseFloat(data.gold.cny);
          const pricePerGram = (pricePerOunce / 31.1035).toFixed(2); // 1盎司 = 31.1035克
          const priceChange = data.gold.cny_24h_change || 0;
          
          return {
            gold: {
              usd: parseFloat(pricePerGram), // 人民币/克
              usd_24h_change: parseFloat(priceChange).toFixed(2)
            }
          };
        }
        throw new Error('无效的CoinGecko黄金价格响应格式');
      }
    },
    {
      name: 'PublicGoldAPI',
      url: 'https://data-asg.goldprice.org/dbXRates/CNY',
      handler: (data) => {
        if (data && data.items && data.items[0]) {
          // 这个API返回的是盎司价格，需要转换为克
          const pricePerOunce = parseFloat(data.items[0].xauPrice);
          const pricePerGram = (pricePerOunce / 31.1035).toFixed(2); // 1盎司 = 31.1035克
          // 注意：这个API没有直接提供价格变化，设置为0或尝试从其他地方获取
          const priceChange = 0;
          
          return {
            gold: {
              usd: parseFloat(pricePerGram), // 人民币/克
              usd_24h_change: priceChange
            }
          };
        }
        throw new Error('无效的公开黄金API响应格式');
      }
    },
    {
      name: 'ExchangeRatesAPI',
      url: 'https://open.er-api.com/v6/latest/XAU',
      handler: (data) => {
        if (data && data.rates && data.rates.CNY) {
          // XAU是黄金的ISO代码，1XAU = 1盎司黄金
          // 汇率是1盎司黄金=多少CNY
          const cnyPerOunce = parseFloat(data.rates.CNY);
          const cnyPerGram = (cnyPerOunce / 31.1035).toFixed(2); // 转换为克
          // 这个API不提供价格变化
          const priceChange = 0;
          
          return {
            gold: {
              usd: parseFloat(cnyPerGram), // 人民币/克
              usd_24h_change: priceChange
            }
          };
        }
        throw new Error('无效的汇率API响应格式');
      }
    }
  ];
  
  // 依次尝试每个API源
  for (const api of goldApiSources) {
    try {
      console.log(`尝试从${api.name}获取黄金价格...`);
      const response = await makeRequest(api.url, api.options);
      const data = api.handler(response);
      console.log(`${api.name}黄金数据获取成功:`, data);
      return data;
    } catch (error) {
      console.error(`${api.name}获取失败:`, error.message);
      // 继续尝试下一个API
      continue;
    }
  }
  
  // 如果所有API都失败，回退到基于当前汇率计算的国际金价
  try {
    // 尝试获取国际金价 (美元/盎司) 并转换为人民币/克
    console.log('尝试从金价计算API获取数据...');
    // 使用固定的国际金价（实际应用中应该从开放API获取）
    // 这里使用一个合理的近期黄金价格（美元/盎司）
    const goldPriceUSD = 2250; // 美元/盎司
    const exchangeRate = await tryGetExchangeRate(7.2);
    
    // 计算: (美元/盎司) * (人民币/美元) / (克/盎司) = 人民币/克
    const gramsPerOz = 31.1035;
    const goldCnyPerGram = (goldPriceUSD * exchangeRate / gramsPerOz).toFixed(2);
    
    console.log('基于固定金价计算:', goldCnyPerGram, '人民币/克');
    
    return {
      gold: {
        usd: parseFloat(goldCnyPerGram),
        usd_24h_change: 0 // 没有变化数据
      }
    };
  } catch (error) {
    console.error('金价计算失败:', error.message);
  }
  
  // 所有API和计算方法都失败，返回模拟数据
  console.log('所有黄金价格获取方法都失败，使用模拟数据');
  return provideFallbackData('gold');
}

// 尝试获取真实美元兑人民币汇率
async function tryGetExchangeRate(fallbackRate) {
  const exchangeRateAPIs = [
    {
      name: 'ExchangeRatesAPI',
      url: 'https://open.er-api.com/v6/latest/USD',
      handler: (data) => {
        if (data && data.rates && data.rates.CNY) {
          return data.rates.CNY;
        }
        throw new Error('无效的汇率API响应');
      }
    },
    {
      name: 'FloatRates',
      url: 'https://www.floatrates.com/daily/usd.json',
      handler: (data) => {
        if (data && data.cny && data.cny.rate) {
          return data.cny.rate;
        }
        throw new Error('无效的浮动汇率API响应');
      }
    }
  ];
  
  // 尝试所有汇率API
  for (const api of exchangeRateAPIs) {
    try {
      console.log(`尝试从${api.name}获取汇率...`);
      const response = await makeRequest(api.url);
      const rate = api.handler(response);
      console.log(`获取到实时汇率: 1 USD =`, rate, 'CNY');
      return rate;
    } catch (error) {
      console.error(`${api.name}汇率获取失败:`, error.message);
      continue;
    }
  }
  
  console.log('所有汇率API都失败，使用默认汇率:', fallbackRate);
  return fallbackRate; // 使用默认汇率
}

// 通用的HTTP请求函数
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    
    // 添加自定义头信息
    if (options.headers) {
      Object.keys(options.headers).forEach(key => {
        xhr.setRequestHeader(key, options.headers[key]);
      });
    }
    
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error(`解析JSON失败: ${e.message}`));
        }
      } else {
        reject(new Error(`HTTP请求失败，状态码: ${xhr.status}`));
      }
    };
    
    xhr.onerror = function(e) {
      reject(new Error(`网络请求错误: ${e.message || '未知错误'}`));
    };
    
    xhr.ontimeout = function() {
      reject(new Error('请求超时'));
    };
    
    xhr.timeout = 5000; // 5秒超时
    xhr.send();
  });
}

// 提供模拟数据作为最后手段
function provideFallbackData(type, usdToCny = 7.2) {
  // 为了让模拟数据有变化，我们使用随机值
  const getRandomChange = () => (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 2).toFixed(2);
  
  // 不管请求的类型是什么，都同时返回BTC和黄金的数据，防止空值错误
  // 生成60000-70000之间的随机BTC价格
  const btcPrice = Math.floor(60000 + Math.random() * 10000);
  const btcChange = getRandomChange();
  
  // 生成黄金价格 (人民币/克)
  // 国际金价约为2000-2100美元/盎司
  // 1盎司 = 31.1035克
  // 转换为人民币/克
  const goldUsdPerOz = 2000 + Math.random() * 100; // 美元/盎司
  const gramsPerOz = 31.1035;
  
  // 计算: (美元/盎司) * (人民币/美元) / (克/盎司) = 人民币/克
  const goldCnyPerGram = (goldUsdPerOz * usdToCny / gramsPerOz).toFixed(2);
  const goldChange = getRandomChange();
  
  // 返回完整的数据对象，包含两种价格
  return {
    bitcoin: {
      usd: btcPrice,
      usd_24h_change: btcChange
    },
    gold: {
      usd: parseFloat(goldCnyPerGram), // 字段名仍为usd，但实际上是人民币/克
      usd_24h_change: goldChange
    }
  };
} 