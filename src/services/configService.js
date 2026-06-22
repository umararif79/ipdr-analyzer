import db from '../../localdb.js';
import logger from '../../logger.js';

/**
 * ConfigService manages application secrets and settings stored in the localdb.
 * It implements a simple memory cache to minimize disk I/O.
 */
class ConfigService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * Loads all settings from the system_settings table into memory.
   */
  async initialize() {
    try {
      const settings = db.prepare('SELECT key, value FROM system_settings').all();
      settings.forEach(s => {
        this.cache.set(s.key, s.value);
      });
      this.initialized = true;
      logger.info(`[ConfigService] Initialized. Loaded ${settings.length} settings from DB.`);
    } catch (err) {
      logger.error(`[ConfigService] Initialization failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Retrieves a secret or setting by key.
   * @param {string} key The setting key (e.g., 'JWT_SECRET')
   * @param {any} fallback Value to return if the key is not found.
   */
  get(key, fallback = null) {
    if (!this.initialized) {
      logger.warn(`[ConfigService] get() called before initialize(). Attempting synchronous fetch.`);
      try {
        const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
        return row ? row.value : fallback;
      } catch (err) {
        logger.error(`[ConfigService] Sync fetch failed for ${key}: ${err.message}`);
        return fallback;
      }
    }
    return this.cache.get(key) || fallback;
  }

  /**
   * Updates a secret or setting in the DB and cache.
   */
  async set(key, value) {
    try {
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)')
        .run(key, String(value));
      this.cache.set(key, String(value));
      logger.info(`[ConfigService] Updated setting: ${key}`);
    } catch (err) {
      logger.error(`[ConfigService] Failed to set ${key}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Clears the memory cache and re-reads from DB.
   */
  async refresh() {
    this.cache.clear();
    await this.initialize();
  }
}

const configService = new ConfigService();
export default configService;
