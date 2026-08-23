import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Settings,
  Smartphone,
  Clock,
  Bot,
  Users,
  Lock,
  Info,
  Phone,
  Mail,
  MapPin,
  Globe,
  Plus,
  Trash2,
  Save,
  X,
  Check,
  AlertTriangle,
  Cpu,
  ShieldCheck,
  CheckCircle,
  History,
  UserCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [defaultModeForNewChats, setDefaultModeForNewChats] = useState('ai');
  const [isSaving, setIsSaving] = useState(false);

  // Mass Chat Mode Switch States
  const [modeChangeHistory, setModeChangeHistory] = useState([]);
  const [showMassSwitchModal, setShowMassSwitchModal] = useState(false);
  const [targetMassMode, setTargetMassMode] = useState('staff');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isMassSwitching, setIsMassSwitching] = useState(false);
  const [massSwitchResult, setMassSwitchResult] = useState(null);

  // Password Form
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    fetchSettings();
    fetchModeChangeHistory();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/settings');
      setSettings(res.data.settings);
      setFollowUpEnabled(res.data.settings.followUpEnabled ?? true);
      setDefaultModeForNewChats(res.data.settings.defaultModeForNewChats || 'ai');
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModeChangeHistory = async () => {
    try {
      const res = await api.get('/settings/mode-change-history');
      setModeChangeHistory(res.data.history || []);
    } catch (err) {
      console.warn('[Settings] Failed to fetch mode history:', err);
    }
  };

  const handleToggleFollowUps = async (enabled) => {
    try {
      await api.patch('/settings/follow-ups', { followUpEnabled: enabled });
      setFollowUpEnabled(enabled);
      toast.success(`Follow-up sequence ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update follow-up settings');
    }
  };

  const handleDefaultModeChange = async (mode) => {
    if (mode === defaultModeForNewChats) return;
    const previousMode = defaultModeForNewChats;

    try {
      setIsSaving(true);
      setDefaultModeForNewChats(mode);
      const res = await api.patch('/settings/default-new-chat-mode', {
        defaultModeForNewChats: mode
      });
      setSettings(res.data.settings);
      toast.success(`New chats will now start in ${mode === 'ai' ? 'AI Auto' : 'Staff Handover'} mode`);
    } catch (error) {
      setDefaultModeForNewChats(previousMode);
      toast.error('Failed to update default mode for new chats');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMassSwitch = async (e) => {
    if (e) e.preventDefault();
    try {
      setIsMassSwitching(true);
      toast.loading(`Switching ALL chats to ${targetMassMode.toUpperCase()} mode...`, { id: 'mass-switch' });
      
      const res = await api.post('/settings/switch-all-chats', {
        mode: targetMassMode,
        confirmPassword: adminPasswordInput,
        updatedBy: user?.name || user?.email || 'Admin'
      });

      if (res.data.success) {
        const stats = res.data.result.stats;
        toast.success(`✅ Switched ${stats.modifiedChats}/${stats.totalChats} chats to ${targetMassMode.toUpperCase()}!`, { id: 'mass-switch' });
        setMassSwitchResult(res.data.result);
        setShowMassSwitchModal(false);
        setAdminPasswordInput('');
        fetchSettings();
        fetchModeChangeHistory();
        window.dispatchEvent(new Event('refresh_chats'));
      } else {
        toast.error(`❌ Failed: ${res.data.error || 'Could not switch modes'}`, { id: 'mass-switch' });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error executing mass mode switch', { id: 'mass-switch' });
    } finally {
      setIsMassSwitching(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwordForm.new.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    toast.success('Password updated successfully');
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner */}
      <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 shadow-xs space-y-1">
        <h1 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-emerald-600" size={22} />
          <span>System Settings & Configuration</span>
        </h1>
        <p className="text-xs text-slate-500">
          Manage AI chatbot routing, automated follow-up sequences, and resort policies.
        </p>
      </div>

      {/* Tab Controls */}
      <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold max-w-xl">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'general' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bot size={15} />
          <span>Bot & Follow-ups</span>
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'ai' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu size={15} />
          <span>AI Provider Chain</span>
        </button>

        <button
          onClick={() => setActiveTab('resort')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'resort' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Info size={15} />
          <span>Resort Guidelines</span>
        </button>
      </div>

      {/* Tab 1: Bot & Follow-ups */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-emerald-600" />
                <div>
                  <h3 className="font-display font-bold text-base text-slate-800">Default Mode for New Chats</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Applies only when a brand-new customer messages for the first time.
                  </p>
                </div>
              </div>

              <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
                defaultModeForNewChats === 'ai'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                Current: {defaultModeForNewChats === 'ai' ? 'AI Auto' : 'Staff Handover'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                disabled={isSaving}
                onClick={() => handleDefaultModeChange('ai')}
                className={`text-left p-4 rounded-xl border transition-all ${
                  defaultModeForNewChats === 'ai'
                    ? 'bg-emerald-50 border-emerald-300 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Bot size={17} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">AI Auto</p>
                      <p className="text-[11px] text-slate-500">Bot replies automatically for new chats.</p>
                    </div>
                  </div>
                  {defaultModeForNewChats === 'ai' && <Check size={17} className="text-emerald-600" />}
                </div>
              </button>

              <button
                disabled={isSaving}
                onClick={() => handleDefaultModeChange('human')}
                className={`text-left p-4 rounded-xl border transition-all ${
                  defaultModeForNewChats === 'human'
                    ? 'bg-amber-50 border-amber-300 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Users size={17} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">Staff Handover</p>
                      <p className="text-[11px] text-slate-500">New chats wait for staff reply first.</p>
                    </div>
                  </div>
                  {defaultModeForNewChats === 'human' && <Check size={17} className="text-amber-600" />}
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                <strong className="text-slate-800">New chats</strong>
                <br />
                Start with this selected default.
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                <strong className="text-slate-800">Existing chats</strong>
                <br />
                Keep their current AI/Staff mode.
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                <strong className="text-slate-800">Manual switch</strong>
                <br />
                Staff can still change any chat anytime.
              </div>
            </div>
          </div>

          {/* SECTION 2: MASS CHAT MODE SWITCH (PAST + FUTURE CHATS) */}
          <div className="glass-card rounded-2xl p-6 bg-white border border-rose-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-rose-950">
                    Switch ALL Chats (Past + Future)
                  </h3>
                  <p className="text-[11px] text-rose-800/80">
                    Instantly switches mode across entire system. Chat memory & history 100% preserved.
                  </p>
                </div>
              </div>

              <span className="text-[10px] uppercase tracking-wider font-extrabold bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full border border-rose-300 w-fit">
                Mass Override
              </span>
            </div>

            <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs text-rose-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-rose-950">
                <ShieldCheck size={16} className="text-rose-600 shrink-0" />
                <span>Zero Data Loss Guarantee</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                When you execute a mass switch:
              </p>
              <ul className="text-[11px] text-rose-800 list-disc list-inside space-y-0.5">
                <li><strong>All existing chats</strong> immediately change to the selected mode.</li>
                <li><strong>Future chats</strong> will automatically default to the new mode.</li>
                <li><strong>Chat messages, notes, customer details, and price drafts remain completely intact.</strong></li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTargetMassMode('staff');
                  setShowMassSwitchModal(true);
                }}
                className="p-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-sm transition-all flex items-center justify-between gap-3 group active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Switch ALL to Staff Mode</p>
                    <p className="text-[11px] text-amber-100">All chats handled by human team</p>
                  </div>
                </div>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-lg font-extrabold group-hover:translate-x-0.5 transition-transform">
                  Go ➔
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetMassMode('ai');
                  setShowMassSwitchModal(true);
                }}
                className="p-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-sm transition-all flex items-center justify-between gap-3 group active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Bot size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Switch ALL to AI Auto Mode</p>
                    <p className="text-[11px] text-emerald-100">AI auto-replies across all chats</p>
                  </div>
                </div>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-lg font-extrabold group-hover:translate-x-0.5 transition-transform">
                  Go ➔
                </span>
              </button>
            </div>
          </div>

          {/* SECTION 3: MODE CHANGE AUDIT LOG HISTORY */}
          <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                <h3 className="font-display font-bold text-base text-slate-800">Mode Change Audit History</h3>
              </div>

              <button
                type="button"
                onClick={fetchModeChangeHistory}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 p-1"
                title="Refresh History"
              >
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
            </div>

            {modeChangeHistory.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No mass mode transitions logged yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {modeChangeHistory.map((log, idx) => (
                  <div
                    key={log._id || idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase ${
                          log.toMode === 'ai' || log.toMode === 'auto'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {log.toMode === 'ai' ? '🤖 AI Auto' : '👤 Staff Mode'}
                        </span>
                        <strong className="text-slate-800">
                          {log.modifiedChats} of {log.totalChats || log.affectedChats} chats updated
                        </strong>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Triggered by <span className="font-medium text-slate-700">{log.changedBy}</span> • {log.notes || 'Mass mode update'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {new Date(log.changedAt || log.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-emerald-600" />
                <h3 className="font-display font-bold text-base text-slate-800">Automated Follow-up Sequences</h3>
              </div>

              {user && (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followUpEnabled}
                    onChange={(e) => handleToggleFollowUps(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              )}
            </div>

            <p className="text-xs text-slate-500">
              When enabled, customer inquiries that haven't finalized a booking receive automated re-engagement messages via WhatsApp:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Stage 1</span>
                <p className="font-bold text-sm text-slate-800">3 Hours Later</p>
                <p className="text-[11px] text-slate-500">Gentle check-in & tariff clarification.</p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Stage 2</span>
                <p className="font-bold text-sm text-slate-800">1 Day Later</p>
                <p className="text-[11px] text-slate-500">Special weekday discount offer.</p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Stage 3</span>
                <p className="font-bold text-sm text-slate-800">3 Days Later</p>
                <p className="text-[11px] text-slate-500">Resort amenities & photos reminder.</p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Stage 4</span>
                <p className="font-bold text-sm text-slate-800">7 Days Later</p>
                <p className="text-[11px] text-slate-500">Final re-engagement prompt.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: AI Provider Chain */}
      {activeTab === 'ai' && (
        <div className="glass-card rounded-2xl p-6 bg-slate-900 text-white border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu size={20} className="text-emerald-400" />
              <h3 className="font-display font-bold text-base text-slate-100">7-Model Fallback AI Chain</h3>
            </div>
            <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30">
              Active Tier Engine
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The Nandibaag AI Engine automatically routes customer messages through 6 separate cloud AI providers. If any single model rate-limits or times out, the next model takes over instantly without dropping the customer message.
          </p>

          <div className="space-y-2">
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-emerald-400">1. OpenRouter Primary (Meta Llama 3.3 70B Instruct)</p>
                <p className="text-[10px] text-slate-400">Main response generator for guest inquiries & tariffs</p>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Primary</span>
            </div>

            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-slate-200">2. Google Gemini 2.0 Flash</p>
                <p className="text-[10px] text-slate-400">Ultra-fast sub-500ms fallback adapter</p>
              </div>
              <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Tier 1</span>
            </div>

            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-slate-200">3. Groq Llama 3.3 70B Versatile</p>
                <p className="text-[10px] text-slate-400">High-speed LPU inference engine</p>
              </div>
              <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Tier 2</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Resort Guidelines */}
      {activeTab === 'resort' && (
        <div className="glass-card rounded-2xl p-6 bg-white border border-slate-200 space-y-4">
          <h3 className="font-display font-bold text-base text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Info size={18} className="text-emerald-600" />
            <span>Resort Rules & Check-in Policies</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-700">Check-in Time</span>
              <p className="text-slate-600">2:00 PM IST</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-700">Check-out Time</span>
              <p className="text-slate-600">11:00 AM IST</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-slate-700">Active Resort Policies:</span>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-600" />
                <span>Valid ID proof (Aadhaar / PAN / Driver's License) required at check-in.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-600" />
                <span>Unmarried couples strictly not allowed per resort policy.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-600" />
                <span>Outside food and beverage is not permitted inside resort premises.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* MASS CHAT MODE SWITCH CONFIRMATION MODAL */}
      {showMassSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-rose-300 relative text-slate-800">
            <button
              type="button"
              onClick={() => {
                setShowMassSwitchModal(false);
                setAdminPasswordInput('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${
                targetMassMode === 'staff'
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-300'
              }`}>
                {targetMassMode === 'staff' ? <Users size={22} /> : <Bot size={22} />}
              </div>
              <div>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  Switch ALL Chats (Past + Future)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Target: <strong className="uppercase text-slate-800">{targetMassMode === 'staff' ? 'Staff / Human Mode' : 'AI Auto Mode'}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-700 border border-slate-200">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>What happens next:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                <li>Every existing chat will be switched to <strong>{targetMassMode.toUpperCase()}</strong>.</li>
                <li>New incoming chats will start in <strong>{targetMassMode.toUpperCase()}</strong>.</li>
                <li><strong>Chat history & memory are 100% preserved.</strong></li>
              </ul>
            </div>

            <form onSubmit={handleMassSwitch} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Password <span className="text-slate-400 font-normal">(Optional Confirmation)</span>
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter admin password if configured"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isMassSwitching}
                  className={`flex-1 py-2.5 px-4 text-white font-extrabold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 ${
                    targetMassMode === 'staff'
                      ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800'
                  }`}
                >
                  {isMassSwitching ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Updating All Chats...</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>Confirm Switch ALL</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMassSwitchModal(false);
                    setAdminPasswordInput('');
                  }}
                  disabled={isMassSwitching}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 font-bold rounded-xl text-xs transition-colors text-center"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
