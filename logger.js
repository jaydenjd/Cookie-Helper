/**
 * Cookie Helper 日志系统
 * 提供简洁美观的日志输出功能
 */

class CookieLogger {
  constructor(moduleName = 'CookieHelper') {
    this.moduleName = moduleName;
    this.isDev = chrome.runtime.getManifest().version.includes('dev') || false;
    this.logLevel = this.isDev ? 'debug' : 'info';
    
    // 日志级别
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      success: 4
    };
    
    // 日志样式
    this.styles = {
      debug: {
        icon: '🔍',
        color: '#6B7280',
        bgColor: '#F9FAFB',
        prefix: 'DEBUG'
      },
      info: {
        icon: 'ℹ️',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
        prefix: 'INFO'
      },
      warn: {
        icon: '⚠️',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        prefix: 'WARN'
      },
      error: {
        icon: '❌',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        prefix: 'ERROR'
      },
      success: {
        icon: '✅',
        color: '#10B981',
        bgColor: '#ECFDF5',
        prefix: 'SUCCESS'
      }
    };
  }

  /**
   * 格式化时间戳
   */
  formatTime() {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Shanghai'
    });
  }

  /**
   * 检查是否应该输出日志
   */
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.logLevel];
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, data = null) {
    const style = this.styles[level];
    const time = this.formatTime();
    
    // 基础样式
    const baseStyle = `
      color: ${style.color};
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: ${style.bgColor};
    `;
    
    const moduleStyle = `
      color: #6B7280;
      font-weight: 500;
    `;
    
    const timeStyle = `
      color: #9CA3AF;
      font-size: 0.85em;
    `;

    return {
      format: `%c${style.icon} ${style.prefix}%c [${this.moduleName}] %c${time}%c ${message}`,
      styles: [baseStyle, moduleStyle, timeStyle, 'color: inherit;'],
      data: data
    };
  }

  /**
   * 输出日志
   */
  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, data);
    
    if (data !== null) {
      console.log(formatted.format, ...formatted.styles, '\n📦 数据:', data);
    } else {
      console.log(formatted.format, ...formatted.styles);
    }
  }

  /**
   * 调试日志
   */
  debug(message, data = null) {
    this.log('debug', message, data);
  }

  /**
   * 信息日志
   */
  info(message, data = null) {
    this.log('info', message, data);
  }

  /**
   * 警告日志
   */
  warn(message, data = null) {
    this.log('warn', message, data);
  }

  /**
   * 错误日志
   */
  error(message, error = null) {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error;
    
    this.log('error', message, errorData);
  }

  /**
   * 成功日志
   */
  success(message, data = null) {
    this.log('success', message, data);
  }

  /**
   * 分组日志开始
   */
  group(title, level = 'info') {
    if (!this.shouldLog(level)) return;
    
    const style = this.styles[level];
    console.group(`${style.icon} ${title}`);
  }

  /**
   * 分组日志结束
   */
  groupEnd() {
    console.groupEnd();
  }

  /**
   * 表格日志
   */
  table(data, title = null) {
    if (!this.shouldLog('info')) return;
    
    if (title) {
      this.info(title);
    }
    console.table(data);
  }

  /**
   * 性能计时开始
   */
  time(label) {
    if (!this.shouldLog('debug')) return;
    console.time(`⏱️ ${label}`);
  }

  /**
   * 性能计时结束
   */
  timeEnd(label) {
    if (!this.shouldLog('debug')) return;
    console.timeEnd(`⏱️ ${label}`);
  }

  /**
   * 设置日志级别
   */
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.logLevel = level;
      this.info(`日志级别已设置为: ${level.toUpperCase()}`);
    } else {
      this.warn(`无效的日志级别: ${level}`);
    }
  }

  /**
   * 创建子日志器
   */
  child(moduleName) {
    return new CookieLogger(`${this.moduleName}:${moduleName}`);
  }
}

// 创建全局日志器实例
const logger = new CookieLogger();

// 导出日志器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CookieLogger, logger };
} else if (typeof window !== 'undefined') {
  window.CookieLogger = CookieLogger;
  window.logger = logger;
} 