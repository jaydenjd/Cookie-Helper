/**
 * Cookie management class that handles all cookie operations
 */
class CookieHandler {
  constructor() {
    this.currentTab = null;
    this.currentUrl = null;
    this.currentDomain = null;
  }

  /**
   * Initialize the handler with current tab information
   */
  async init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
    this.currentUrl = tab.url;
    this.currentDomain = new URL(tab.url).hostname;
  }

  /**
   * Get all cookies for the current domain and its parent domains
   */
  async getAllCookies() {
    try {
      // Get all possible domain variations
      const domain = this.currentDomain;
      const parts = domain.split('.');
      const domains = [];
      
      // Add all possible domain combinations
      for (let i = 0; i < parts.length - 1; i++) {
        const subDomain = parts.slice(i).join('.');
        domains.push(subDomain);
        domains.push('.' + subDomain);
      }

      // Get cookies for all domains in parallel
      const cookiePromises = domains.map(d => 
        chrome.cookies.getAll({ domain: d })
      );
      
      const results = await Promise.all(cookiePromises);
      let allCookies = results.flat();

      // Remove duplicates based on name + domain
      const uniqueCookies = Array.from(
        new Map(
          allCookies.map(cookie => [
            `${cookie.domain}-${cookie.name}`,
            cookie
          ])
        ).values()
      );

      return uniqueCookies;
    } catch (error) {
      console.error('Error getting cookies:', error);
      throw error;
    }
  }

  /**
   * Save a cookie with proper domain handling
   */
  async saveCookie(cookie) {
    try {
      // Ensure proper domain format
      const domain = cookie.domain.startsWith('.') ? 
        cookie.domain : 
        '.' + cookie.domain;

      // Construct proper URL for the cookie
      const scheme = cookie.secure ? 'https:' : 'http:';
      const cookieUrl = `${scheme}//${domain.startsWith('.') ? domain.slice(1) : domain}${cookie.path || '/'}`;

      const cookieData = {
        url: cookieUrl,
        name: cookie.name,
        value: cookie.value,
        domain: domain,
        path: cookie.path || '/',
        secure: cookie.secure || this.currentUrl.startsWith('https:'),
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'lax',
        storeId: "0"
      };

      // Add expiration if not session cookie
      if (!cookie.session && cookie.expirationDate) {
        cookieData.expirationDate = cookie.expirationDate;
      }

      const result = await chrome.cookies.set(cookieData);
      if (!result) {
        throw new Error('Failed to save cookie');
      }
      return result;
    } catch (error) {
      console.error('Error saving cookie:', error);
      throw error;
    }
  }

  /**
   * Remove a cookie with proper domain handling
   */
  async removeCookie(cookie) {
    try {
      const url = `${cookie.secure ? 'https:' : 'http:'}//${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
      await chrome.cookies.remove({
        url: url,
        name: cookie.name,
        storeId: "0"
      });
      return true;
    } catch (error) {
      console.error('Error removing cookie:', error);
      throw error;
    }
  }

  /**
   * Import cookies from various formats
   */
  async importCookies(text, format = 'json') {
    try {
      let cookies = [];
      
      switch (format) {
        case 'json':
          cookies = this.parseJsonCookies(text);
          break;
        case 'header':
          cookies = this.parseHeaderCookies(text);
          break;
        case 'netscape':
          cookies = this.parseNetscapeCookies(text);
          break;
        default:
          throw new Error('Unsupported format');
      }

      // Remove existing cookies first
      const existing = await this.getAllCookies();
      for (const cookie of existing) {
        await this.removeCookie(cookie);
      }

      // Import new cookies
      const results = await Promise.all(
        cookies.map(cookie => this.saveCookie(cookie))
      );

      return {
        total: cookies.length,
        success: results.filter(Boolean).length
      };
    } catch (error) {
      console.error('Error importing cookies:', error);
      throw error;
    }
  }

  /**
   * Export cookies to various formats
   */
  async exportCookies(format = 'json') {
    try {
      const cookies = await this.getAllCookies();
      
      switch (format) {
        case 'json':
          return this.formatJsonCookies(cookies);
        case 'header':
          return this.formatHeaderCookies(cookies);
        case 'netscape':
          return this.formatNetscapeCookies(cookies);
        default:
          throw new Error('Unsupported format');
      }
    } catch (error) {
      console.error('Error exporting cookies:', error);
      throw error;
    }
  }

  // Cookie format parsers
  parseJsonCookies(text) {
    const cookies = JSON.parse(text);
    if (!Array.isArray(cookies)) {
      throw new Error('Invalid JSON format');
    }
    return cookies.map(cookie => ({
      ...cookie,
      domain: cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain,
      path: cookie.path || '/',
      expirationDate: cookie.expirationDate || Math.floor(Date.now() / 1000 + 86400 * 365)
    }));
  }

  parseHeaderCookies(text) {
    return text.split(';').map(pair => {
      const [name, value] = pair.trim().split('=');
      if (!name || !value) {
        throw new Error('Invalid cookie format');
      }
      return {
        name,
        value,
        domain: this.currentDomain.startsWith('.') ? this.currentDomain : '.' + this.currentDomain,
        path: '/',
        secure: this.currentUrl.startsWith('https:'),
        httpOnly: false,
        expirationDate: Math.floor(Date.now() / 1000 + 86400 * 365)
      };
    });
  }

  parseNetscapeCookies(text) {
    return text.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('\t');
        if (parts.length !== 7) {
          throw new Error('Invalid Netscape cookie format');
        }
        const [domain, _, path, secure, expiration, name, value] = parts;
        return {
          name,
          value,
          domain: domain.startsWith('.') ? domain : '.' + domain,
          path: path || '/',
          secure: secure === 'TRUE',
          httpOnly: false,
          expirationDate: parseInt(expiration)
        };
      });
  }

  // Cookie format formatters
  formatJsonCookies(cookies) {
    return JSON.stringify(cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate,
      sameSite: cookie.sameSite
    })), null, 2);
  }

  formatHeaderCookies(cookies) {
    return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }

  formatNetscapeCookies(cookies) {
    return cookies.map(cookie => {
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
      return `${domain}\tTRUE\t${cookie.path || '/'}\t${secure}\t${Math.floor(cookie.expirationDate || (Date.now() / 1000 + 86400))}\t${cookie.name}\t${cookie.value}`;
    }).join('\n');
  }
}

export default CookieHandler; 