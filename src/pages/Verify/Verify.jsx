import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, MapPin, Calendar, Hash, User, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../../config/supabase.js';

const Verify = () => {
  const [loading, setLoading] = useState(true);
  const [sealData, setSealData] = useState(null);
  const [sealId, setSealId] = useState('');

  useEffect(() => {
    const checkSeal = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        // Mengambil ID dari parameter ?verify=
        const id = urlParams.get('verify');
        
        if (!id) {
          setLoading(false);
          return;
        }

        setSealId(id);

        // Melakukan pengecekan ID ke database Supabase
        const { data, error } = await supabase
          .from('installed_seals')
          .select('*')
          .eq('sealId', id)
          .eq('status', 'Terpasang')
          .single();

        if (error || !data) {
          setSealData(null);
        } else {
          setSealData(data);
        }
      } catch (err) {
        console.error("Gagal memverifikasi:", err);
        setSealData(null);
      } finally {
        setLoading(false);
      }
    };

    checkSeal();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <Loader2 className="animate-spin text-[#146b99] mb-4" size={48} />
        <p className="text-slate-600 font-bold animate-pulse">Memverifikasi Status Segel...</p>
      </div>
    );
  }

  // Jika URL diakses tanpa parameter ?verify=
  if (!sealId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <ShieldAlert className="text-slate-400 mb-4" size={64} />
        <h1 className="text-xl font-bold text-slate-700 mb-2">ID Tidak Ditemukan</h1>
        <p className="text-slate-500 text-center text-sm">Harap akses halaman ini melalui pemindaian QR Code pada fisik segel.</p>
      </div>
    );
  }

  // Jika ID ditemukan tapi tidak terdaftar di database (Invalid)
  if (!sealData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 pt-10 md:pt-16 font-sans">
        <div className="w-full flex justify-center mb-6">
           <img src="/logo-elnusa.png" alt="[Logo Elnusa]" className="h-8 md:h-10 object-contain opacity-70 grayscale" onError={(e) => e.target.style.display='none'} />
        </div>

        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-300">
          <div className="bg-red-500 p-8 flex flex-col items-center text-white relative">
            <div className="absolute inset-0 bg-red-600 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)' }}></div>
            <XCircle size={72} className="mb-4 relative z-10 drop-shadow-md" />
            <h1 className="text-3xl font-black tracking-widest relative z-10 drop-shadow-md">INVALID</h1>
            <p className="text-red-100 mt-2 font-bold relative z-10 bg-red-700/50 px-4 py-1.5 rounded-full text-sm shadow-inner">
              Tidak Terdaftar / Dirusak
            </p>
          </div>
          
          <div className="p-6 md:p-8 bg-white flex flex-col items-center text-center">
            <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">ID Segel Terpindai:</p>
            <div className="bg-slate-100 px-5 py-2.5 rounded-xl font-mono font-black text-xl text-slate-800 mb-6 tracking-widest border border-slate-200 w-full shadow-inner">
              {sealId}
            </div>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              Peringatan: Segel fisik ini tidak ditemukan dalam database sistem aktif kami. Jika benda fisik segel terpasang, hal ini mengindikasikan adanya indikasi pemalsuan atau kerusakan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Jika ID ditemukan dan Valid di database
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 pt-10 md:pt-16 font-sans">
      
      <div className="w-full flex justify-center mb-6">
         <img src="/logo-elnusa.png" alt="[Logo Elnusa]" className="h-8 md:h-10 object-contain opacity-90" onError={(e) => e.target.style.display='none'} />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-emerald-100 animate-in zoom-in-95 duration-300">
        
        {/* HEADER VALID */}
        <div className="bg-[#10b981] p-8 flex flex-col items-center text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[#059669] opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)' }}></div>
          <ShieldCheck size={72} className="mb-4 relative z-10 drop-shadow-md" />
          <h1 className="text-4xl font-black tracking-widest relative z-10 drop-shadow-md">VALID</h1>
          <p className="text-emerald-50 mt-3 font-bold relative z-10 bg-emerald-800/40 px-4 py-1.5 rounded-full text-sm shadow-inner backdrop-blur-sm border border-emerald-400/30">
            Resmi Terdaftar
          </p>
        </div>
        
        {/* KONTEN DETAIL */}
        <div className="p-6 md:p-8 bg-white">
          <div className="flex justify-center mb-8">
            <div className="bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-200 shadow-inner w-full text-center">
              <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mb-1.5">ID SEGEL</p>
              <p className="font-mono font-black text-2xl md:text-3xl text-emerald-800 tracking-wider">{sealData.sealId}</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 transition-colors hover:bg-slate-100">
              <div className="bg-blue-100 p-2.5 rounded-lg shrink-0 mt-0.5"><Hash size={20} className="text-blue-700" /></div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Kategori Segel</p>
                <p className="font-bold text-slate-800 text-sm md:text-base leading-tight">{sealData.seal_category}</p>
                <p className="text-xs text-slate-500 font-semibold mt-1">{sealData.seal_type}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 transition-colors hover:bg-slate-100">
              <div className="bg-emerald-100 p-2.5 rounded-lg shrink-0 mt-0.5"><MapPin size={20} className="text-emerald-700" /></div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Lokasi & Objek</p>
                <p className="font-bold text-slate-800 text-sm md:text-base leading-tight">{sealData.location}</p>
                <div className="mt-1.5">
                  <span className="text-xs font-black text-slate-700 bg-slate-200 px-2 py-1 rounded-md tracking-wider">
                    {sealData.nopol}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 transition-colors hover:bg-slate-100">
              <div className="bg-amber-100 p-2.5 rounded-lg shrink-0 mt-0.5"><Calendar size={20} className="text-amber-700" /></div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Waktu Pemasangan</p>
                <p className="font-bold text-slate-800 text-sm md:text-base leading-tight">{sealData.installDate}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 transition-colors hover:bg-slate-100">
              <div className="bg-purple-100 p-2.5 rounded-lg shrink-0 mt-0.5"><User size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Dipasang Oleh</p>
                <p className="font-bold text-slate-800 text-sm md:text-base leading-tight">{sealData.pic}</p>
              </div>
            </div>
          </div>

          {sealData.photo && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3 text-center">Foto Bukti Fisik</p>
              <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100 shadow-sm relative group">
                <img 
                  src={sealData.photo} 
                  alt="Bukti Fisik Segel" 
                  className="w-full h-auto object-cover" 
                />
              </div>
            </div>
          )}
        </div>
        
        {/* FOOTER */}
        <div className="bg-slate-100 p-4 text-center border-t border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sistem Keamanan Segel - Elnusa Petrofin</p>
        </div>
      </div>
    </div>
  );
};

export default Verify;
