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
  // 获取美元对人民币汇率 (模拟固定汇率，实际应用中应该从API获取)
  const usdToCny = 7.2;
  
  // 使用模拟数据，黄金价格单位为人民币/克
  console.log('使用黄金价格模拟数据 (人民币/克)');
  
  try {
    // 尝试获取真实汇率 (仅作为备选，如果获取失败则使用固定汇率)
    const exchangeRate = await tryGetExchangeRate(usdToCny);
    return provideFallbackData('gold', exchangeRate);
  } catch (error) {
    console.error('获取汇率失败，使用固定汇率:', usdToCny);
    return provideFallbackData('gold', usdToCny);
  }
}

// 尝试获取真实美元兑人民币汇率
async function tryGetExchangeRate(fallbackRate) {
  try {
    // 尝试从公开API获取汇率数据
    const response = await makeRequest('https://open.er-api.com/v6/latest/USD');
    if (response && response.rates && response.rates.CNY) {
      console.log('获取到实时汇率: 1 USD =', response.rates.CNY, 'CNY');
      return response.rates.CNY;
    }
  } catch (error) {
    console.error('获取汇率API失败:', error.message);
  }
  return fallbackRate; // 使用默认汇率
}

// 通用的HTTP请求函数
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    
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
  
  if (type === 'btc') {
    // 生成60000-70000之间的随机BTC价格
    const price = Math.floor(60000 + Math.random() * 10000);
    const change = getRandomChange();
    return {
      bitcoin: {
        usd: price,
        usd_24h_change: change
      },
      gold: null
    };
  } else {
    // 生成黄金价格 (人民币/克)
    // 国际金价约为2000-2100美元/盎司
    // 1盎司 = 31.1035克
    // 转换为人民币/克
    const goldUsdPerOz = 2000 + Math.random() * 100; // 美元/盎司
    const gramsPerOz = 31.1035;
    
    // 计算: (美元/盎司) * (人民币/美元) / (克/盎司) = 人民币/克
    const goldCnyPerGram = (goldUsdPerOz * usdToCny / gramsPerOz).toFixed(2);
    
    const change = getRandomChange();
    return {
      gold: {
        usd: parseFloat(goldCnyPerGram), // 字段名仍为usd，但实际上是人民币/克
        usd_24h_change: change
      },
      bitcoin: null
    };
  }
} 