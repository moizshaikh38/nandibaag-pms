/**
 * Settings Service
 * Handles system settings configuration, mass chat mode updates, and audit logging.
 */

const { Settings, SystemSettings, Chat, ModeChangeLog } = require('../models');
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
    // 1. Check Settings collection
    const settings = await Settings.findOne();
    if (settings && settings[key] !== undefined && settings[key] !== null) {
      return settings[key];
    }

    // 2. Check SystemSettings collection if model exists
    if (SystemSettings) {
      const sysSetting = await SystemSettings.findOne({ settingKey: key });
      if (sysSetting && sysSetting.settingValue !== undefined && sysSetting.settingValue !== null) {
        return sysSetting.settingValue;
      }
    }

    return defaultValue;
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
const initializeDefaultSettings = async () => {
  try {
    console.log('[Settings:Init] Initializing default settings');

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({
        globalMode: 'ai',
        defaultModeForNewChats: 'ai',
        whatsappNumbers: [],
        openRouterModelOverride: null,
        followUpEnabled: true,
        resortContactNumber: '9257657664',
        resortContactNumberReception: '9257657665',
        resortContactNumberKitchen: '75582 69653'
      });
      await settings.save();
    } else {
      let needsSave = false;
      if (!settings.resortContactNumber) {
        settings.resortContactNumber = '9257657664';
        needsSave = true;
      }
      if (!settings.resortContactNumberReception) {
        settings.resortContactNumberReception = '9257657665';
        needsSave = true;
      }
      if (!settings.resortContactNumberKitchen) {
        settings.resortContactNumberKitchen = '75582 69653';
        needsSave = true;
      }
      if (needsSave) {
        await settings.save();
      }
    }

    const defaultSettings = [
      {
        settingKey: 'defaultModeForNewChats',
        settingValue: 'ai',
        description: 'Default mode for new incoming chats (ai/staff/auto)',
        dataType: 'string',
        category: 'chat'
      },
      {
        settingKey: 'resortContactNumber',
        settingValue: '9257657664',
        description: 'Main resort contact number',
        dataType: 'string',
        category: 'general'
      },
      {
        settingKey: 'resortContactNumberReception',
        settingValue: '9257657665',
        description: 'Reception contact number',
        dataType: 'string',
        category: 'general'
      },
      {
        settingKey: 'resortContactNumberKitchen',
        settingValue: '75582 69653',
        description: 'Kitchen contact number',
        dataType: 'string',
        category: 'general'
      },
      {
        settingKey: 'enableChatHistory',
        settingValue: 'true',
        description: 'Store full chat history',
        dataType: 'boolean',
        category: 'chat'
      },
      {
        settingKey: 'maxChatsDisplay',
        settingValue: '100',
        description: 'Max chats shown in inbox',
        dataType: 'number',
        category: 'chat'
      }
    ];

    if (SystemSettings) {
      for (const setting of defaultSettings) {
        const exists = await SystemSettings.findOne({ settingKey: setting.settingKey });

        if (!exists) {
          await SystemSettings.create(setting);
          console.log('[Settings:Init] Created:', setting.settingKey);
        }
      }
    }

    console.log('[Settings:Init] ✅ Default settings initialized');
    return settings;
  } catch (error) {
    console.error('[Settings:Init] Error:', error.message);
  }
};

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

const updateGenericSetting = async (key, value, updatedBy = 'Admin') => {
  try {
    console.log(`[Settings:Update] Setting ${key} to ${value} by ${updatedBy}`);

    if (key === 'defaultModeForNewChats' || key === 'globalMode') {
      return await updateDefaultModeOnly(value, updatedBy);
    }

    // Update Settings model
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: { [key]: value } },
      { new: true, upsert: true }
    );

    // Update SystemSettings model if it exists
    if (SystemSettings) {
      await SystemSettings.findOneAndUpdate(
        { settingKey: key },
        {
          $set: {
            settingKey: key,
            settingValue: value,
            updatedBy
          }
        },
        { new: true, upsert: true }
      );
    }

    try {
      const { getIO } = require('../sockets');
      const io = getIO();
      if (io) {
        io.emit('settings:updated', { key, value, updatedBy });
      }
    } catch (e) {}

    return settings;
  } catch (error) {
    console.error(`[Settings:Update] Error updating ${key}:`, error.message);
    throw error;
  }
};

module.exports = {
  getSettingValue,
  getAllSettings,
  updateSetting: updateGenericSetting,
  updateGenericSetting,
  updateDefaultModeOnly,
  massUpdateAllChatMode,
  initializeDefaultSettings
};
