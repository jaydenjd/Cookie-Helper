// 存储定时器的映射表
const refreshTimers = new Map();

// 监听配置更新消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateConfig') {
    const { hostname, config, immediate } = message;
    console.log('Received config update for', hostname, ':', config, 'immediate:', immediate);
    
    // 如果是立即生效的更新，先执行一次上报
    if (immediate && config.enabled) {
      console.log('Immediate update requested, executing report now');
      executeReport(hostname, config);
    }
    
    updateTimer(hostname, config);
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const hostname = new URL(tab.url).hostname;
      const result = await chrome.storage.local.get(hostname);
      console.log('Tab updated, loaded config for', hostname, ':', result[hostname]);
      
      if (result[hostname] && result[hostname].enabled) {
        updateTimer(hostname, result[hostname]);
      }
    } catch (error) {
      console.error('Error handling tab update:', error);
    }
  }
});

// 执行上报
async function executeReport(hostname, config) {
  try {
    // 查找匹配的标签页
    const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
    console.log('Found', tabs.length, 'matching tabs for', hostname);
    
    for (const tab of tabs) {
      console.log('Processing tab:', tab.url);
      
      // 获取 Cookie
      const cookies = await chrome.cookies.getAll({ url: tab.url });
      console.log('Found', cookies.length, 'cookies for', tab.url);
      
      const cookieData = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate
      }));

      // 上报 Cookie 数据
      if (config.reportUrl) {
        try {
          console.log('Sending cookies to:', config.reportUrl);
          const reportData = {
            url: tab.url,
            cookies: cookieData,
            timestamp: new Date().toISOString(),
            authorization: config.authorization
          };
          console.log('Report data:', reportData);

          const response = await fetch(config.reportUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(reportData)
          });

          const responseText = await response.text();
          console.log('Server response:', response.status, responseText);

          if (!response.ok) {
            console.error('Cookie上报失败:', responseText);
          } else {
            console.log('Cookie上报成功:', {
              url: tab.url,
              cookieCount: cookieData.length,
              response: responseText
            });
          }
        } catch (error) {
          console.error('Cookie上报出错:', error);
        }
      } else {
        console.warn('No report URL configured');
      }

      // 刷新页面
      console.log('Reloading tab:', tab.url);
      await chrome.tabs.reload(tab.id);
    }
  } catch (error) {
    console.error('执行上报任务出错:', error);
  }
}

// 更新定时器
async function updateTimer(hostname, config) {
  console.log('Updating timer for', hostname, 'with config:', config);

  // 清除现有的定时器
  if (refreshTimers.has(hostname)) {
    console.log('Clearing existing timer for', hostname);
    clearInterval(refreshTimers.get(hostname));
    refreshTimers.delete(hostname);
  }

  // 如果功能已启用，创建新的定时器
  if (config.enabled) {
    console.log('Creating new timer for', hostname, 'with interval:', config.interval, 'seconds');
    
    const timer = setInterval(() => executeReport(hostname, config), config.interval * 1000);
    refreshTimers.set(hostname, timer);
    console.log(`已为 ${hostname} 设置定时器，间隔: ${config.interval}秒`);
  } else {
    console.log(`已停用 ${hostname} 的定时器`);
  }
}

// 监听浏览器启动，恢复所有配置的定时器
chrome.runtime.onStartup.addListener(async () => {
  try {
    console.log('Browser started, restoring timers');
    const configs = await chrome.storage.local.get(null);
    console.log('Loaded all configs:', configs);
    
    for (const [hostname, config] of Object.entries(configs)) {
      if (typeof config === 'object' && config.enabled) {
        console.log('Restoring timer for', hostname);
        updateTimer(hostname, config);
      }
    }
  } catch (error) {
    console.error('Error restoring timers:', error);
  }
});

// 监听安装/更新事件
chrome.runtime.onInstalled.addListener(async () => {
  try {
    console.log('Extension installed/updated, restoring timers');
    const configs = await chrome.storage.local.get(null);
    console.log('Loaded all configs:', configs);
    
    for (const [hostname, config] of Object.entries(configs)) {
      if (typeof config === 'object' && config.enabled) {
        console.log('Restoring timer for', hostname);
        updateTimer(hostname, config);
      }
    }
  } catch (error) {
    console.error('Error restoring timers:', error);
  }
}); 