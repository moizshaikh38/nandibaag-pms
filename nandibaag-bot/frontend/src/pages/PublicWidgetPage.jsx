import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Home, Users, MessageSquare, Loader } from 'lucide-react';

export default function PublicWidgetPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [checkInDate, setCheckInDate] = useState(todayStr);
  const [checkOutDate, setCheckOutDate] = useState(tomorrowStr);
  const [guestMembers, setGuestMembers] = useState(2);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPublicAvailability = async () => {
    try {
      setLoading(true);
      const rawUrl = (import.meta.env.VITE_API_URL || 'http://localhost:7000').replace(/\/+$/, '');
      const baseUrl = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`;
      const res = await fetch(`${baseUrl}/availability/public?checkInDate=${checkInDate}&checkOutDate=${checkOutDate}`);
      const data = await res.json();
      setAvailability(data);
    } catch (err) {
      console.error('Failed to load availability', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicAvailability();
  }, [checkInDate, checkOutDate]);

  const formatDMY = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const isAvailable = availability && availability.totalAvailable > 0;
  const whatsappUrl = `https://wa.me/919257657664?text=${encodeURIComponent(
    `Hi Nandibaag Resort, I want to book a room for ${guestMembers} guests from ${formatDMY(checkInDate)} to ${formatDMY(checkOutDate)}.`
  )}`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans text-slate-800 flex items-center justify-center animate-fade-in">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-1 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-600/20">
            <Home size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Nandibaag Resort</h2>
          <p className="text-xs text-slate-500">Check live cottage room availability for your stay dates</p>
        </div>

        {/* Inputs: Check-in, Check-out, Guest Members */}
        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check-in Date</label>
              <div className="space-y-1">
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="text-[10px] font-mono text-emerald-900 font-bold block bg-white px-2 py-0.5 rounded border border-slate-200">
                  {formatDMY(checkInDate)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check-out Date</label>
              <div className="space-y-1">
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <span className="text-[10px] font-mono text-emerald-900 font-bold block bg-white px-2 py-0.5 rounded border border-slate-200">
                  {formatDMY(checkOutDate)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Total Guests / Members</label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="50"
                value={guestMembers}
                onChange={(e) => setGuestMembers(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white font-bold"
              />
              <Users size={15} className="absolute left-3 top-2.5 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Availability Status Box */}
        {loading ? (
          <div className="p-6 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
            <Loader size={16} className="animate-spin text-emerald-600" />
            <span>Checking live availability...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {isAvailable ? (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span>Rooms are Available on these dates!</span>
                </div>
                <p className="text-xs text-emerald-700">
                  Available for <strong>{guestMembers} guests</strong> from <strong>{formatDMY(checkInDate)}</strong> to <strong>{formatDMY(checkOutDate)}</strong>
                </p>
              </div>
            ) : (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-1 text-center">
                <div className="flex items-center justify-center gap-2 text-rose-800 font-bold text-sm">
                  <XCircle size={18} className="text-rose-600" />
                  <span>Rooms are Full for these dates</span>
                </div>
                <p className="text-xs text-rose-700">
                  No rooms available for {guestMembers} guests from {formatDMY(checkInDate)} to {formatDMY(checkOutDate)}. Please select another date.
                </p>
              </div>
            )}

            {/* WhatsApp CTA Button */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full py-3.5 px-4 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-md transition-all ${
                isAvailable
                  ? 'bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] shadow-emerald-600/20'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <MessageSquare size={18} />
              <span>Book Now on WhatsApp</span>
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
