import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Edit,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Home,
  Search,
  Users,
  Settings,
  ShieldCheck,
  BedDouble
} from 'lucide-react';

import { useSocket } from '../hooks/useSocket';

export default function InventoryPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [series, setSeries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [rooms, setRooms] = useState({});
  const [expandedSeries, setExpandedSeries] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddSeries, setShowAddSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [showAddRoom, setShowAddRoom] = useState(null); // seriesId
  const [editingRoom, setEditingRoom] = useState(null);
  const [editCapacity, setEditCapacity] = useState(4);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const [seriesRes, summaryRes] = await Promise.all([
        api.get('/inventory/series'),
        api.get('/inventory/summary')
      ]);

      const seriesList = seriesRes.data.series || [];
      setSeries(seriesList);
      setSummary(summaryRes.data.summary || null);

      // Auto expand series that have rooms
      const expandedMap = {};
      seriesList.forEach(s => {
        if (s.roomCount > 0) expandedMap[s._id] = true;
      });
      setExpandedSeries(expandedMap);

      // Fetch rooms for all series
      await Promise.all(seriesList.map(s => fetchRoomsForSeries(s._id)));
    } catch (error) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoomsForSeries = async (seriesId) => {
    try {
      const res = await api.get(`/inventory/series/${seriesId}/rooms`);
      setRooms(prev => ({ ...prev, [seriesId]: res.data.rooms || [] }));
    } catch (error) {
      console.error(`Failed to fetch rooms for series ${seriesId}:`, error);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!socket) return;
    const handleSync = () => fetchInventory();
    socket.on('inventory:updated', handleSync);
    socket.on('room:status_updated', handleSync);
    socket.on('booking:created', handleSync);
    return () => {
      socket.off('inventory:updated', handleSync);
      socket.off('room:status_updated', handleSync);
      socket.off('booking:created', handleSync);
    };
  }, [socket, fetchInventory]);

  const toggleExpand = (seriesId) => {
    setExpandedSeries(prev => ({ ...prev, [seriesId]: !prev[seriesId] }));
  };

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) {
      toast.error('Please enter a series name');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/inventory/series', { name: newSeriesName.trim() });
      toast.success('New room series created');
      setNewSeriesName('');
      setShowAddSeries(false);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create series');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRoom = async (seriesId) => {
    if (!newRoomNumber.trim()) {
      toast.error('Please enter a room number');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(`/inventory/series/${seriesId}/rooms`, {
        roomNumber: newRoomNumber.trim(),
        capacity: Number(newRoomCapacity) || 4
      });
      toast.success(`Room ${newRoomNumber} added!`);
      setNewRoomNumber('');
      setShowAddRoom(null);
      fetchRoomsForSeries(seriesId);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoom = async (roomId, seriesId) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    try {
      await api.delete(`/inventory/rooms/${roomId}`);
      toast.success('Room deleted');
      fetchRoomsForSeries(seriesId);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete room');
    }
  };

  const handleUpdateCapacity = async () => {
    if (!editingRoom) return;
    setIsSubmitting(true);
    try {
      await api.patch(`/inventory/rooms/${editingRoom._id}`, {
        capacity: Number(editCapacity) || 4
      });
      toast.success(`Room ${editingRoom.roomNumber} capacity updated to ${editCapacity}!`);
      const sId = editingRoom.seriesId?._id || editingRoom.seriesId;
      setEditingRoom(null);
      if (sId) fetchRoomsForSeries(sId);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update capacity');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner & Action */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
            <Home className="text-emerald-600" size={22} />
            <span>Resort Room Inventory Management</span>
          </h1>
          <p className="text-xs text-slate-500">
            Configure room series, guest capacities, and cottage maintenance statuses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchInventory}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            title="Refresh Inventory"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {true && (
            <button
              onClick={() => setShowAddSeries(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:scale-105"
            >
              <Plus size={16} />
              <span>Add Room Series</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 rounded-2xl bg-white border border-slate-200 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Cottage Rooms</span>
          <p className="font-display text-2xl font-bold text-slate-900">{summary?.totalRooms || 47}</p>
        </div>

        <div className="glass-card p-5 rounded-2xl bg-white border border-slate-200 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Guest Capacity</span>
          <p className="font-display text-2xl font-bold text-emerald-700">{summary?.totalActiveCapacity || 228} Guests</p>
        </div>

        <div className="glass-card p-5 rounded-2xl bg-white border border-slate-200 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Configured Series</span>
          <p className="font-display text-2xl font-bold text-slate-900">{series.length} Series</p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter rooms by number (e.g. 101, 505, 603)..."
          className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl shadow-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
      </div>

      {/* Series Cards */}
      {loading ? (
        <div className="py-16 text-center space-y-3 glass-card rounded-2xl">
          <RefreshCw size={32} className="animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Loading series & room details...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {series.map((s) => {
            const seriesRooms = (rooms[s._id] || []).filter(r =>
              !searchQuery || r.roomNumber.toLowerCase().includes(searchQuery.toLowerCase())
            );
            const isExpanded = expandedSeries[s._id];

            return (
              <div key={s._id} className="glass-card rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
                {/* Series Header */}
                <div 
                  onClick={() => toggleExpand(s._id)}
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                      <BedDouble size={18} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-base text-slate-800">{s.name}</h3>
                      <p className="text-xs text-slate-500">{seriesRooms.length} Active Rooms</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {true && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddRoom(s._id);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                      >
                        <Plus size={14} />
                        <span>Add Room</span>
                      </button>
                    )}

                    {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                  </div>
                </div>

                {/* Rooms Grid */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                    {seriesRooms.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No rooms seeded for this series yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {seriesRooms.map((room) => (
                          <div key={room._id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 relative group hover:shadow-sm transition-all">
                            <div className="flex items-center justify-between">
                              <span className="font-display font-bold text-sm text-slate-800">
                                Room {room.roomNumber}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingRoom(room);
                                    setEditCapacity(room.capacity);
                                  }}
                                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-500 hover:text-emerald-600 transition-opacity p-1"
                                  title="Edit Room Capacity"
                                >
                                  <Edit size={13} />
                                </button>
                                {true && (
                                  <button
                                    onClick={() => handleDeleteRoom(room._id, s._id)}
                                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-500 hover:text-rose-600 transition-opacity p-1"
                                    title="Delete Room"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Cap: <strong>{room.capacity}</strong></span>
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                Active
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Series Modal */}
      {showAddSeries && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-6 sm:pt-12 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 bg-white animate-fade-in shadow-2xl mt-0 mb-auto border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800">Add Room Series</h3>
              <button onClick={() => setShowAddSeries(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Series Name</label>
              <input
                type="text"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="700 Series"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddSeries(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSeries}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-6 sm:pt-12 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 bg-white animate-fade-in shadow-2xl mt-0 mb-auto border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800">Add Cottage Room</h3>
              <button onClick={() => setShowAddRoom(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Room Number</label>
                <input
                  type="text"
                  value={newRoomNumber}
                  onChange={(e) => setNewRoomNumber(e.target.value)}
                  placeholder="101"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guest Capacity</label>
                <input
                  type="number"
                  value={newRoomCapacity}
                  onChange={(e) => setNewRoomCapacity(e.target.value)}
                  placeholder="4"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRoom(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateRoom(showAddRoom)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl"
              >
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Capacity Modal */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pt-4 sm:pt-10 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="glass-card rounded-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 bg-white animate-fade-in shadow-2xl mt-0 mb-auto border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-800">
                Edit Room {editingRoom.roomNumber} Capacity
              </h3>
              <button onClick={() => setEditingRoom(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Guest Capacity (Persons)</label>
              <input
                type="number"
                min="1"
                max="50"
                value={editCapacity}
                onChange={(e) => setEditCapacity(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                ⚡ Updating capacity automatically syncs live availability across WhatsApp bot & web widget.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingRoom(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCapacity}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs"
              >
                {isSubmitting ? 'Updating...' : 'Update Capacity'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
