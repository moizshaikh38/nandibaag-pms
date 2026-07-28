const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const BaileysAuth = require('../models/BaileysAuth');
const logger = require('../config/logger');

/**
 * Custom MongoDB Atlas Auth State Adapter for Baileys Multi-Device.
 * Stores all session credentials and signal keys in MongoDB Atlas.
 * Solves Render ephemeral container disk wipes completely!
 */
async function useMongoAuthState(sessionId) {
  const readData = async (keyId) => {
    try {
      const doc = await BaileysAuth.findOne({ sessionId, keyId }).lean();
      if (doc && doc.data) {
        return JSON.parse(doc.data, BufferJSON.reviver);
      }
    } catch (err) {
      logger.error(`[MongoAuthState] Read error for ${sessionId}/${keyId}: ${err.message}`);
    }
    return null;
  };

  const writeData = async (keyId, data) => {
    try {
      if (data === null || data === undefined) {
        await BaileysAuth.deleteOne({ sessionId, keyId });
      } else {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await BaileysAuth.updateOne(
          { sessionId, keyId },
          { $set: { data: serialized } },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.error(`[MongoAuthState] Write error for ${sessionId}/${keyId}: ${err.message}`);
    }
  };

  const deleteSession = async () => {
    try {
      await BaileysAuth.deleteMany({ sessionId });
      logger.info(`[MongoAuthState] Deleted all DB auth keys for session: ${sessionId}`);
    } catch (err) {
      logger.error(`[MongoAuthState] Delete error for ${sessionId}: ${err.message}`);
    }
  };

  const existingCreds = await readData('creds');
  const creds = existingCreds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value !== null && value !== undefined) {
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              tasks.push(writeData(keyId, value));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData('creds', creds),
    deleteSession
  };
}

module.exports = useMongoAuthState;
