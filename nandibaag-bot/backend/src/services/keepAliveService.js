const https = require('https');
const http = require('http');
const logger = require('../config/logger');

let keepAliveIntervalHandle = null;

/**
 * 30-Second Continuous Self-Ping Service
 * Pings external Render URL every 30 seconds to keep container awake 24/7.
 */
function startKeepAlive(overrideUrl = null) {
  const targetUrl = overrideUrl || process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
  if (!targetUrl) {
    logger.info('[KeepAlive] RENDER_EXTERNAL_URL not set yet. Will start pinging as soon as URL is configured.');
    return;
  }

  const pingUrl = targetUrl.endsWith('/') ? `${targetUrl}api/availability/public` : `${targetUrl}/api/availability/public`;
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
