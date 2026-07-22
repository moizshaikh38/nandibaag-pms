import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import StatusBadge from '../components/StatusBadge';
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
  Calendar as CalendarIcon,
  User,
  Info
} from 'lucide-react';

function HighlightText({ text, highlight }) {
  if (!highlight) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-300 text-gray-900 rounded px-0.5">{text.slice(idx, idx + highlight.length)}</span>
      {text.slice(idx + highlight.length)}
    </>
  );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [series, setSeries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expandedSeries, setExpandedSeries] = useState({});
  const [rooms, setRooms] = useState({});
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddSeries, setShowAddSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [showAddRoom, setShowAddRoom] = useState(null);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', capacity: '' });
  const [showEditRoom, setShowEditRoom] = useState(null);
  const [editRoomData, setEditRoomData] = useState({ capacity: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allRoomsLoaded, setAllRoomsLoaded] = useState(false);

  // Date picker for availability
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [roomAvailability, setRoomAvailability] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookedRoomPopover, setBookedRoomPopover] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // When search activates, load rooms for ALL series
  useEffect(() => {
    if (!searchQuery) {
      setAllRoomsLoaded(false);
      return;
    }
    if (series.length === 0) return;

    let cancelled = false;
    const loadAll = async () => {
      await Promise.all(series.map(s => {
        if (!rooms[s._id]) return fetchRoomsForSeries(s._id);
        return Promise.resolve();
      }));
      if (!cancelled) setAllRoomsLoaded(true);
    };
    loadAll();
    return () => { cancelled = true; };
  }, [searchQuery, series.length]);

  // Auto-expand series that have matching rooms
  useEffect(() => {
    if (!searchQuery || !allRoomsLoaded) return;
    const newExpanded = {};
    series.forEach(s => {
      const seriesMatches = s.name.toLowerCase().includes(searchQuery);
      const roomList = rooms[s._id] || [];
      const hasRoomMatch = roomList.some(r => r.roomNumber.toLowerCase().includes(searchQuery));
      if (seriesMatches || hasRoomMatch) {
        newExpanded[s._id] = true;
      }
    });
    setExpandedSeries(prev => ({ ...prev, ...newExpanded }));
  }, [searchQuery, allRoomsLoaded, rooms]);

  // Compute filtered series for rendering
  const filteredSeries = React.useMemo(() => {
    if (!searchQuery) return series;
    return series.filter(s => {
      const seriesMatches = s.name.toLowerCase().includes(searchQuery);
      const roomList = rooms[s._id] || [];
      const hasRoomMatch = roomList.some(r => r.roomNumber.toLowerCase().includes(searchQuery));
      return seriesMatches || hasRoomMatch;
    });
  }, [series, searchQuery, rooms]);

  const totalMatchingRooms = React.useMemo(() => {
    if (!searchQuery) return 0;
    return filteredSeries.reduce((acc, s) => {
      const roomList = rooms[s._id] || [];
      return acc + roomList.filter(r => r.roomNumber.toLowerCase().includes(searchQuery)).length;
    }, 0);
  }, [filteredSeries, rooms, searchQuery]);

  // Fetch data
  const fetchData = async () => {
    try {
      const [seriesRes, summaryRes] = await Promise.all([
        api.get('/inventory/series'),
        api.get('/inventory/summary')
      ]);
      setSeries(seriesRes.data.series);
      setSummary(summaryRes.data.summary);
    } catch (error) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomsForSeries = async (seriesId) => {
    try {
      const response = await api.get(`/inventory/rooms?seriesId=${seriesId}`);
      setRooms((prev) => ({ ...prev, [seriesId]: response.data.rooms }));
    } catch (error) {
      toast.error('Failed to load rooms');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch room availability for selected date
  const fetchRoomAvailability = async (date) => {
    setAvailabilityLoading(true);
    try {
      const response = await api.get(`/inventory/availability-by-date?date=${date}`);
      const availabilityMap = {};
      response.data.roomAvailability.forEach(room => {
        availabilityMap[room.roomId] = room;
      });
      setRoomAvailability(availabilityMap);
    } catch (error) {
      toast.error('Failed to load room availability');
    } finally {
      setAvailabilityLoading(false);
    }
  };

  // Fetch availability when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchRoomAvailability(selectedDate);
    }
  }, [selectedDate]);

  const toggleSeries = (seriesId) => {
    setExpandedSeries((prev) => {
      const isExpanded = prev[seriesId];
      if (!isExpanded && !rooms[seriesId]) {
        fetchRoomsForSeries(seriesId);
      }
      return { ...prev, [seriesId]: !isExpanded };
    });
  };

  // Optimistic update helper
  const optimisticUpdate = async (optimisticFn, apiCall, successMsg, revertMsg) => {
    const prevSeries = [...series];
    const prevRooms = { ...rooms };

    optimisticFn();

    try {
      await apiCall();
      if (successMsg) toast.success(successMsg);
      fetchData();
    } catch (error) {
      setSeries(prevSeries);
      setRooms(prevRooms);
      toast.error(error.response?.data?.message || revertMsg || 'Operation failed');
    }
  };

  // Series actions
  const handleAddSeries = async () => {
    if (!newSeriesName.trim()) {
      toast.error('Series name is required');
      return;
    }

    await optimisticUpdate(
      () => {
        const tempId = `temp-${Date.now()}`;
        setSeries((prev) => [...prev, { _id: tempId, name: newSeriesName, status: 'active', roomCount: 0, activeRoomCount: 0 }]);
      },
      () => api.post('/inventory/series', { name: newSeriesName }),
      'Series added',
      'Failed to add series'
    );

    setShowAddSeries(false);
    setNewSeriesName('');
  };

  const handleDeleteSeries = async (seriesId) => {
    await optimisticUpdate(
      () => {
        setSeries((prev) => prev.filter((s) => s._id !== seriesId));
        setRooms((prev) => {
          const copy = { ...prev };
          delete copy[seriesId];
          return copy;
        });
      },
      () => api.delete(`/inventory/series/${seriesId}`),
      'Series and rooms deleted',
      'Failed to delete series'
    );
    setConfirmDelete(null);
  };

  const handleBulkSeriesStatus = async (seriesId, status) => {
    const seriesData = series.find((s) => s._id === seriesId);
    if (!seriesData) return;

    await optimisticUpdate(
      () => {
        setSeries((prev) => prev.map((s) => (s._id === seriesId ? { ...s, status } : s)));
        if (rooms[seriesId]) {
          setRooms((prev) => ({
            ...prev,
            [seriesId]: prev[seriesId].map((r) => ({ ...r, status }))
          }));
        }
      },
      () => api.patch(`/inventory/series/${seriesId}`, { status }),
      `Series marked as ${status}`,
      'Failed to update series'
    );
  };

  // Room actions
  const handleAddRoom = async (seriesId) => {
    if (!newRoom.roomNumber || !newRoom.capacity) {
      toast.error('Room number and capacity are required');
      return;
    }

    await optimisticUpdate(
      () => {
        const tempRoom = {
          _id: `temp-${Date.now()}`,
          roomNumber: newRoom.roomNumber,
          capacity: parseInt(newRoom.capacity),
          status: 'active',
          seriesId: { _id: seriesId, name: series.find((s) => s._id === seriesId)?.name }
        };
        setRooms((prev) => ({
          ...prev,
          [seriesId]: [...(prev[seriesId] || []), tempRoom]
        }));
        setSeries((prev) =>
          prev.map((s) => (s._id === seriesId ? { ...s, roomCount: s.roomCount + 1, activeRoomCount: s.activeRoomCount + 1 } : s))
        );
      },
      () => api.post('/inventory/rooms', { seriesId, roomNumber: newRoom.roomNumber, capacity: parseInt(newRoom.capacity) }),
      'Room added',
      'Failed to add room'
    );

    setShowAddRoom(null);
    setNewRoom({ roomNumber: '', capacity: '' });
  };

  const handleEditRoom = async (roomId) => {
    if (!editRoomData.capacity) {
      toast.error('Capacity is required');
      return;
    }

    await optimisticUpdate(
      () => {
        setRooms((prev) => {
          const copy = { ...prev };
          for (const seriesId in copy) {
            copy[seriesId] = copy[seriesId].map((r) =>
              r._id === roomId ? { ...r, capacity: parseInt(editRoomData.capacity) } : r
            );
          }
          return copy;
        });
      },
      () => api.patch(`/inventory/rooms/${roomId}`, { capacity: parseInt(editRoomData.capacity) }),
      'Room updated',
      'Failed to update room'
    );

    setShowEditRoom(null);
    setEditRoomData({ capacity: '' });
  };

  const handleRoomStatus = async (roomId, status) => {
    await optimisticUpdate(
      () => {
        setRooms((prev) => {
          const copy = { ...prev };
          for (const seriesId in copy) {
            copy[seriesId] = copy[seriesId].map((r) => (r._id === roomId ? { ...r, status } : r));
          }
          return copy;
        });
      },
      () => api.patch(`/inventory/rooms/${roomId}/status`, { status }),
      `Room marked as ${status}`,
      'Failed to update room'
    );
  };

  const handleDeleteRoom = async (roomId) => {
    await optimisticUpdate(
      () => {
        setRooms((prev) => {
          const copy = { ...prev };
          for (const seriesId in copy) {
            copy[seriesId] = copy[seriesId].filter((r) => r._id !== roomId);
          }
          return copy;
        });
        setSeries((prev) =>
          prev.map((s) => ({ ...s, roomCount: Math.max(0, s.roomCount - 1), activeRoomCount: Math.max(0, s.activeRoomCount - 1) }))
        );
      },
      () => api.delete(`/inventory/rooms/${roomId}`),
      'Room deleted',
      'Failed to delete room'
    );
    setConfirmDelete(null);
  };

  if (loading) {
    return (
      <div className="p-4 pb-20 md:pb-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 md:pb-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 text-gray-600 hover:text-whatsapp transition-colors"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowAddSeries(true)}
                className="flex items-center gap-2 px-4 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light transition-colors"
              >
                <Plus size={18} />
                Add Series
              </button>
            )}
          </div>
        </div>

        {/* Summary Strip */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 mb-1">Active Rooms</p>
              <p className="text-2xl font-bold text-green-600">{summary.byStatus.active}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 mb-1">Total Capacity</p>
              <p className="text-2xl font-bold text-gray-800">{summary.totalActiveCapacity}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 mb-1">Maintenance</p>
              <p className="text-2xl font-bold text-amber-600">{summary.byStatus.maintenance}</p>
            </div>
          </div>
        )}

        {/* Room Search */}
        <div className="mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search rooms by number or series name (e.g. 603, 500 Series)..."
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-whatsapp text-sm"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {filteredSeries.length > 0
                ? `${totalMatchingRooms} room${totalMatchingRooms !== 1 ? 's' : ''} matching "${searchInput}" in ${filteredSeries.length} series`
                : `No rooms found matching "${searchInput}"`}
            </p>
          )}
        </div>

        {/* Date Picker for Availability */}
        <div className="mb-4">
          <div className="flex items-center gap-3 bg-white rounded-lg shadow p-3">
            <CalendarIcon size={18} className="text-whatsapp" />
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Check Availability for Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp focus:border-whatsapp"
              />
            </div>
            {availabilityLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-whatsapp"></div>
            )}
          </div>
        </div>

        {/* Series Cards */}
        <div className="space-y-4">
          {filteredSeries.length === 0 && !searchQuery ? (
            <div className="text-center py-16">
              <Home size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-lg">No series found</p>
              <p className="text-gray-400 text-sm mt-1 mb-4">
                Run <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">npm run seed-rooms</code> to load initial inventory, or click "+ Add Series" to create one.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowAddSeries(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-whatsapp text-white rounded-lg hover:bg-whatsapp-light transition-colors"
                >
                  <Plus size={18} />
                  Add Series
                </button>
              )}
            </div>
          ) : (
            <>
              {searchQuery && filteredSeries.length === 0 && (
                <div className="text-center py-12">
                  <Search size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 text-lg">No rooms found matching "{searchInput}"</p>
                  <p className="text-gray-400 text-sm mt-1">Try a different room number or series name, or clear the search.</p>
                </div>
              )}
              {filteredSeries.map((s) => {
                const seriesRooms = rooms[s._id] || [];
                const displayRooms = searchQuery
                  ? seriesRooms.filter(r => r.roomNumber.toLowerCase().includes(searchQuery))
                  : seriesRooms;
                return (
            <div key={s._id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Series Header */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleSeries(s._id)}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    {expandedSeries[s._id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-800">{s.name}</h3>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-sm text-gray-600">
                      {s.roomCount} room{s.roomCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <select
                      value={s.status}
                      onChange={(e) => handleBulkSeriesStatus(s._id, e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white font-medium cursor-pointer hover:border-whatsapp focus:outline-none focus:ring-2 focus:ring-whatsapp"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    <button
                      onClick={() => setConfirmDelete({ type: 'series', id: s._id })}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete series"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* Rooms Grid */}
              {expandedSeries[s._id] && (
                <div className="p-4">
                  {displayRooms.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {displayRooms.map((room) => {
                        const isMatch = searchQuery && room.roomNumber.toLowerCase().includes(searchQuery);
                        const availability = roomAvailability[room._id];
                        const isBooked = availability?.isBooked;
                        return (
                        <div
                          key={room._id}
                          className={`relative rounded-lg p-3 border-l-4 hover:shadow-md transition-shadow ${isMatch ? 'bg-yellow-50 shadow-sm' : 'bg-gray-50'} ${isBooked ? 'bg-red-50' : ''}`}
                          style={{
                            borderLeftColor:
                              room.status === 'maintenance'
                                ? '#f59e0b'
                                : '#10b981'
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="text-lg font-bold text-gray-800">
                                {isMatch ? (
                                  <HighlightText text={room.roomNumber} highlight={searchQuery} />
                                ) : room.roomNumber}
                              </p>
                              <p className="text-xs text-gray-600">Capacity: {room.capacity}</p>
                            </div>
                            <StatusBadge status={room.status} />
                          </div>

                          {/* Booking Status Overlay */}
                          {isBooked && availability.booking && (
                            <div className="mt-2 pt-2 border-t border-red-200">
                              <div className="flex items-center gap-1 text-xs text-red-700 font-medium">
                                <User size={12} />
                                <span>Booked</span>
                              </div>
                              <button
                                onClick={() => setBookedRoomPopover({ roomId: room._id, booking: availability.booking })}
                                className="mt-1 text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                              >
                                <Info size={10} />
                                <span>View details</span>
                              </button>
                            </div>
                          )}

                          {isAdmin && (
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">
                              <button
                                onClick={() => {
                                  setShowEditRoom(room._id);
                                  setEditRoomData({ capacity: room.capacity });
                                }}
                                className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <select
                                value={room.status}
                                onChange={(e) => handleRoomStatus(room._id, e.target.value)}
                                className="text-xs px-2 py-1 rounded border border-gray-300 bg-white font-medium cursor-pointer hover:border-whatsapp focus:outline-none focus:ring-2 focus:ring-whatsapp"
                              >
                                <option value="active">Active</option>
                                <option value="maintenance">Maintenance</option>
                              </select>
                              <button
                                onClick={() => setConfirmDelete({ type: 'room', id: room._id })}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors ml-auto"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );})}

                      {isAdmin && (
                        <button
                          onClick={() => setShowAddRoom(s._id)}
                          className="bg-gray-100 rounded-lg p-3 border-2 border-dashed border-gray-300 hover:border-whatsapp hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-2 min-h-[100px]"
                        >
                          <Plus size={24} className="text-gray-400" />
                          <span className="text-sm text-gray-600">Add Room</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="mb-2">No rooms in this series</p>
                      {isAdmin && (
                        <button
                          onClick={() => setShowAddRoom(s._id)}
                          className="text-whatsapp hover:text-whatsapp-light font-medium"
                        >
                          Add first room →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
              );})}
            </>
          )}
        </div>
      </div>

      {/* Add Series Modal */}
      {showAddSeries && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add New Series</h3>
              <button onClick={() => setShowAddSeries(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Series Name</label>
                <input
                  type="text"
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="e.g., 300 Series"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAddSeries}
                  className="flex-1 bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors"
                >
                  Add Series
                </button>
                <button
                  onClick={() => setShowAddSeries(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Room to {series.find((s) => s._id === showAddRoom)?.name}</h3>
              <button onClick={() => setShowAddRoom(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                <input
                  type="text"
                  value={newRoom.roomNumber}
                  onChange={(e) => setNewRoom({ ...newRoom, roomNumber: e.target.value })}
                  placeholder="e.g., 301"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input
                  type="number"
                  value={newRoom.capacity}
                  onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
                  placeholder="e.g., 4"
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAddRoom(showAddRoom)}
                  className="flex-1 bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors"
                >
                  Add Room
                </button>
                <button
                  onClick={() => setShowAddRoom(null)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {showEditRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Room</h3>
              <button onClick={() => setShowEditRoom(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input
                  type="number"
                  value={editRoomData.capacity}
                  onChange={(e) => setEditRoomData({ capacity: e.target.value })}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleEditRoom(showEditRoom)}
                  className="flex-1 bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors"
                >
                  Update
                </button>
                <button
                  onClick={() => setShowEditRoom(null)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={24} />
              <h3 className="text-lg font-semibold">
                {confirmDelete.type === 'series' ? 'Delete Series?' : 'Delete Room?'}
              </h3>
            </div>
            <p className="text-gray-600 mb-6">
              {confirmDelete.type === 'series'
                ? 'This will permanently delete the series and all its rooms. This action cannot be undone.'
                : 'This will permanently delete the room. This action cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() =>
                  confirmDelete.type === 'series'
                    ? handleDeleteSeries(confirmDelete.id)
                    : handleDeleteRoom(confirmDelete.id)
                }
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Details Popover */}
      {bookedRoomPopover && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setBookedRoomPopover(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Booking Details</h3>
              <button onClick={() => setBookedRoomPopover(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            {bookedRoomPopover.booking && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Guest Name</p>
                  <p className="font-medium text-gray-800">{bookedRoomPopover.booking.customerName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-800">{bookedRoomPopover.booking.customerPhone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Check-in</p>
                  <p className="font-medium text-gray-800">{new Date(bookedRoomPopover.booking.checkInDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Check-out</p>
                  <p className="font-medium text-gray-800">{new Date(bookedRoomPopover.booking.checkOutDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium text-gray-800 capitalize">{bookedRoomPopover.booking.status.replace('_', ' ')}</p>
                </div>
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={() => {
                  setBookedRoomPopover(null);
                  // Navigate to bookings page - would need routing setup
                  toast.info('Navigate to BookingsPage to view full booking details');
                }}
                className="w-full bg-whatsapp text-white py-2 rounded-lg hover:bg-whatsapp-light transition-colors"
              >
                View Full Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
