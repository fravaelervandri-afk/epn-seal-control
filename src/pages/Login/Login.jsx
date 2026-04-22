import React, { useState } from 'react';
import { ShieldAlert, User, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../config/supabase';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const authEmail = `${username.trim()}@epn.com`;
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: password,
      });

      if (authError) throw authError;

      // Jika login sukses, paksa browser pindah ke halaman Input Data
      window.location.href = '/input.html';
    } catch (err) {
      setError('Username atau password salah.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white font-sans selection:bg-blue-200">
      <div className="hidden md:flex md:w-1/2 border-r border-gray-100 flex-col justify-center items-center p-12 relative overflow-hidden bg-white">
        <img 
          src="/login-bg.png" 
          alt="" 
          className="absolute inset-0 w-full h-full object-cover opacity-75 pointer-events-none" 
          onError={(e) => { e.target.style.display = 'none'; }} 
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/50 to-[#8dc63f]/30 backdrop-blur-[1px]"></div>
        <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-6 animate-in zoom-in duration-700">
          <img 
            src="/landing-page.png" 
            alt="Security Seal GPS & CCTV" 
            className="w-full h-auto max-w-[12rem] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.2)] hover:scale-105 transition-transform duration-700 ease-out" 
            onError={(e) => { e.target.style.display = 'none'; }} 
          />
          <div className="text-center mt-2 space-y-2">
            <h1 className="text-2xl md:text-[1.75rem] leading-tight font-black text-[#1e293b] tracking-tight drop-shadow-sm">
              Selamat Datang di <span className="text-[#146b99]">EPN Security Seal Control</span>
            </h1>
            <p className="text-slate-900 font-bold text-sm md:text-base drop-shadow-md">
              Pusat Kendali Keamanan Segel Digital Elnusa Petrofin
            </p>
          </div>
        </div>
      </div>
      
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-8 bg-white z-10 relative shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center md:text-left">
            <img 
              src="/logo-elnusa.png" 
              alt="Elnusa Petrofin" 
              className="h-10 object-contain mx-auto md:mx-0 mb-8" 
              onError={(e) => { e.target.style.display='none'; }} 
            />
            <h2 className="text-2xl font-extrabold text-gray-800 mb-2">Login ke Sistem</h2>
            <p className="text-gray-500 text-sm font-medium">Silakan masukkan akun Anda.</p>
          </div>
          
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl flex items-center gap-2 font-medium animate-in fade-in">
              <ShieldAlert size={16} /> {error}
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-[#156592] uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  required 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="username" 
                  className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#146b99] outline-none text-sm font-semibold transition-all bg-white" 
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[#156592] uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="password" 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••" 
                  className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#146b99] outline-none text-sm font-semibold transition-all bg-white" 
                />
              </div>
            </div>
            
            <div className="pt-4">
              <button 
                type="submit" 
                disabled={isLoading} 
                className="w-full bg-[#156592] hover:bg-[#11577c] text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-70"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;