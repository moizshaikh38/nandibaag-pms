import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { 
  Plus, 
  QrCode, 
  Smartphone, 
  RefreshCw, 
  X, 
  Copy, 
  Check, 
  CheckCircle, 
  AlertTriangle, 
  Loader, 
  ShieldCheck, 
  PhoneCall, 
  Trash2,
  Sparkles,
  Radio
} from 'lucide-react';

const statusConfig = {
  connected: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Connected', icon: CheckCircle },
  connecting: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Connecting', icon: RefreshCw },
  disconnected: { color: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Disconnected', icon: AlertTriangle },
  not_initialized: { color: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Not Initialized', icon: AlertTriangle }
};

export default function ConnectPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const [sessions, setSessions] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState('qr'); // 'qr' or 'pairing'
  const [newSessionLabel, setNewSessionLabel] = useState('resort_primary');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(null);

  // Connection state machine
  const [connState, setConnState] = useState('idle');
  // 'idle' | 'initializing' | 'qr_ready' | 'connected' | 'init_failed' | 'auth_failed'
  const [qrCode, setQrCode] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pollIntervalRef = useRef(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.get('/whatsapp/sessions');
      setSessions(response.data.sessions || {});
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Backup polling while modal is open
  useEffect(() => {
    if (!currentSessionId || connState === 'connected' || connState === 'idle') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await api.get('/whatsapp/sessions');
        const sessionStatus = response.data.sessions?.[currentSessionId];
        const qr = response.data.qrCodes?.[currentSessionId] || (response.data.qrCodes ? Object.values(response.data.qrCodes)[0] : null);
        
        if (sessionStatus === 'connected') {
          setConnState('connected');
          setSessions(response.data.sessions);
        } else if (qr && connState !== 'connected') {
          setQrCode(qr);
          setConnState('qr_ready');
        }
      } catch (_) {}
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [currentSessionId, connState]);

  // Socket listener bindings
  useEffect(() => {
    if (!socket) return;

    const handleQR = (data) => {
      console.log('RECEIVED whatsapp:qr event:', data);
      if (data.qr) {
        setQrCode(data.qr);
        setConnState('qr_ready');
      }
    };

    const handleReady = (data) => {
      console.log('RECEIVED whatsapp:ready event:', data);
      setConnState('connected');
      toast.success('WhatsApp Session Connected!');
      fetchSessions();
    };

    const handlePairingCode = (data) => {
      if (data.sessionId === currentSessionId) {
        setPairingCode(data.code);
        setConnState('qr_ready');
      }
    };

    const handleAuthFailure = (data) => {
      if (data.sessionId === currentSessionId) {
        setConnState('auth_failed');
        setErrorMessage(data.message || 'Authentication failed');
      }
    };

    const handleInitFailed = (data) => {
      if (data.sessionId === currentSessionId) {
        setConnState('init_failed');
        setErrorMessage(data.message || 'Initialization failed');
      }
    };

    const handleNumberDeleted = (data) => {
      toast.success('Number deleted — you can add it again with the same label');
      fetchSessions();
    };

    socket.on('whatsapp:qr', handleQR);
    socket.on('whatsapp:ready', handleReady);
    socket.on('whatsapp:pairing_code', handlePairingCode);
    socket.on('whatsapp:auth_failure', handleAuthFailure);
    socket.on('whatsapp:init_failed', handleInitFailed);
    socket.on('number_deleted', handleNumberDeleted);
    socket.on('whatsapp:number_deleted', handleNumberDeleted);
    socket.on('whatsapp:session_destroyed', handleNumberDeleted);

    return () => {
      socket.off('whatsapp:qr', handleQR);
      socket.off('whatsapp:ready', handleReady);
      socket.off('whatsapp:pairing_code', handlePairingCode);
      socket.off('whatsapp:auth_failure', handleAuthFailure);
      socket.off('whatsapp:init_failed', handleInitFailed);
      socket.off('number_deleted', handleNumberDeleted);
      socket.off('whatsapp:number_deleted', handleNumberDeleted);
      socket.off('whatsapp:session_destroyed', handleNumberDeleted);
    };
  }, [socket, currentSessionId, fetchSessions]);

  const [isDeleting, setIsDeleting] = useState(false);

  const handleStartConnection = async () => {
    if (!newSessionLabel.trim()) {
      toast.error('Please enter a session label');
      return;
    }

    setConnState('initializing');
    setQrCode(null);
    setPairingCode(null);
    setErrorMessage('');
    setCurrentSessionId(newSessionLabel);

    if (connectionMethod === 'qr') {
      try {
        await api.post('/whatsapp/sessions', {
          sessionId: newSessionLabel,
          cleanStart: true
        });
      } catch (error) {
        setConnState('init_failed');
        setErrorMessage(error.response?.data?.message || 'Failed to start QR session');
      }
    } else {
      if (!phoneNumber.trim()) {
        toast.error('Please enter a phone number for pairing');
        setConnState('idle');
        return;
      }
      try {
        await api.post(`/whatsapp/sessions/${newSessionLabel}/pairing-code`, {
          phoneNumber: phoneNumber.replace(/\D/g, '')
        });
      } catch (error) {
        setConnState('init_failed');
        setErrorMessage(error.response?.data?.message || 'Failed to request pairing code');
      }
    }
  };

  const handleDisconnect = async (sessionId) => {
    setIsDeleting(true);
    try {
      try {
        await api.delete(`/numbers/${sessionId}`);
      } catch (numErr) {
        await api.delete(`/whatsapp/sessions/${sessionId}`);
      }
      toast.success('Number deleted — you can add it again with the same label');
      setShowDisconnectConfirm(null);
      fetchSessions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete WhatsApp number');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Pairing code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setConnState('idle');
    setQrCode(null);
    setPairingCode(null);
    setCurrentSessionId(null);
  };

  const sessionEntries = Object.entries(sessions);
  const activeCount = sessionEntries.filter(([_, s]) => s === 'connected').length;

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-6 md:p-8 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <QrCode size={240} />
        </div>

        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
            <Sparkles size={14} />
            <span>Baileys Multi-Device WhatsApp Engine</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
            WhatsApp Connection Hub
          </h1>
          
          <p className="text-slate-300 text-sm leading-relaxed">
            Link resort WhatsApp numbers to enable AI auto-replies, lead scoring, and automated guest follow-up sequences.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md">
              <Radio size={14} className="text-emerald-400 animate-pulse" />
              <span>Active Sessions: <strong>{activeCount}</strong></span>
            </div>

            {isAdmin && (
              <button
                onClick={() => { setShowAddModal(true); setConnState('idle'); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
              >
                <Plus size={16} />
                <span>Connect New Number</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active Sessions Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold text-slate-800 flex items-center gap-2">
            <Smartphone size={20} className="text-emerald-600" />
            <span>Configured WhatsApp Sessions</span>
          </h2>

          <button
            onClick={fetchSessions}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Sessions"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {sessionEntries.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <QrCode size={24} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No Active WhatsApp Sessions</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No numbers are currently paired. Click below to generate a QR code or pairing code.
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl transition-all"
              >
                <Plus size={15} />
                <span>Add First Number</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessionEntries.map(([sessionId, status]) => {
              const cfg = statusConfig[status] || statusConfig.not_initialized;
              const StatusIcon = cfg.icon;

              return (
                <div key={sessionId} className="glass-card rounded-xl p-5 space-y-4 hover:shadow-md transition-all border border-slate-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <Smartphone size={20} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">{sessionId}</h3>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border mt-1 ${cfg.color}`}>
                          <StatusIcon size={12} />
                          <span>{cfg.label}</span>
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        {status !== 'connected' && (
                          <button
                            onClick={() => {
                              setNewSessionLabel(sessionId);
                              setShowAddModal(true);
                              setConnState('idle');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 shadow-xs"
                            title="Reconnect this number via QR code or Pairing Code"
                          >
                            <QrCode size={13} />
                            <span>Reconnect</span>
                          </button>
                        )}
                        <button
                          onClick={() => setShowDisconnectConfirm(sessionId)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Disconnect Session"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span>Auto AI Reply: <strong className={status === 'connected' ? 'text-emerald-700' : 'text-slate-500'}>{status === 'connected' ? 'Active' : 'Paused'}</strong></span>
                    <span>Role: <strong className="text-slate-700">Primary</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete / Disconnect Number Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-sm w-full p-6 space-y-4 bg-white animate-fade-in shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={20} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-bold text-slate-800 text-base">Delete '{showDisconnectConfirm}'?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Delete '<strong>{showDisconnectConfirm}</strong>'? This will disconnect this WhatsApp number and permanently remove its session — you can add a new number with the same label afterward, but chat history for this number will remain in the Chats list.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDisconnectConfirm(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisconnect(showDisconnectConfirm)}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Number</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Connect Session Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 space-y-5 bg-white animate-fade-in shadow-2xl relative overflow-hidden">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X size={18} />
            </button>

            <div className="space-y-1">
              <h3 className="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
                <QrCode className="text-emerald-600" size={20} />
                <span>Link WhatsApp Number</span>
              </h3>
              <p className="text-xs text-slate-500">
                Choose to connect via QR Code scan or an 8-digit Pairing Code.
              </p>
            </div>

            {/* Connection Method Tabs */}
            <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setConnectionMethod('qr')}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  connectionMethod === 'qr' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <QrCode size={14} />
                <span>QR Code Scan</span>
              </button>

              <button
                onClick={() => setConnectionMethod('pairing')}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  connectionMethod === 'pairing' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <PhoneCall size={14} />
                <span>Pairing Code</span>
              </button>
            </div>

            {/* Session Label & Phone Input */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session Name / Identifier
                </label>
                <input
                  type="text"
                  value={newSessionLabel}
                  onChange={(e) => setNewSessionLabel(e.target.value)}
                  placeholder="resort_primary"
                  disabled={connState !== 'idle'}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {connectionMethod === 'pairing' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Phone Number (with country code)
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+919876543210"
                    disabled={connState !== 'idle'}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Interactive Connection Render Area */}
            {connState === 'idle' && (
              <button
                onClick={handleStartConnection}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all"
              >
                {connectionMethod === 'qr' ? 'Generate QR Code' : 'Request Pairing Code'}
              </button>
            )}

            {connState === 'initializing' && (
              <div className="py-8 text-center space-y-3">
                <Loader size={32} className="animate-spin text-emerald-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Starting Baileys WhatsApp Engine...</p>
              </div>
            )}

            {connState === 'qr_ready' && connectionMethod === 'qr' && qrCode && (
              <div className="py-4 text-center space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-inner inline-block relative group">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-52 h-52 mx-auto rounded-lg" />
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Open WhatsApp ➔ Linked Devices ➔ Scan this QR Code
                </p>
              </div>
            )}

            {connState === 'qr_ready' && connectionMethod === 'pairing' && pairingCode && (
              <div className="py-4 text-center space-y-4 bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                <span className="text-xs font-semibold text-emerald-800">Your WhatsApp Pairing Code</span>
                <div className="flex items-center justify-center gap-2">
                  <span className="font-mono font-bold text-2xl tracking-widest text-slate-900 bg-white px-4 py-2 rounded-xl border border-emerald-300 shadow-xs">
                    {pairingCode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(pairingCode)}
                    className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                    title="Copy Code"
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <p className="text-xs text-slate-600">
                  Enter this 8-digit code in WhatsApp under <strong>Linked Devices ➔ Link with phone number</strong>.
                </p>
              </div>
            )}

            {connState === 'connected' && (
              <div className="py-6 text-center space-y-3 bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                <CheckCircle size={40} className="text-emerald-600 mx-auto animate-bounce" />
                <h4 className="font-bold text-slate-800 text-sm">Session Successfully Linked!</h4>
                <p className="text-xs text-slate-600">WhatsApp bot is now active for this number.</p>
              </div>
            )}

            {connState === 'init_failed' && (
              <div className="py-4 text-center space-y-3 bg-rose-50 rounded-2xl p-4 border border-rose-200">
                <AlertTriangle size={32} className="text-rose-600 mx-auto" />
                <p className="text-xs font-semibold text-rose-800">{errorMessage || 'Initialization failed'}</p>
                <button
                  onClick={() => setConnState('idle')}
                  className="px-4 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700"
                >
                  Try Again
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
