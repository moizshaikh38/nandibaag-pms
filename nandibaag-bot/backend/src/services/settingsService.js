/**
 * Settings Service
 * Handles system settings configuration, mass chat mode updates, and audit logging.
 */

const { Settings, Chat, ModeChangeLog } = require('../models');
const logger = require('../config/logger');

/**
 * Normalize chat mode strings
 */
function normalizeMode(mode) {
  if (!mode) return 'ai';
  const m = String(mode).trim().toLowerCase();
  if (m === 'staff' || m === 'human') return 'human';
  if (m === 'auto' || m === 'ai') return 'ai';
  return m;
}

/**
 * Get a specific setting value
 */
async function getSettingValue(key, defaultValue = null) {
  try {
    const settings = await Settings.findOne();
    if (!settings || settings[key] === undefined) return defaultValue;
    return settings[key];
  } catch (err) {
    logger.error(`[SettingsService] Error reading setting ${key}: ${err.message}`);
    return defaultValue;
  }
}

/**
 * Get all system settings
 */
async function getAllSettings() {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await initializeDefaultSettings();
    }
    return settings;
  } catch (err) {
    logger.error(`[SettingsService] Error getting all settings: ${err.message}`);
    throw err;
  }
}

/**
 * Initialize default settings if not exists
 */
async function initializeDefaultSettings() {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({
        globalMode: 'ai',
        defaultModeForNewChats: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true
      });
      await settings.save();
      logger.info('[SettingsService] ✅ Initialized default settings');
    }
    return settings;
  } catch (err) {
    logger.error(`[SettingsService] Error initializing settings: ${err.message}`);
    throw err;
  }
}

/**
 * Update a setting by key
 */
async function updateSetting(key, value, updatedBy = 'Admin') {
  try {
    const update = { [key]: value };
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    logger.info(`[SettingsService] Setting '${key}' updated to '${value}' by ${updatedBy}`);
    return settings;
  } catch (err) {
    logger.error(`[SettingsService] Error updating setting ${key}: ${err.message}`);
    throw err;
  }
}

/**
 * Mass update ALL chats (past + future) to target mode.
 * Preserves all chat histories, messages, and memories.
 * 
 * @param {'ai' | 'staff' | 'human' | 'auto'} newMode
 * @param {string} [updatedBy]
 * @param {string} [notes]
 */
async function massUpdateAllChatMode(newMode, updatedBy = 'Admin', notes = '') {
  try {
    console.log('[Settings:MassUpdate] Starting mass chat mode update');
    console.log('[Settings:MassUpdate] Target mode requested:', newMode);

    if (!['ai', 'staff', 'human', 'auto'].includes(newMode)) {
      throw new Error(`Invalid mode: ${newMode}. Allowed modes: ai, staff, human, auto`);
    }

    const targetDbMode = normalizeMode(newMode); // 'ai' or 'human'

    // STEP 1: GET ALL CHATS FOR DISTRIBUTION STATS
    const allChats = await Chat.find().select('_id customerPhone mode').lean();
    const totalChats = allChats.length;

    console.log('[Settings:MassUpdate] Found', totalChats, 'chats in database');

    // STEP 2: CATEGORIZE CHATS
    let aiChats = 0;
    let staffChats = 0;
    let otherChats = 0;

    allChats.forEach(chat => {
      const m = (chat.mode || '').trim().toLowerCase();
      if (m === 'ai' || m === 'auto') aiChats++;
      else if (m === 'staff' || m === 'human') staffChats++;
      else otherChats++;
    });

    console.log('[Settings:MassUpdate] Current distribution:');
    console.log('[Settings:MassUpdate] - AI mode:', aiChats);
    console.log('[Settings:MassUpdate] - Staff/Human mode:', staffChats);
    console.log('[Settings:MassUpdate] - Other:', otherChats);

    // STEP 3: PERFORM MASS UPDATE ON ALL CHATS
    const updateResult = await Chat.updateMany(
      {}, // Match all chats
      {
        $set: {
          mode: targetDbMode,
          updatedAt: new Date()
        }
      }
    );

    console.log('[Settings:MassUpdate] ✅ Update result:');
    console.log('[Settings:MassUpdate] - Matched:', updateResult.matchedCount);
    console.log('[Settings:MassUpdate] - Modified:', updateResult.modifiedCount);

    // STEP 4: UPDATE DEFAULT SETTING FOR FUTURE CHATS
    await updateSetting('defaultModeForNewChats', targetDbMode, updatedBy);
    await updateSetting('globalMode', targetDbMode, updatedBy);

    console.log('[Settings:MassUpdate] ✅ Default mode for new chats updated to:', targetDbMode);

    // STEP 5: CREATE AUDIT LOG
    const logEntry = new ModeChangeLog({
      changedAt: new Date(),
      changedBy: updatedBy || 'Admin',
      affectedChats: totalChats,
      modifiedChats: updateResult.modifiedCount,
      fromModeDistribution: {
        ai: aiChats,
        staff: staffChats,
        other: otherChats
      },
      toMode: newMode,
      totalChats: totalChats,
      notes: notes || `Mass switched all chats to ${newMode.toUpperCase()}`
    });

    await logEntry.save();
    console.log('[Settings:MassUpdate] ✅ Audit log saved with ID:', logEntry._id);

    // STEP 6: EMIT SOCKET.IO NOTIFICATION TO ALL CLIENTS
    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('settings:global_mode_changed', { globalMode: targetDbMode, mode: newMode });
        io.emit('settings:default_new_chat_mode_changed', { defaultModeForNewChats: targetDbMode });
        io.emit('chats:mass_mode_updated', {
          targetMode: targetDbMode,
          displayMode: newMode,
          modifiedChats: updateResult.modifiedCount,
          totalChats
        });
      }
    } catch (socketErr) {
      logger.warn(`[SettingsService] Could not emit socket update: ${socketErr.message}`);
    }

    return {
      success: true,
      message: `All ${updateResult.modifiedCount} chats switched to ${newMode.toUpperCase()} mode successfully`,
      stats: {
        totalChats,
        modifiedChats: updateResult.modifiedCount,
        matchedChats: updateResult.matchedCount,
        previousDistribution: {
          ai: aiChats,
          staff: staffChats,
          other: otherChats
        },
        newMode: newMode,
        targetDbMode: targetDbMode,
        timestamp: new Date()
      }
    };

  } catch (error) {
    console.error('[Settings:MassUpdate] ❌ Error:', error.message);
    throw error;
  }
}

module.exports = {
  getSettingValue,
  getAllSettings,
  initializeDefaultSettings,
  updateSetting,
  massUpdateAllChatMode
};
