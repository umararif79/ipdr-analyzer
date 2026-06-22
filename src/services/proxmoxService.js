import logger from '../../logger.js';
import configService from './configService.js';

/**
 * ProxmoxService handles secure communication with the Proxmox VE API.
 * It manages ticket-based authentication and provides a proxy for cluster data.
 */
class ProxmoxService {
  constructor() {
    this.host = configService.get('PROXMOX_HOST', 'https://10.202.1.201:8006');
    this.username = configService.get('PROXMOX_USERNAME', 'root@pam');
    this.password = configService.get('PROXMOX_PASSWORD', 'Ewo9San7@KKG');

    this.ticket = null;
    this.csrfToken = null;
    this.ticketExpiry = null;

    // Proxmox often uses self-signed certificates
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  /**
   * Authenticates with Proxmox and retrieves a session ticket and CSRF token.
   */
  async authenticate() {
    try {
      logger.info(`[Proxmox] Authenticating as ${this.username}...`);

      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);

      const response = await fetch(`${this.host}/api2/json/access/ticket`, {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        throw new Error(`Proxmox auth failed: ${response.statusText}`);
      }

      const json = await response.json();
      logger.info(`[Proxmox] Auth response body: ${JSON.stringify(json)}`);
      const data = json.data;

      if (!data || !data.ticket) {
        throw new Error('Invalid response from Proxmox auth endpoint');
      }

      this.ticket = data.ticket;

      // The CSRF token is located inside the data object in the response
      this.csrfToken = data.CSRFPreventionToken;

      logger.info(`[Proxmox] Token acquired. CSRF: ${this.csrfToken ? 'Present' : 'Missing'}`);
      // Tickets generally last for a while, but we'll refresh if we hit a 401
      this.ticketExpiry = Date.now() + (60 * 60 * 1000); // 1 hour cache

      logger.info('[Proxmox] Authentication successful. Ticket acquired.');
      return { ticket: this.ticket, csrfToken: this.csrfToken };
    } catch (err) {
      logger.error(`[Proxmox Auth Error] ${err.message}`);
      throw err;
    }
  }

  /**
   * Generic request wrapper that handles authentication and headers.
   */
  async request(endpoint, method = 'GET', body = null, retryCount = 0, forceAuth = false) {
    if (forceAuth || !this.ticket || Date.now() > this.ticketExpiry) {
      await this.authenticate();
    }

    const options = {
      method,
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket}`,
      },
    };

    if (this.csrfToken) {
      options.headers['CSRFPreventionToken'] = this.csrfToken;
    }

    logger.info(`[Proxmox] Request: ${method} ${endpoint} | Ticket: ${this.ticket ? 'Yes' : 'No'} | CSRF: ${this.csrfToken ? 'Yes' : 'No'}`);

    if (body) {
      if (body instanceof URLSearchParams) {
        options.body = body;
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      }
    }

    try {
      const response = await fetch(`${this.host}${endpoint}`, options);

      if (response.status === 401 && retryCount < 1) {
        logger.warn('[Proxmox] Ticket expired, re-authenticating...');
        await this.authenticate();
        // Retry the request once
        return this.request(endpoint, method, body, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(`Proxmox API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      logger.error(`[Proxmox Request Error] ${endpoint}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetches all physical nodes in the cluster.
   */
  async getNodes() {
    const result = await this.request('/api2/json/nodes');
    return result.data;
  }

  /**
   * Fetches all virtual machines and containers in the cluster.
   */
  async getVMs() {
    const result = await this.request('/api2/json/cluster/resources');
    return result.data;
  }

  /**
   * Fetches the 'bras' ipset list from the static LXC container configuration.
   * Static Path: /api2/json/nodes/pve1/lxc/205/firewall/ipset/bras
   */
  async getStaticBrasIpSet() {
    const endpoint = '/api2/json/nodes/pve1/lxc/205/firewall/ipset/bras';
    const result = await this.request(endpoint);
    return result.data;
  }

  /**
   * Adds a new entry to the BRAS ipset.
   */
  async addBras(cidr, platform, deviceName, deviceLabel) {
    const endpoint = '/api2/json/nodes/pve1/lxc/205/firewall/ipset/bras';
    const params = new URLSearchParams();
    params.append('cidr', cidr);
    const comment = `${platform} | ${deviceName} | ${deviceLabel} | ${cidr}`;
    logger.info(`[Proxmox] Saving BRAS with comment: ${comment}`);
    params.append('comment', comment);
    return await this.request(endpoint, 'POST', params, 0, true);
  }

  /**
   * Updates an existing BRAS entry.
   */
  async updateBras(cidr, platform, deviceName, deviceLabel) {
    const endpoint = `/api2/json/nodes/pve1/lxc/205/firewall/ipset/bras/${cidr}`;
    const params = new URLSearchParams();
    const comment = `${platform} | ${deviceName} | ${deviceLabel} | ${cidr}`;
    logger.info(`[Proxmox] Saving BRAS with comment: ${comment}`);
    params.append('comment', comment);
    return await this.request(endpoint, 'PUT', params, 0, true);
  }

  /**
   * Deletes a BRAS entry.
   */
  async deleteBras(cidr) {
    const endpoint = `/api2/json/nodes/pve1/lxc/205/firewall/ipset/bras/${cidr}`;
    return await this.request(endpoint, 'DELETE', null, 0, true);
  }
}

const proxmoxService = new ProxmoxService();
export default proxmoxService;
