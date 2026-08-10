const express = require('express');
const router = express.Router();
const {
  addMaintenance,
  completeMaintenance,
  cancelMaintenance,
  getActiveMaintenance
} = require('../services/maintenanceService');

// GET all active maintenance
router.get('/', async (req, res) => {
  try {
    console.log('[Maintenance:API] Fetching active maintenance');

    const records = await getActiveMaintenance();

    res.json({
      success: true,
      maintenance: records,
      count: records.length
    });
  } catch (error) {
    console.error('[Maintenance:API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST add maintenance
router.post('/', async (req, res) => {
  try {
    const { roomIds, startDate, endDate, maintenanceType, reason, createdBy } = req.body;

    console.log('[Maintenance:API] Adding maintenance:', { roomIds, startDate, endDate, maintenanceType });

    if (!roomIds || roomIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one room required'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start and end dates required'
      });
    }

    const records = await addMaintenance(
      roomIds,
      startDate,
      endDate,
      maintenanceType,
      reason,
      createdBy
    );

    // Broadcast availability_updated on socket so real-time clients refresh availability
    try {
      const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
      if (io) {
        io.emit('availability_updated', {
          action: 'maintenance_added',
          roomIds
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      maintenance: records
    });
  } catch (error) {
    console.error('[Maintenance:API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PATCH complete maintenance
router.patch('/:maintenanceId/complete', async (req, res) => {
  try {
    const { maintenanceId } = req.params;

    const record = await completeMaintenance(maintenanceId);

    // Broadcast availability_updated
    try {
      const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
      if (io) {
        io.emit('availability_updated', {
          action: 'maintenance_completed',
          maintenanceId
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      maintenance: record
    });
  } catch (error) {
    console.error('[Maintenance:Complete] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PATCH cancel maintenance
router.patch('/:maintenanceId/cancel', async (req, res) => {
  try {
    const { maintenanceId } = req.params;

    const record = await cancelMaintenance(maintenanceId);

    // Broadcast availability_updated
    try {
      const io = req.app?.get?.('io') || (require('../sockets').getIO ? require('../sockets').getIO() : null);
      if (io) {
        io.emit('availability_updated', {
          action: 'maintenance_cancelled',
          maintenanceId
        });
      }
    } catch (_) {}

    res.json({
      success: true,
      maintenance: record
    });
  } catch (error) {
    console.error('[Maintenance:Cancel] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
