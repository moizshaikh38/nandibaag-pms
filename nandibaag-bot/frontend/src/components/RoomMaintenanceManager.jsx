import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';
import { Wrench, Plus, CheckCircle, XCircle, Calendar, MessageSquare, AlertCircle, ShieldAlert } from 'lucide-react';
import '../styles/RoomMaintenanceManager.css';

const RoomMaintenanceManager = () => {
  const [rooms, setRooms] = useState([]);
  const [activeMaintenance, setActiveMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    selectedRooms: [],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    maintenanceType: 'maintenance',
    reason: ''
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all rooms
      const roomsRes = await api.get('/rooms');
      setRooms(roomsRes.data.rooms || roomsRes.data || []);

      // Fetch active maintenance
      const maintenanceRes = await api.get('/maintenance');
      setActiveMaintenance(maintenanceRes.data.maintenance || []);

    } catch (error) {
      console.error('[MaintenanceManager] Error loading data:', error);
      toast.error('Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoomToggle = (roomId) => {
    const rId = String(roomId);
    setFormData(prev => ({
      ...prev,
      selectedRooms: prev.selectedRooms.includes(rId)
        ? prev.selectedRooms.filter(id => id !== rId)
        : [...prev.selectedRooms, rId]
    }));
  };

  const handleAddMaintenance = async (e) => {
    if (e) e.preventDefault();

    if (formData.selectedRooms.length === 0) {
      toast.error('Please select at least one room');
      return;
    }

    if (!formData.startDate || !formData.endDate) {
      toast.error('Please select start and end dates');
      return;
    }

    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      toast.error('End date must be after start date');
      return;
    }

    try {
      const res = await api.post('/maintenance', {
        roomIds: formData.selectedRooms,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maintenanceType: formData.maintenanceType,
        reason: formData.reason,
        createdBy: 'Admin'
      });

      if (res.data.success) {
        toast.success('✅ Maintenance scheduled successfully');
        setFormData({
          selectedRooms: [],
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          maintenanceType: 'maintenance',
          reason: ''
        });
        fetchData();
      }
    } catch (error) {
      console.error('[MaintenanceManager] Add Error:', error);
      toast.error(error.response?.data?.error || 'Failed to add maintenance');
    }
  };

  const handleCompleteMaintenance = async (maintenanceId) => {
    try {
      await api.patch(`/maintenance/${maintenanceId}/complete`);
      toast.success('✅ Room maintenance completed and unlocked');
      fetchData();
    } catch (error) {
      console.error('[MaintenanceManager] Complete Error:', error);
      toast.error('Failed to mark maintenance as complete');
    }
  };

  const handleCancelMaintenance = async (maintenanceId) => {
    if (!window.confirm('Are you sure you want to cancel this maintenance schedule?')) return;

    try {
      await api.patch(`/maintenance/${maintenanceId}/cancel`);
      toast.success('✅ Maintenance cancelled');
      fetchData();
    } catch (error) {
      console.error('[MaintenanceManager] Cancel Error:', error);
      toast.error('Failed to cancel maintenance');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-semibold text-sm">
        <Wrench size={24} className="animate-spin text-emerald-600 mr-2" />
        Loading room maintenance records...
      </div>
    );
  }

  return (
    <div className="maintenance-manager max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600">
            <Wrench size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">Room Maintenance & Wellness</h2>
            <p className="text-xs text-slate-500 font-medium">Schedule repairs, cleaning, and wellness locks for rooms</p>
          </div>
        </div>
        <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
          {activeMaintenance.length} Active Locks
        </span>
      </div>

      {/* Main Grid: Form + List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form Panel */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
            <Plus size={16} className="text-emerald-600" /> Schedule Maintenance / Lock
          </h3>

          {/* Room Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Select Rooms to Lock *</label>
            <div className="rooms-grid grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {rooms.map(room => {
                const roomIdStr = String(room._id || room.number || room.roomNumber);
                const isSelected = formData.selectedRooms.includes(roomIdStr);
                return (
                  <label
                    key={room._id || room.roomNumber}
                    className={`room-checkbox flex items-center gap-1.5 p-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleRoomToggle(roomIdStr)}
                      className="hidden"
                    />
                    <span>Room {room.roomNumber || room.number}</span>
                  </label>
                );
              })}
            </div>
            {formData.selectedRooms.length > 0 && (
              <p className="text-[11px] font-bold text-amber-700">
                Selected: {formData.selectedRooms.length} room(s)
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lock Reason Type *</label>
            <select
              value={formData.maintenanceType}
              onChange={(e) => setFormData({...formData, maintenanceType: e.target.value})}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="maintenance">🔧 General Maintenance</option>
              <option value="wellness">🌿 Wellness Servicing</option>
              <option value="cleaning">🧹 Deep Cleaning</option>
              <option value="repair">🛠️ AC / Plumbing Repair</option>
              <option value="other">📋 Other Reason</option>
            </select>
          </div>

          {/* Reason Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Reason (Optional)</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              placeholder="e.g. AC unit replacement and deep cleaning..."
              maxLength={500}
              className="w-full p-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-white resize-none"
              rows={2}
            />
          </div>

          <button
            onClick={handleAddMaintenance}
            className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Wrench size={16} /> Lock Room(s) for Maintenance
          </button>
        </div>

        {/* Active List Panel */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
            <ShieldAlert size={16} className="text-amber-600" /> Active Maintenance Locks ({activeMaintenance.length})
          </h3>

          {activeMaintenance.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-700">No rooms currently under maintenance</p>
              <p className="text-[11px] text-slate-400 mt-0.5">All resort cottages are available for booking</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {activeMaintenance.map(item => {
                const roomObj = rooms.find(r => String(r._id) === String(item.roomId) || String(r.roomNumber) === String(item.roomId));
                const roomName = roomObj ? `Room ${roomObj.roomNumber || roomObj.number}` : `Room ${item.roomId}`;

                return (
                  <div
                    key={item._id}
                    className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs hover:border-amber-400 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{roomName}</span>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-600 text-white">
                          {item.maintenanceType}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar size={13} className="text-amber-600" />
                          {formatDateDDMMYYYY(item.startDate)} ➔ {formatDateDDMMYYYY(item.endDate)}
                        </span>
                      </div>

                      {item.reason && (
                        <p className="text-xs text-slate-500 italic bg-white p-2 rounded-lg border border-amber-100 flex items-start gap-1">
                          <MessageSquare size={12} className="text-amber-500 mt-0.5 shrink-0" />
                          <span>{item.reason}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleCompleteMaintenance(item._id)}
                        className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={13} /> Complete
                      </button>
                      <button
                        onClick={() => handleCancelMaintenance(item._id)}
                        className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-1"
                      >
                        <XCircle size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default RoomMaintenanceManager;
