import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { 
  Building2, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight,
  Bot,
  Zap,
  Leaf
} from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = {};
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);
    const result = await login(email, password, rememberMe);
    setIsLoading(false);
    
    if (result.success) {
      toast.success('Welcome back to Nandibaag PMS!');
      navigate('/');
    } else {
      console.error('[LoginPage] Login result:', result);
      if (result.message?.includes('Too many requests') || result.status === 429) {
        toast.error('Too many attempts, please try again in a few minutes');
      } else if (result.message?.includes('Network Error') || result.message?.includes('ERR_NETWORK')) {
        toast.error('Network Error: Cannot reach backend server. Check if server is running.');
      } else {
        toast.error(result.message || 'Login failed');
      }
    }
  };

  const handleQuickDemoFill = () => {
    setEmail('admin@nandibaag.com');
    setPassword('admin12345');
    toast.success('Demo admin credentials filled!');
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex font-sans text-slate-100 overflow-hidden relative selection:bg-emerald-500 selection:text-white">
      
      {/* Background Glow Accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 min-h-screen p-4 sm:p-6 lg:p-8 items-center gap-8 z-10">
        
        {/* Left Side: Luxury Branding Canvas (Hidden on small screens) */}
        <div className="hidden lg:flex lg:col-span-7 flex-col justify-between p-8 space-y-12">
          
          {/* Top Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-bold shadow-xl shadow-emerald-500/20">
              <Building2 size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">NANDIBAAG RESORT</h1>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold tracking-wide">
                <Leaf size={13} />
                <span>Pure Veg & Jain Resort • Karjat, Maharashtra</span>
              </div>
            </div>
          </div>

          {/* Hero Content */}
          <div className="space-y-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Sparkles size={14} />
              <span>Next-Gen Resort Property Management System</span>
            </div>

            <h2 className="text-4xl lg:text-5xl font-display font-extrabold text-white leading-tight">
              Intelligent PMS & Automated WhatsApp AI.
            </h2>

            <p className="text-sm text-slate-400 leading-relaxed">
              Streamline cottage room inventory, real-time availability sync, instant PDF invoicing, and 24/7 guest WhatsApp booking automation.
            </p>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xs">
                <Bot className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="text-xs font-bold text-slate-200">WhatsApp AI Agent</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">24/7 Multi-lingual guest auto-replies</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xs">
                <Zap className="text-teal-400 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Zero-Cache Grid</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Instant live cottage availability sync</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Copyright */}
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span>256-bit Encrypted Enterprise Reception Portal</span>
          </div>
        </div>

        {/* Right Side: Ultra-Premium Glass Login Card */}
        <div className="w-full lg:col-span-5 flex justify-center">
          <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/90 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-slate-950 space-y-6">
            
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="lg:hidden w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-emerald-500/20 mx-auto mb-3">
                <Building2 size={24} />
              </div>

              <h3 className="text-2xl font-display font-extrabold text-white tracking-tight">
                Staff Portal Sign In
              </h3>
              <p className="text-xs text-slate-400">
                Enter your administrative credentials to access the resort dashboard.
              </p>
            </div>

            {/* Quick Demo Fill Pill */}
            <button
              type="button"
              onClick={handleQuickDemoFill}
              className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group"
            >
              <Sparkles size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Click to Fill Quick Admin Credentials</span>
            </button>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@nandibaag.com"
                    disabled={isLoading}
                    className={`w-full pl-10 pr-4 py-2.5 text-xs bg-slate-950/80 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500 transition-all ${
                      errors.email ? 'border-rose-500' : 'border-slate-800'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-rose-400 text-[11px] font-medium mt-1">{errors.email}</p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className={`w-full pl-10 pr-10 py-2.5 text-xs bg-slate-950/80 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500 transition-all ${
                      errors.password ? 'border-rose-500' : 'border-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-rose-400 text-[11px] font-medium mt-1">{errors.password}</p>
                )}
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4 rounded text-emerald-500 border-slate-800 bg-slate-950 focus:ring-emerald-500 focus:ring-offset-slate-950"
                  />
                  <span className="text-xs text-slate-400">Remember session (30 days)</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in to Dashboard...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>Sign In to PMS</span>
                    <ArrowRight size={15} />
                  </span>
                )}
              </button>

            </form>

            {/* Sub-footer Note */}
            <div className="pt-2 text-center text-[11px] text-slate-500 border-t border-slate-800/80">
              <p>Nandibaag Resort • Karjat, Maharashtra</p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
