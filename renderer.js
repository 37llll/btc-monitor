const priceElement = document.getElementById('price');
const changeElement = document.getElementById('change');
const closeBtn = document.getElementById('close-btn');
const modeIndicator = document.getElementById('mode-indicator');
let container;
let titleElement;

// 处理关闭按钮点击事件
function setupEventListeners() {
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    window.electronAPI.closeWindow();
  });

  // 点击切换BTC/黄金价格 - 全局点击监听
  document.body.addEventListener('click', (e) => {
    // 如果点击的是关闭按钮或其子元素，不处理
    if (e.target === closeBtn || closeBtn.contains(e.target)) {
      return;
    }
    
    console.log('切换显示模式');
    const mode = window.electronAPI.toggleDisplay();
    updateDisplayTitle(mode);
    
    // 强制刷新价格
    fetchPrice(true);
  });

  // 双击启用快速更新模式
  document.body.addEventListener('dblclick', (e) => {
    // 如果点击的是关闭按钮或其子元素，不处理
    if (e.target === closeBtn || closeBtn.contains(e.target)) {
      return;
    }
    
    console.log('切换快速更新模式');
    const isFastMode = window.electronAPI.toggleFastUpdate();
    
    // 更新模式指示器
    updateModeIndicator(window.electronAPI.getCurrentDisplayMode(), isFastMode);
    
    if (isFastMode) {
      showNotification('已启用快速更新模式 (1秒/次)', 2000);
      // 立即开始快速更新
      startFastUpdate();
    } else {
      showNotification('已关闭快速更新模式', 2000);
    }
  });
}

// 显示通知消息
function showNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  // 添加样式
  notification.style.position = 'absolute';
  notification.style.bottom = '20px'; // 调整位置，更容易看到
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = 'rgba(0, 0, 0, 0.9)'; // 更深的背景色
  notification.style.color = 'white';
  notification.style.padding = '8px 15px';
  notification.style.borderRadius = '4px';
  notification.style.fontSize = '12px';
  notification.style.zIndex = '9999';
  notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)'; // 添加阴影
  
  document.body.appendChild(notification);
  
  // 自动移除
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => notification.remove(), 500);
  }, duration);
}

// 更新涨跌幅显示
function updateChangeDisplay(element, change) {
  let changeClass, changePrefix;
  
  if (change > 0) {
    changeClass = 'positive';
    changePrefix = '+';
  } else if (change < 0) {
    changeClass = 'negative';
    changePrefix = '';
  } else {
    changeClass = 'neutral';
    changePrefix = '';
  }
  
  element.className = `change ${changeClass}`;
  element.textContent = `${changePrefix}${change}%`;
}

// 更新显示标题
function updateDisplayTitle(mode) {
  if (!titleElement) {
    console.error('标题元素不存在');
    return;
  }
  
  if (mode === 'btc') {
    titleElement.textContent = 'BTC/USD';
    titleElement.style.color = '#f7931a'; // 比特币橙色
    document.title = 'BTC价格 (美元)';
  } else {
    titleElement.textContent = '金价/克';  // 修改为中文金价/克
    titleElement.style.color = '#ffd700'; // 黄金颜色
    document.title = '黄金价格 (人民币/克)';
  }
  
  // 更新模式指示器
  updateModeIndicator(mode, window.electronAPI.isFastUpdateMode());
}

// 更新模式指示器状态
function updateModeIndicator(mode, isFast) {
  if (!modeIndicator) {
    console.error('模式指示器元素不存在');
    return;
  }
  
  // 清除所有类
  modeIndicator.className = 'mode-indicator';
  
  // 添加模式类
  if (mode === 'btc') {
    modeIndicator.classList.add('btc-mode');
    modeIndicator.setAttribute('data-tooltip', 'BTC模式');
  } else {
    modeIndicator.classList.add('gold-mode');
    modeIndicator.setAttribute('data-tooltip', '黄金模式');
  }
  
  // 添加快速更新类
  if (isFast) {
    modeIndicator.classList.add('fast-update');
  }
  
  console.log('指示器更新:', mode, isFast);
}

