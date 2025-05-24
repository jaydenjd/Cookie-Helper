document.addEventListener('DOMContentLoaded', async () => {
  const enableSwitch = document.getElementById('enableSwitch');
  const refreshInterval = document.getElementById('refreshInterval');
  const reportUrl = document.getElementById('reportUrl');
  const authorization = document.getElementById('authorization');
  const cookiePreview = document.getElementById('cookiePreview');
  const previewBtn = document.getElementById('previewBtn');
  const saveBtn = document.getElementById('saveBtn');
  const copyBtn = document.getElementById('copyBtn');
  const importBtn = document.getElementById('importBtn');
  const status = document.getElementById('status');
  const formatButtons = document.querySelectorAll('.format-buttons .format-button');
  const importDialog = document.getElementById('importDialog');
  const dialogOverlay = document.getElementById('dialogOverlay');
  const importText = document.getElementById('importText');
  const cancelImport = document.getElementById('cancelImport');
  const confirmImport = document.getElementById('confirmImport');
  const cookieList = document.getElementById('cookieList');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const addCookieBtn = document.getElementById('addCookieBtn');
  const editCookieDialog = document.getElementById('editCookieDialog');
  const addCookieDialog = document.getElementById('addCookieDialog');

  // Edit cookie form elements
  const editCookieName = document.getElementById('editCookieName');
  const editCookieValue = document.getElementById('editCookieValue');
  const editCookieDomain = document.getElementById('editCookieDomain');
  const editCookiePath = document.getElementById('editCookiePath');
  const editCookieExpiration = document.getElementById('editCookieExpiration');
  const editCookieSecure = document.getElementById('editCookieSecure');
  const editCookieHttpOnly = document.getElementById('editCookieHttpOnly');
  const editCookieSameSite = document.getElementById('editCookieSameSite');
  const cancelEdit = document.getElementById('cancelEdit');
  const confirmEdit = document.getElementById('confirmEdit');

  // Add cookie form elements
  const addCookieName = document.getElementById('addCookieName');
  const addCookieValue = document.getElementById('addCookieValue');
  const addCookieDomain = document.getElementById('addCookieDomain');
  const addCookiePath = document.getElementById('addCookiePath');
  const addCookieExpiration = document.getElementById('addCookieExpiration');
  const addCookieSecure = document.getElementById('addCookieSecure');
  const addCookieHttpOnly = document.getElementById('addCookieHttpOnly');
  const cancelAdd = document.getElementById('cancelAdd');
  const confirmAdd = document.getElementById('confirmAdd');

  let currentFormat = 'json';
  let currentCookies = [];
  let editingCookie = null;

  // 获取当前标签页的URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = new URL(tab.url).hostname;
  const tabUrl = tab.url;

  // 设置默认值
  const defaultConfig = {
    enabled: false,
    interval: 60,
    reportUrl: 'http://localhost:8000/api/cookies',
    authorization: ''
  };

  // 加载保存的配置
  const result = await chrome.storage.local.get(hostname);
  const currentConfig = result[hostname] || defaultConfig;

  // 应用配置到界面
  enableSwitch.checked = currentConfig.enabled;
  refreshInterval.value = currentConfig.interval;
  reportUrl.value = currentConfig.reportUrl;
  authorization.value = currentConfig.authorization || '';

  // 格式化函数
  const formatters = {
    json: (cookies) => {
      return JSON.stringify(cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate || Math.floor(Date.now() / 1000 + 86400 * 365),
        sameSite: cookie.sameSite || 'lax'
      })), null, 2);
    },
    header: (cookies) => {
      return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    },
    netscape: (cookies) => {
      return cookies.map(cookie => {
        const secure = cookie.secure ? 'TRUE' : 'FALSE';
        const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
        return `${domain}\tTRUE\t${cookie.path || '/'}\t${secure}\t${Math.floor(cookie.expirationDate || (Date.now() / 1000 + 86400))}\t${cookie.name}\t${cookie.value}`;
      }).join('\n');
    }
  };

  // 获取当前页面的所有cookie
  const getAllCookies = async () => {
    try {
      // 获取当前标签页信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      const domain = url.hostname;
      const parts = domain.split('.');
      const domains = new Set();
      
      // 添加所有可能的域名组合
      for (let i = 0; i < parts.length - 1; i++) {
        const subDomain = parts.slice(i).join('.');
        domains.add(subDomain);
        domains.add('.' + subDomain);
      }

      // 获取所有 cookies
      let allCookies = await chrome.cookies.getAll({
        url: tab.url
      });

      // 如果在隐私模式下，额外获取所有相关域名的 cookies
      if (tab.incognito) {
        const domainCookies = await Promise.all(
          Array.from(domains).map(d => chrome.cookies.getAll({ domain: d }))
        );
        allCookies = [...allCookies, ...domainCookies.flat()];
      }

      // 使用 domain + name + path 去重
      const uniqueCookies = Array.from(
        new Map(
          allCookies.map(cookie => [
            `${cookie.domain}-${cookie.name}-${cookie.path}`,
            cookie
          ])
        ).values()
      );

      return uniqueCookies;
    } catch (error) {
      console.error('Error getting cookies:', error);
      showStatus('获取Cookie失败: ' + error.message, 'error');
      return [];
    }
  };

  // 更新预览内容
  const updatePreview = (cookies, format) => {
    currentCookies = cookies;
    cookiePreview.value = formatters[format](cookies);
  };

  // 预览Cookie按钮点击事件
  previewBtn.addEventListener('click', async () => {
    const restore = addButtonFeedback(previewBtn);
    try {
      const cookieData = await getAllCookies();
      updatePreview(cookieData, currentFormat);
      showStatus('已更新 Cookie 预览', 'success');
    } catch (error) {
      showStatus('获取Cookie失败: ' + error.message, 'error');
    } finally {
      restore();
    }
  });

  // 复制按钮点击事件
  copyBtn.addEventListener('click', async () => {
    const restore = addButtonFeedback(copyBtn);
    try {
      await navigator.clipboard.writeText(cookiePreview.value);
      showStatus('已复制到剪贴板', 'success');
    } catch (error) {
      showStatus('复制失败: ' + error.message, 'error');
    } finally {
      restore();
    }
  });

  // 导入按钮点击事件
  importBtn.addEventListener('click', () => {
    importDialog.classList.remove('hidden');
    dialogOverlay.classList.remove('hidden');
  });

  // 取消导入
  cancelImport.addEventListener('click', () => {
    importDialog.classList.add('hidden');
    dialogOverlay.classList.add('hidden');
    importText.value = '';
  });

  // 渲染 Cookie 列表
  const renderCookieList = (cookies) => {
    cookieList.innerHTML = '';
    cookies.forEach(cookie => {
      const item = document.createElement('div');
      item.className = 'cookie-item';
      item.innerHTML = `
        <div class="cookie-info">
          <div class="cookie-name">${cookie.name}</div>
          <div class="cookie-value">${cookie.value}</div>
        </div>
        <div class="cookie-actions">
          <button class="action-button edit-button" data-name="${cookie.name}">编辑</button>
          <button class="action-button delete-button" data-name="${cookie.name}">删除</button>
        </div>
      `;
      cookieList.appendChild(item);
    });

    // 添加事件监听器
    cookieList.querySelectorAll('.edit-button').forEach(button => {
      button.addEventListener('click', () => {
        const cookieName = button.dataset.name;
        const cookie = currentCookies.find(c => c.name === cookieName);
        if (cookie) {
          editingCookie = cookie;
          showEditDialog(cookie);
        }
      });
    });

    cookieList.querySelectorAll('.delete-button').forEach(button => {
      button.addEventListener('click', async () => {
        const cookieName = button.dataset.name;
        await deleteCookie(cookieName);
      });
    });
  };

  // 显示编辑对话框
  const showEditDialog = (cookie) => {
    editingCookie = cookie;
    
    // 使用原始值，不做预处理
    editCookieName.value = cookie.name;
    editCookieValue.value = cookie.value;
    editCookieDomain.value = cookie.domain;
    editCookiePath.value = cookie.path || '/';
    editCookieExpiration.value = cookie.expirationDate || Math.floor(Date.now() / 1000 + 86400);
    editCookieSecure.checked = cookie.secure;
    editCookieHttpOnly.checked = cookie.httpOnly;
    editCookieSameSite.value = cookie.sameSite || "lax";

    editCookieDialog.classList.remove('hidden');
    dialogOverlay.classList.remove('hidden');
  };

  // 显示添加对话框
  const showAddDialog = () => {
    addCookieName.value = '';
    addCookieValue.value = '';
    addCookieDomain.value = hostname;
    addCookiePath.value = '/';
    addCookieExpiration.value = Math.floor(Date.now() / 1000 + 86400);
    addCookieSecure.checked = tabUrl.startsWith('https:');
    addCookieHttpOnly.checked = false;

    addCookieDialog.classList.remove('hidden');
    dialogOverlay.classList.remove('hidden');
  };

  // 删除单个 Cookie
  const deleteCookie = async (name, customCookie = null) => {
    try {
      const cookie = customCookie || currentCookies.find(c => c.name === name);
      if (cookie) {
        // 获取当前标签页信息
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 获取所有可能的域名变体
        const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const domainParts = domain.split('.');
        const possibleDomains = new Set();
        
        // 从最具体到最一般的域名
        for (let i = 0; i < domainParts.length - 1; i++) {
          const subDomain = domainParts.slice(i).join('.');
          possibleDomains.add(subDomain);
          possibleDomains.add('.' + subDomain);
        }

        // 尝试所有可能的路径
        const paths = new Set([cookie.path || '/', '/']);

        // 尝试删除所有可能的组合
        const deletePromises = [];
        for (const domain of possibleDomains) {
          for (const path of paths) {
            // 尝试 http 和 https 协议
            const protocols = ['http:', 'https:'];
            for (const protocol of protocols) {
              const urlToDelete = `${protocol}//${domain}${path}`;
              deletePromises.push(
                chrome.cookies.remove({
                  url: urlToDelete,
                  name: cookie.name,
                  storeId: tab.incognito ? "1" : "0"
                }).catch(() => {})
              );
            }
          }
        }

        // 特别处理当前页面的 URL
        deletePromises.push(
          chrome.cookies.remove({
            url: tab.url,
            name: cookie.name,
            storeId: tab.incognito ? "1" : "0"
          }).catch(() => {})
        );

        await Promise.all(deletePromises);

        if (!customCookie) {
          // 在隐私模式下，等待一小段时间确保删除生效
          if (tab.incognito) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // 刷新页面以确保 cookie 被删除
          await chrome.tabs.reload(tab.id, { bypassCache: true });

          // 等待页面加载完成
          await new Promise(resolve => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
              if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            });
          });

          // 重新获取最新的 cookies
          const updatedCookies = await getAllCookies();
          currentCookies = updatedCookies;
          updatePreview(updatedCookies, currentFormat);
          renderCookieList(updatedCookies);

          showStatus(`已删除 Cookie: ${name}`, 'success');
        }
      }
    } catch (error) {
      console.error('Error deleting cookie:', error);
      showStatus('删除 Cookie 失败: ' + error.message, 'error');
      throw error;
    }
  };

  // 删除所有按钮处理
  clearAllBtn.addEventListener('click', async () => {
    const restore = addButtonFeedback(clearAllBtn);
    try {
      const confirmed = confirm('确定要删除所有 Cookie 吗？');
      if (!confirmed) {
        restore();
        return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const totalCookies = currentCookies.length;

      // 删除所有 cookies
      await Promise.all(currentCookies.map(cookie => deleteCookie(cookie.name)));

      // 在隐私模式下，等待一小段时间确保删除生效
      if (tab.incognito) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 刷新页面以确保所有 cookies 被删除
      await chrome.tabs.reload(tab.id, { bypassCache: true });

      // 等待页面加载完成
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      // 重新获取最新的 cookies
      const remainingCookies = await getAllCookies();
      updatePreview(remainingCookies, currentFormat);
      renderCookieList(remainingCookies);
      
      showStatus(`已删除所有 Cookies (${totalCookies}个)`, 'success');
    } catch (error) {
      console.error('Error clearing cookies:', error);
      showStatus('删除 Cookies 失败: ' + error.message, 'error');
    } finally {
      restore();
    }
  });

  // 添加 Cookie 按钮
  addCookieBtn.addEventListener('click', showAddDialog);

  // 确认编辑
  confirmEdit.addEventListener('click', async () => {
    try {
      if (!editingCookie) {
        throw new Error('No cookie is being edited');
      }

      // 获取当前标签页信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);

      const newCookie = {
        name: editCookieName.value.trim(),
        value: editCookieValue.value,
        domain: editCookieDomain.value.trim(),
        path: editCookiePath.value.trim() || '/',
        secure: editCookieSecure.checked,
        httpOnly: editCookieHttpOnly.checked,
        sameSite: editCookieSameSite.value,
        expirationDate: parseInt(editCookieExpiration.value) || Math.floor(Date.now() / 1000 + 86400)
      };

      // 验证必填字段
      if (!newCookie.name || !newCookie.domain) {
        throw new Error('Cookie name and domain are required');
      }

      // 确保域名格式正确
      if (!newCookie.domain.startsWith('.') && newCookie.domain.includes('.')) {
        newCookie.domain = '.' + newCookie.domain;
      }

      // 如果是编辑现有的 cookie，先删除旧的
      if (editingCookie.name !== newCookie.name || 
          editingCookie.domain !== newCookie.domain || 
          editingCookie.path !== newCookie.path) {
        try {
          const oldCookieDomain = editingCookie.domain.startsWith('.') ? 
            editingCookie.domain.slice(1) : editingCookie.domain;
          const oldUrl = `${editingCookie.secure ? 'https:' : 'http:'}//${oldCookieDomain}${editingCookie.path}`;
          
          await chrome.cookies.remove({
            url: oldUrl,
            name: editingCookie.name,
            storeId: tab.incognito ? "1" : "0"
          });
        } catch (error) {
          console.warn('删除旧 cookie 时出现警告:', error);
        }
      }

      // 构建设置 cookie 的参数
      const cookieDomain = newCookie.domain.startsWith('.') ? 
        newCookie.domain.slice(1) : newCookie.domain;
      const cookieUrl = `${newCookie.secure ? 'https:' : 'http:'}//${cookieDomain}${newCookie.path}`;

      const setCookieParams = {
        url: cookieUrl,
        name: newCookie.name,
        value: newCookie.value,
        domain: newCookie.domain,
        path: newCookie.path,
        secure: newCookie.secure,
        httpOnly: newCookie.httpOnly,
        storeId: tab.incognito ? "1" : "0"
      };

      // 只有在非会话 cookie 时才设置过期时间
      if (newCookie.expirationDate) {
        setCookieParams.expirationDate = newCookie.expirationDate;
      }

      // 处理 sameSite 属性
      // Chrome 要求 sameSite 必须是以下值之一: "unspecified", "no_restriction", "lax", "strict"
      const sameSiteValue = newCookie.sameSite.toLowerCase();
      switch (sameSiteValue) {
        case 'none':
          if (!newCookie.secure) {
            throw new Error('SameSite=None requires Secure attribute');
          }
          setCookieParams.sameSite = 'no_restriction';
          break;
        case 'lax':
          setCookieParams.sameSite = 'lax';
          break;
        case 'strict':
          setCookieParams.sameSite = 'strict';
          break;
        default:
          setCookieParams.sameSite = 'unspecified';
      }

      // 保存新的 cookie
      const result = await chrome.cookies.set(setCookieParams);

      if (!result) {
        throw new Error('Failed to save cookie');
      }

      editCookieDialog.classList.add('hidden');
      dialogOverlay.classList.add('hidden');
      editingCookie = null;

      showStatus('Cookie 已更新', 'success');

      // 重新获取最新的 cookies
      const updatedCookies = await getAllCookies();
      currentCookies = updatedCookies;
      updatePreview(updatedCookies, currentFormat);
      renderCookieList(updatedCookies);

      // 如果在隐私模式下，刷新页面
      if (tab.incognito) {
        await chrome.tabs.reload(tab.id, { bypassCache: true });
      }
    } catch (error) {
      console.error('Error updating cookie:', error);
      showStatus('更新 Cookie 失败: ' + error.message, 'error');
    }
  });

  // 取消编辑
  cancelEdit.addEventListener('click', () => {
    editCookieDialog.classList.add('hidden');
    dialogOverlay.classList.add('hidden');
    editingCookie = null;
  });

  // 取消添加
  cancelAdd.addEventListener('click', () => {
    addCookieDialog.classList.add('hidden');
    dialogOverlay.classList.add('hidden');
  });

  // 确认添加
  confirmAdd.addEventListener('click', async () => {
    try {
      const cookie = {
        name: addCookieName.value,
        value: addCookieValue.value,
        domain: addCookieDomain.value,
        path: addCookiePath.value,
        secure: addCookieSecure.checked,
        httpOnly: addCookieHttpOnly.checked,
        expirationDate: parseInt(addCookieExpiration.value),
        sameSite: "lax"
      };

      const url = `${cookie.secure ? 'https:' : 'http:'}//${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
      await chrome.cookies.set({
        url: url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure || tabUrl.startsWith('https:'),
        httpOnly: cookie.httpOnly || false,
        expirationDate: cookie.expirationDate || Math.floor(Date.now() / 1000 + 86400 * 365),
        storeId: "0",
        sameSite: cookie.sameSite || "lax"
      });

      addCookieDialog.classList.add('hidden');
      dialogOverlay.classList.add('hidden');

      showStatus('Cookie 已添加', 'success');
      const updatedCookies = await getAllCookies();
      updatePreview(updatedCookies, currentFormat);
      renderCookieList(updatedCookies);
    } catch (error) {
      console.error('Error adding cookie:', error);
      showStatus('添加 Cookie 失败: ' + error.message, 'error');
    }
  });

  // 格式切换按钮点击事件
  formatButtons.forEach(button => {
    button.addEventListener('click', () => {
      formatButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentFormat = button.dataset.format;
      if (currentCookies.length > 0) {
        updatePreview(currentCookies, currentFormat);
      }
    });
  });

  // 导入对话框中的格式切换按钮
  importDialog.querySelectorAll('.format-button').forEach(button => {
    button.addEventListener('click', () => {
      importDialog.querySelectorAll('.format-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
    });
  });

  // 导入对话框中的确认导入
  confirmImport.addEventListener('click', async () => {
    try {
      const importFormat = importDialog.querySelector('.format-button.active').dataset.format;
      const text = importText.value.trim();
      let cookies = [];

      // 解析导入的 cookies
      switch (importFormat) {
        case 'json':
          try {
            cookies = JSON.parse(text);
            if (!Array.isArray(cookies)) {
              // 处理单个 cookie 对象的情况
              if (typeof cookies === 'object' && cookies !== null) {
                cookies = [cookies];
              } else {
                throw new Error('Invalid JSON format');
              }
            }

            // 规范化 JSON 格式的 cookie
            cookies = cookies.map(cookie => {
              // 处理不同工具导出的格式差异
              const normalizedCookie = {
                name: cookie.name || cookie.key || '',
                value: cookie.value || '',
                domain: cookie.domain || cookie.host || hostname,
                path: cookie.path || '/',
                secure: typeof cookie.secure === 'boolean' ? cookie.secure : cookie.isSecure || false,
                httpOnly: typeof cookie.httpOnly === 'boolean' ? cookie.httpOnly : cookie.isHttpOnly || false,
                sameSite: cookie.sameSite || cookie.samesite || 'Lax',
                expirationDate: cookie.expirationDate || cookie.expires || cookie.expiry || Math.floor(Date.now() / 1000 + 86400 * 365)
              };

              // 处理过期时间格式
              if (typeof normalizedCookie.expirationDate === 'string') {
                const date = new Date(normalizedCookie.expirationDate);
                if (!isNaN(date.getTime())) {
                  normalizedCookie.expirationDate = Math.floor(date.getTime() / 1000);
                }
              }

              // 确保域名格式正确
              if (!normalizedCookie.domain.startsWith('.') && normalizedCookie.domain.includes('.')) {
                normalizedCookie.domain = '.' + normalizedCookie.domain;
              }

              return normalizedCookie;
            });
          } catch (err) {
            throw new Error('Invalid JSON format: ' + err.message);
          }
          break;
        case 'header':
          try {
            // 支持多行 header 格式
            const lines = text.split(/[\r\n]+/).filter(line => line.trim());
            cookies = [];
            
            for (const line of lines) {
              const pairs = line.split(';').map(pair => pair.trim());
              for (const pair of pairs) {
                if (!pair) continue;
                
                const firstEquals = pair.indexOf('=');
                if (firstEquals === -1) continue;
                
                const name = pair.slice(0, firstEquals).trim();
                const value = pair.slice(firstEquals + 1).trim();
                
                if (!name) continue;
                
                cookies.push({
                  name,
                  value,
                  domain: hostname,
                  path: '/',
                  secure: tabUrl.startsWith('https:'),
                  httpOnly: false,
                  sameSite: 'Lax',
                  expirationDate: Math.floor(Date.now() / 1000 + 86400 * 365)
                });
              }
            }
          } catch (err) {
            throw new Error('Invalid header format: ' + err.message);
          }
          break;
        case 'netscape':
          try {
            cookies = text.split(/[\r\n]+/)
              .map(line => line.trim())
              .filter(line => line && !line.startsWith('#'))
              .map(line => {
                const parts = line.split(/\s+/);
                if (parts.length < 7) {
                  throw new Error('Invalid Netscape format');
                }

                // 处理带引号的值
                let [domain, hostOnly, path, secure, expiration, name, ...valueParts] = parts;
                const value = valueParts.join(' ').replace(/^"(.*)"$/, '$1');

                return {
                  name,
                  value,
                  domain: domain.startsWith('.') ? domain : '.' + domain,
                  path: path || '/',
                  secure: secure.toUpperCase() === 'TRUE',
                  httpOnly: false,
                  sameSite: 'Lax',
                  expirationDate: parseInt(expiration) || Math.floor(Date.now() / 1000 + 86400 * 365)
                };
              });
          } catch (err) {
            throw new Error('Invalid Netscape format: ' + err.message);
          }
          break;
        default:
          throw new Error('Unsupported format');
      }

      // 验证必要的字段
      cookies = cookies.filter(cookie => {
        return cookie.name && cookie.name.trim() && 
               typeof cookie.value !== 'undefined' &&
               cookie.domain;
      });

      if (!cookies.length) {
        throw new Error('No valid cookies found in input');
      }

      let successCount = 0;
      const errors = [];
      
      // 批量导入所有 cookies
      const importPromises = cookies.map(cookie => {
        try {
          // 构建 URL
          const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const url = `${cookie.secure ? 'https:' : 'http:'}//${cookieDomain}${cookie.path}`;

          // 返回 Promise
          return chrome.cookies.set({
            url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate,
            storeId: tab.incognito ? "1" : "0"  // 根据当前标签页的隐私模式状态设置正确的 storeId
          }).then(() => {
            successCount++;
          }).catch(err => {
            errors.push(`${cookie.name}: ${err.message}`);
          });
        } catch (err) {
          errors.push(`${cookie.name}: ${err.message}`);
          return Promise.resolve();
        }
      });

      // 等待所有 cookie 导入完成
      await Promise.all(importPromises);

      importDialog.classList.add('hidden');
      dialogOverlay.classList.add('hidden');
      importText.value = '';
      
      const message = `Cookie导入完成 (${successCount}/${cookies.length})${errors.length ? '\n失败: ' + errors.length : ''}`;
      showStatus(message, successCount > 0 ? 'success' : 'error');
      
      // 导入完成后只更新一次显示
      const updatedCookies = await getAllCookies();
      currentCookies = updatedCookies;
      updatePreview(updatedCookies, currentFormat);
      renderCookieList(updatedCookies);

      // 如果在隐私模式下，导入完成后只刷新一次页面
      if (tab.incognito) {
        await chrome.tabs.reload(tab.id);
      }
    } catch (error) {
      console.error('Import error:', error);
      showStatus('导入失败: ' + error.message, 'error');
    }
  });

  // 修改按钮点击反馈
  const addButtonFeedback = (button, originalText) => {
    const text = button.textContent;
    button.textContent = '处理中...';
    button.disabled = true;
    return () => {
      button.textContent = text;
      button.disabled = false;
    };
  };

  // 开关状态改变时自动保存
  enableSwitch.addEventListener('change', async () => {
    const newConfig = {
      enabled: enableSwitch.checked,
      interval: parseInt(refreshInterval.value),
      reportUrl: reportUrl.value,
      authorization: authorization.value
    };

    try {
      await chrome.storage.local.set({ [hostname]: newConfig });
      console.log('Auto-saved config for', hostname, ':', newConfig);

      // 通知后台脚本更新配置
      chrome.runtime.sendMessage({
        type: 'updateConfig',
        hostname: hostname,
        config: newConfig
      });

      showStatus(enableSwitch.checked ? '已启用' : '已禁用', 'success');
    } catch (error) {
      console.error('Auto-save config error:', error);
      showStatus('保存配置失败: ' + error.message, 'error');
    }
  });

  // 刷新间隔改变时自动保存
  refreshInterval.addEventListener('change', async () => {
    const interval = parseInt(refreshInterval.value);
    if (interval < 1) {
      showStatus('刷新间隔必须大于0秒', 'error');
      return;
    }

    const newConfig = {
      enabled: enableSwitch.checked,
      interval: interval,
      reportUrl: reportUrl.value,
      authorization: authorization.value
    };

    try {
      await chrome.storage.local.set({ [hostname]: newConfig });
      console.log('Auto-saved config for', hostname, ':', newConfig);

      // 立即重启定时器以应用新的间隔时间
      chrome.runtime.sendMessage({
        type: 'updateConfig',
        hostname: hostname,
        config: newConfig,
        immediate: true  // 添加标志以指示立即生效
      });

      showStatus(`已更新刷新间隔为 ${interval} 秒，立即生效`, 'success');
    } catch (error) {
      console.error('Auto-save config error:', error);
      showStatus('保存配置失败: ' + error.message, 'error');
    }
  });

  // 授权改变时自动保存
  authorization.addEventListener('change', async () => {
    const newConfig = {
      enabled: enableSwitch.checked,
      interval: parseInt(refreshInterval.value),
      reportUrl: reportUrl.value,
      authorization: authorization.value
    };

    try {
      await chrome.storage.local.set({ [hostname]: newConfig });
      console.log('Auto-saved config for', hostname, ':', newConfig);

      // 立即重启定时器以应用新的授权
      chrome.runtime.sendMessage({
        type: 'updateConfig',
        hostname: hostname,
        config: newConfig,
        immediate: true  // 添加标志以指示立即生效
      });

      showStatus('授权已更新', 'success');
    } catch (error) {
      console.error('Auto-save config error:', error);
      showStatus('保存授权失败: ' + error.message, 'error');
    }
  });

  function showStatus(message, type = 'success') {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    // 使用 requestAnimationFrame 确保过渡动画正常工作
    requestAnimationFrame(() => {
      status.classList.add('visible');
    });
    
    // 3秒后隐藏
    setTimeout(() => {
      status.classList.remove('visible');
      // 等待过渡动画完成后隐藏元素
      setTimeout(() => {
        status.style.display = 'none';
      }, 300); // 与 CSS 过渡时间相匹配
    }, 3000);
  }

  // 初始化时自动预览 cookies
  (async () => {
    const cookieData = await getAllCookies();
    updatePreview(cookieData, currentFormat);
    renderCookieList(cookieData);
    showStatus('已加载当前页面的 Cookies', 'success');
  })();
}); 