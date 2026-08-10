const RoomMaintenance = require('../models/RoomMaintenance');

const addMaintenance = async (roomIds, startDate, endDate, maintenanceType, reason, createdBy) => {
  try {
    console.log('[Maintenance:Add] Adding maintenance for rooms:', roomIds);

    const start = new Date(startDate);
    const end = new Date(endDate);

    const maintenances = await Promise.all(
      roomIds.map(roomId =>
        RoomMaintenance.create({
          roomId: String(roomId),
          startDate: start,
          endDate: end,
          maintenanceType: maintenanceType || 'maintenance',
          reason: reason || '',
          status: 'active',
          createdBy: createdBy || 'Admin'
        })
      )
    );

    console.log('[Maintenance:Add] ✅ Created', maintenances.length, 'maintenance records');
    return maintenances;
  } catch (error) {
    console.error('[Maintenance:Add] Error:', error.message);
    throw error;
  }
};

const completeMaintenance = async (maintenanceId) => {
  try {
    console.log('[Maintenance:Complete] Completing maintenance:', maintenanceId);

    const updated = await RoomMaintenance.findByIdAndUpdate(
      maintenanceId,
      { status: 'completed', updatedAt: new Date() },
      { new: true }
    );

    console.log('[Maintenance:Complete] ✅ Completed');
    return updated;
  } catch (error) {
    console.error('[Maintenance:Complete] Error:', error.message);
    throw error;
  }
};

const cancelMaintenance = async (maintenanceId) => {
  try {
    console.log('[Maintenance:Cancel] Cancelling maintenance:', maintenanceId);

    const updated = await RoomMaintenance.findByIdAndUpdate(
      maintenanceId,
      { status: 'cancelled', updatedAt: new Date() },
      { new: true }
    );

    console.log('[Maintenance:Cancel] ✅ Cancelled');
    return updated;
  } catch (error) {
    console.error('[Maintenance:Cancel] Error:', error.message);
    throw error;
  }
};

const getActiveMaintenance = async () => {
  try {
    const records = await RoomMaintenance.find({ status: 'active' }).sort({ startDate: -1 }).lean();
    return records;
  } catch (error) {
    console.error('[Maintenance:GetActive] Error:', error.message);
    throw error;
  }
};

module.exports = {
  addMaintenance,
  completeMaintenance,
  cancelMaintenance,
  getActiveMaintenance
};