// 快速更新模式
function startFastUpdate() {
  // 创建单独的定时器以避免与常规更新冲突
  const fastUpdateTimer = setInterval(() => {
    // 检查是否仍在快速更新模式
    if (!window.electronAPI.isFastUpdateMode()) {
      clearInterval(fastUpdateTimer);
      
      // 更新模式指示器状态
      updateModeIndicator(window.electronAPI.getCurrentDisplayMode(), false);
      
      showNotification('已恢复正常更新间隔', 2000);
      return;
    }
    fetchPrice(true);
  }, 1000);
}

// 获取价格数据并更新UI
async function fetchPrice(forceRefresh = false) {
  try {
    // 如果非强制刷新，只在获取中显示加载状态
    if (forceRefresh) {
      document.getElementById('price').textContent = '加载中...';
    }
    
    const data = await window.electronAPI.getPrice(forceRefresh);
    const mode = window.electronAPI.getCurrentDisplayMode();
    
    console.log('获取到数据:', mode, data);
    
    // 修复数据处理逻辑
    if (data) {
      // 提取BTC和黄金数据
      let btcPrice = 0;
      let btcChange = 0;
      let goldPrice = 0;
      let goldChange = 0;
      
      // 从返回数据中获取BTC价格数据
      if (data.bitcoin) {
        btcPrice = Math.floor(data.bitcoin.usd) || 0;
        btcChange = parseFloat(data.bitcoin.usd_24h_change).toFixed(2) || 0;
      }
      
      // 从返回数据中获取黄金价格数据
      if (data.gold) {
        goldPrice = parseFloat(data.gold.usd).toFixed(2) || 0;
        goldChange = parseFloat(data.gold.usd_24h_change).toFixed(2) || 0;
      }
      
      // 更新UI
      updateUI(btcPrice, btcChange, goldPrice, goldChange);
    } else {
      console.error('数据格式不正确:', data);
      document.getElementById('price').textContent = '数据错误';
      document.getElementById('change').textContent = '--';
      document.getElementById('change').className = 'neutral';
    }
  } catch (error) {
    console.error('获取价格失败:', error);
    document.getElementById('price').textContent = '获取失败';
    document.getElementById('change').textContent = '--';
    document.getElementById('change').className = 'neutral';
  }
}

// 更新UI显示
function updateUI(btcPrice, btcChange, goldPrice, goldChange) {
  console.log('UI更新中...');
  
  // 检查spinner元素是否存在，不存在就创建一个
  let spinner = document.querySelector('.spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.display = 'none';
    document.body.appendChild(spinner);
  } else {
    spinner.style.display = 'none';
  }
  
  // 验证数据完整性
  if (!btcPrice && !goldPrice) {
    console.error('无有效价格数据');
    document.getElementById('price').textContent = '无法获取价格';
    return;
  }
  
  console.log('收到价格数据:', btcPrice, btcChange, goldPrice, goldChange);
  
  const priceElement = document.getElementById('price');
  const changeElement = document.getElementById('change');
  const isGoldMode = window.electronAPI.getCurrentDisplayMode() === 'gold';

  if (isGoldMode) {
    // 显示黄金价格 (人民币/克)
    if (goldPrice) {
      priceElement.textContent = `¥${goldPrice} / 克`;
      updateChangeDisplay(changeElement, goldChange);
    } else {
      priceElement.textContent = '数据加载中...';
      changeElement.textContent = '--';
      changeElement.className = 'neutral';
    }
  } else {
    // 显示比特币价格 (美元)
    if (btcPrice) {
      priceElement.textContent = `$${btcPrice}`;
      updateChangeDisplay(changeElement, btcChange);
    } else {
      priceElement.textContent = '数据加载中...';
      changeElement.textContent = '--';
      changeElement.className = 'neutral';
    }
  }
  
  // 添加更新时间元素（如果不存在）
  let updateTimeElement = document.getElementById('update-time');
  if (!updateTimeElement) {
    updateTimeElement = document.createElement('div');
    updateTimeElement.id = 'update-time';
    updateTimeElement.style.fontSize = '8px';
    updateTimeElement.style.color = '#666';
    updateTimeElement.style.marginTop = '5px';
    updateTimeElement.style.textAlign = 'center';
    container.appendChild(updateTimeElement);
  }
  
  // 显示数据更新时间
  updateTimeElement.textContent = `最后更新: ${new Date().toLocaleTimeString()}`;
  
  // 更新窗口标题以显示当前价格
  updateDisplayTitle(window.electronAPI.getCurrentDisplayMode());
}

