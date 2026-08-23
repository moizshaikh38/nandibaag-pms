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
  if (m === 'staff' || m === 'human') return 'staff';
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
 * FUNCTION 1: UPDATE DEFAULT ONLY (don't touch existing chats)
 */
const updateDefaultModeOnly = async (newMode, updatedBy = 'Admin') => {
  try {
    console.log('[Settings:DefaultOnly] Updating default mode to:', newMode);

    if (!['ai', 'staff', 'human', 'auto'].includes(newMode)) {
      throw new Error('Invalid mode');
    }

    const normalizedMode = normalizeMode(newMode);

    // ONLY update the setting - DO NOT TOUCH ANY CHAT
    const setting = await Settings.findOneAndUpdate(
      {},
      {
        $set: {
          defaultModeForNewChats: normalizedMode,
          globalMode: normalizedMode
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log('[Settings:DefaultOnly] ✅ Setting updated to:', normalizedMode);
    console.log('[Settings:DefaultOnly] ⚠️ EXISTING CHATS NOT TOUCHED');

    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('settings:default_new_chat_mode_changed', { defaultModeForNewChats: normalizedMode });
        io.emit('settings:global_mode_changed', { globalMode: normalizedMode });
      }
    } catch (socketErr) {
      logger.warn(`[Settings:DefaultOnly] Socket emit failed: ${socketErr.message}`);
    }

    return {
      success: true,
      message: 'Default mode updated. New chats will use ' + newMode + ' mode.',
      changedType: 'DEFAULT_ONLY',
      existingChatsAffected: 0,
      newChatsAffected: 'future',
      setting
    };

  } catch (error) {
    console.error('[Settings:DefaultOnly] Error:', error.message);
    throw error;
  }
};

/**
 * FUNCTION 2: MASS SWITCH (update ALL chats)
 */
const massUpdateAllChatMode = async (newMode, updatedBy = 'Admin') => {
  try {
    console.log('[Settings:MassSwitch] MASS UPDATING ALL CHATS to:', newMode);

    const Chat = require('../models/Chat');

    if (!['ai', 'staff', 'human', 'auto'].includes(newMode)) {
      throw new Error('Invalid mode');
    }

    const normalizedMode = normalizeMode(newMode);

    // GET STATS BEFORE
    const allChatsBefore = await Chat.find().select('mode').lean();
    const statsBefore = {
      ai: allChatsBefore.filter(c => c.mode === 'ai').length,
      staff: allChatsBefore.filter(c => c.mode === 'staff' || c.mode === 'human').length,
      auto: allChatsBefore.filter(c => c.mode === 'auto').length,
      total: allChatsBefore.length
    };

    console.log('[Settings:MassSwitch] Before stats:', statsBefore);

    // STEP 1: MASS UPDATE ALL CHATS
    console.log('[Settings:MassSwitch] Updating all', statsBefore.total, 'chats...');

    const updateResult = await Chat.updateMany(
      {}, // No filter = all chats
      {
        $set: {
          mode: normalizedMode,
          updatedAt: new Date()
        }
      },
      { runValidators: false }
    );

    console.log('[Settings:MassSwitch] Update result - Matched:', updateResult.matchedCount, 'Modified:', updateResult.modifiedCount);

    // VERIFY UPDATE
    const allChatsAfter = await Chat.find().select('mode').lean();
    const statsAfter = {
      ai: allChatsAfter.filter(c => c.mode === 'ai').length,
      staff: allChatsAfter.filter(c => c.mode === 'staff' || c.mode === 'human').length,
      auto: allChatsAfter.filter(c => c.mode === 'auto').length,
      total: allChatsAfter.length
    };

    console.log('[Settings:MassSwitch] After stats:', statsAfter);

    // STEP 2: ALSO UPDATE DEFAULT FOR FUTURE CHATS
    console.log('[Settings:MassSwitch] Updating default mode for future chats...');

    await updateDefaultModeOnly(newMode, updatedBy);

    // STEP 3: CREATE AUDIT LOG
    const ModeChangeLog = require('../models/ModeChangeLog');

    const logEntry = new ModeChangeLog({
      changedAt: new Date(),
      changedBy: updatedBy || 'Admin',
      affectedChats: statsBefore.total,
      modifiedChats: updateResult.modifiedCount,
      fromModeDistribution: statsBefore,
      toMode: normalizedMode,
      totalChats: statsBefore.total,
      changeType: 'MASS_SWITCH'
    });

    await logEntry.save();

    console.log('[Settings:MassSwitch] ✅ Audit log created');

    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('settings:global_mode_changed', { globalMode: normalizedMode, mode: normalizedMode });
        io.emit('settings:default_new_chat_mode_changed', { defaultModeForNewChats: normalizedMode });
        io.emit('chats:bulk_mode_updated', { mode: normalizedMode });
        io.emit('chats:mass_mode_updated', {
          targetMode: normalizedMode,
          displayMode: newMode,
          modifiedChats: updateResult.modifiedCount,
          totalChats: statsBefore.total
        });
      }
    } catch (socketErr) {
      logger.warn(`[Settings:MassSwitch] Socket emit failed: ${socketErr.message}`);
    }

    return {
      success: true,
      message: `✅ ALL ${updateResult.modifiedCount} chats switched to ${newMode} mode + default updated`,
      changedType: 'MASS_SWITCH',
      stats: {
        chatsSwitched: updateResult.modifiedCount,
        statsBefore,
        statsAfter,
        defaultNowSet: newMode
      }
    };

  } catch (error) {
    console.error('[Settings:MassSwitch] ❌ Error:', error.message);
    throw error;
  }
};

module.exports = {
  getSettingValue,
  getAllSettings,
  updateSetting: updateDefaultModeOnly, // Use DEFAULT ONLY for normal updates
  updateDefaultModeOnly, // Export both
  massUpdateAllChatMode,
  initializeDefaultSettings
};
