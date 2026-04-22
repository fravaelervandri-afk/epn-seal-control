import React, { useState, useEffect } from 'react';
import { Menu, ChevronRight, Loader2, CheckCircle2, User } from 'lucide-react';
import { supabase } from '../config/supabase';

const Header = ({ activeMenuLabel, setIsMobileMenuOpen, currentUser, isSyncing }) => {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // ======================================================================
  // FITUR AUTO LOGOUT (IDLE TIMEOUT 2 JAM)
  // ======================================================================
  useEffect(() => {
    const TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 Jam (7.200.000 ms)
    
    // Fungsi untuk memperbarui penanda waktu aktivitas
    const resetTimer = () => {
      const now = Date.now();
      const lastActivityStr = localStorage.getItem('lastActivity');
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;

      // Update localStorage maksimal 1x setiap 5 detik untuk efisiensi baterai/performa
      if (now - lastActivity > 5000) {
        localStorage.setItem('lastActivity', now.toString());
      }
    };

    // Fungsi utama pengecekan durasi diam
    const checkTimeout = async () => {
      const lastActivityStr = localStorage.getItem('lastActivity');
      
      if (lastActivityStr) {
        const lastActivity = parseInt(lastActivityStr, 10);
        const diff = Date.now() - lastActivity;

        if (diff > TIMEOUT_MS) {
          // Bersihkan data dan paksa keluar
          localStorage.removeItem('lastActivity');
          await supabase.auth.signOut();
          
          // Redirect ke login
          window.location.href = '/index.html'; 
        }
      } else {
        // Jika baru pertama masuk/login, set aktivitas sekarang
        localStorage.setItem('lastActivity', Date.now().toString());
      }
    };

    // 1. Cek Langsung (Penting untuk HP saat buka tab lama atau kembali ke browser)
    checkTimeout();

    // 2. Pantau aktivitas pengguna
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));

    // 3. Tambahan untuk HP: Cek saat tab menjadi aktif kembali
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTimeout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Interval pengecekan rutin setiap 1 menit
    const intervalId = setInterval(checkTimeout, 60000);

    return () => {
      events.forEach(event => document.removeEventListener(event, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);
  // ======================================================================

  const handleLogout = async () => {
    localStorage.removeItem('lastActivity');
    await supabase.auth.signOut();
    window.location.href = '/index.html';
  };

  return (
    <header className="bg-white h-16 flex items-center px-4 md:px-8 border-b border-slate-200 justify-between shrink-0 sticky top-0 z-10 w-full shadow-sm">
      <div className="flex items-center gap-4">
        <button 
          className="md:hidden text-slate-500 hover:text-[#146b99] transition-colors" 
          onClick={() => setIsMobileMenuOpen(true)}
        >
           <Menu size={24} />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400 font-semibold">
          <span>Beranda</span> <ChevronRight size={14} />
          <span className="text-[#146b99] font-bold capitalize">{activeMenuLabel}</span>
          
          <div className="ml-4 pl-4 border-l border-slate-200 flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
             {isSyncing ? (
               <><Loader2 size={14} className="animate-spin text-blue-500" /> </>
             ) : (
               <><CheckCircle2 size={14} className="text-emerald-500" /></>
             )}
          </div>
        </div>
      </div>
      
      {currentUser && (
        <div className="flex items-center gap-3 md:gap-4">
          <div className="hidden sm:flex flex-col text-right">
             <p className="text-sm font-black text-[#146b99] leading-none mb-1">{currentUser.name}</p>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">{currentUser.role}</p>
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsLogoutModalOpen(!isLogoutModalOpen)} 
              className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors shrink-0 focus:outline-none"
            >
               <User size={20} />
            </button>
            
            {isLogoutModalOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-slate-200 rounded-md shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-3 text-sm text-slate-700 font-semibold uppercase tracking-wide truncate">
                  {currentUser.name}
                </div>
                <div className="border-t border-slate-200"></div>
                <button 
                  onClick={handleLogout} 
                  className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors rounded-b-md font-bold"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;