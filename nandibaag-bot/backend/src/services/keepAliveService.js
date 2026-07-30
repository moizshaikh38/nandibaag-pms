const https = require('https');
const http = require('http');
const logger = require('../config/logger');

let keepAliveIntervalHandle = null;

/**
 * 30-Second Continuous Self-Ping Service
 * Pings external Render URL every 30 seconds to keep container awake 24/7.
 */
function startKeepAlive(overrideUrl = null) {
  const port = process.env.PORT || 7000;
  const defaultLocal = `http://localhost:${port}/health`;
  const targetUrl = overrideUrl || process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL || defaultLocal;

  const pingUrl = targetUrl.includes('/health') ? targetUrl : (targetUrl.endsWith('/') ? `${targetUrl}health` : `${targetUrl}/health`);
  logger.info(`[KeepAlive] Starting 30-second continuous HTTP ping to: ${pingUrl}`);

  if (keepAliveIntervalHandle) clearInterval(keepAliveIntervalHandle);

  const doPing = () => {
    const client = pingUrl.startsWith('https') ? https : http;
    client.get(pingUrl, (res) => {
      logger.debug(`[KeepAlive] Ping status: ${res.statusCode}`);
    }).on('error', (err) => {
      logger.warn(`[KeepAlive] Ping error: ${err.message}`);
    });
  };

  // Ping immediately then repeat every 30 seconds
  doPing();
  keepAliveIntervalHandle = setInterval(doPing, 30000);
}

module.exports = { startKeepAlive };