// 页面加载后初始化
function initializeApp() {
  console.log('初始化应用...');
  
  // 获取DOM元素
  container = document.getElementById('container');
  
  if (!container) {
    console.error('未找到容器元素');
    return;
  }
  
  // 添加标题元素，显示当前模式
  titleElement = document.createElement('div');
  titleElement.className = 'title';
  titleElement.textContent = 'BTC/USD';
  titleElement.style.color = '#f7931a'; // 比特币橙色
  titleElement.style.fontWeight = 'bold'; // 加粗标题
  titleElement.style.fontSize = '14px'; // 稍微增大字号
  
  // 插入标题元素
  container.insertBefore(titleElement, container.firstChild);
  
  // 设置事件监听器
  setupEventListeners();
  
  // 确保模式指示器正确初始化
  const currentMode = window.electronAPI.getCurrentDisplayMode() || 'btc';
  const isFastMode = window.electronAPI.isFastUpdateMode() || false;
  
  console.log('当前模式:', currentMode, '快速更新:', isFastMode);
  
  if (modeIndicator) {
    // 强制更新模式指示器
    modeIndicator.className = 'mode-indicator';
    if (currentMode === 'btc') {
      modeIndicator.classList.add('btc-mode');
      modeIndicator.setAttribute('data-tooltip', 'BTC模式');
    } else {
      modeIndicator.classList.add('gold-mode');
      modeIndicator.setAttribute('data-tooltip', '黄金模式');
    }
    
    if (isFastMode) {
      modeIndicator.classList.add('fast-update');
      // 启动快速更新
      startFastUpdate();
    }
    
    console.log('模式指示器初始化完成');
  } else {
    console.error('未找到模式指示器元素');
  }
  
  // 立即获取价格
  fetchPrice(true);
  
  // 创建调试按钮
  createDebugButtons();
}

// 创建调试按钮用于测试功能
function createDebugButtons() {
  const debugContainer = document.createElement('div');
  debugContainer.style.position = 'absolute';
  debugContainer.style.bottom = '15px';
  debugContainer.style.right = '5px';
  debugContainer.style.display = 'flex';
  debugContainer.style.gap = '5px';
  debugContainer.style.zIndex = '999';
  debugContainer.style.webkitAppRegion = 'no-drag';
  
  // 切换模式按钮
  const toggleModeBtn = document.createElement('div');
  toggleModeBtn.textContent = '切换';
  toggleModeBtn.style.fontSize = '8px';
  toggleModeBtn.style.padding = '2px 4px';
  toggleModeBtn.style.backgroundColor = 'rgba(100,100,100,0.7)';
  toggleModeBtn.style.borderRadius = '2px';
  toggleModeBtn.style.cursor = 'pointer';
  toggleModeBtn.style.webkitAppRegion = 'no-drag';
  
  toggleModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = window.electronAPI.toggleDisplay();
    updateDisplayTitle(mode);
    fetchPrice(true);
  });
  
  // 快速更新按钮
  const fastUpdateBtn = document.createElement('div');
  fastUpdateBtn.textContent = '快速';
  fastUpdateBtn.style.fontSize = '8px';
  fastUpdateBtn.style.padding = '2px 4px';
  fastUpdateBtn.style.backgroundColor = 'rgba(100,100,100,0.7)';
  fastUpdateBtn.style.borderRadius = '2px';
  fastUpdateBtn.style.cursor = 'pointer';
  fastUpdateBtn.style.webkitAppRegion = 'no-drag';
  
  fastUpdateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isFastMode = window.electronAPI.toggleFastUpdate();
    if (isFastMode) {
      startFastUpdate();
    }
    updateModeIndicator(window.electronAPI.getCurrentDisplayMode(), isFastMode);
  });
  
  debugContainer.appendChild(toggleModeBtn);
  debugContainer.appendChild(fastUpdateBtn);
  document.body.appendChild(debugContainer);
}

// 页面加载后执行初始化
document.addEventListener('DOMContentLoaded', initializeApp);

// 定时更新价格 (每30秒)
setInterval(() => {
  // 如果不在快速更新模式，才执行常规更新
  if (!window.electronAPI.isFastUpdateMode()) {
    fetchPrice();
  }
}, 30000); 