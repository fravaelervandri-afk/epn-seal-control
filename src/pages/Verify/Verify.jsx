import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import '../../index.css';

const Verify = () => {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState([]);
  const [sealId, setSealId] = useState('');

  useEffect(() => {
    // Mengambil parameter ID dari URL (?verify=EPN-XXXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('verify');
    
    if (!id) {
      setStatus('invalid');
      return;
    }

    setSealId(id);

    const checkSeal = async () => {
      try {
        // PERBAIKAN: Menghapus .single() agar bisa membaca "Double Segel"
        const { data: sealData, error } = await supabase
          .from('installed_seals')
          .select('*')
          .eq('sealId', id)
          .eq('status', 'Terpasang');

        if (error) throw error;

        // Jika data ditemukan (1 atau lebih baris), maka statusnya Valid
        if (sealData && sealData.length > 0) {
          setData(sealData);
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus('invalid');
      }
    };
    
    checkSeal();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6 font-sans selection:bg-blue-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-in zoom-in duration-500 border border-slate-100">
         
         {/* HEADER LOGO */}
         <div className="bg-slate-900 p-5 flex justify-center border-b-4 border-[#8dc63f]">
             <img src="/logo-elnusa.png" alt="Elnusa Logo" className="h-8 object-contain brightness-0 invert" onError={(e) => e.target.style.display='none'} />
         </div>
         
         <div className="p-8 flex flex-col items-center text-center">
            
            {/* STATE 1: LOADING */}
            {status === 'loading' && (
               <div className="py-12 flex flex-col items-center">
                  <Loader2 size={48} className="animate-spin text-[#146b99] mb-4" />
                  <p className="text-slate-500 font-bold">Memverifikasi Data Segel...</p>
               </div>
            )}
            
            {/* STATE 2: VALID (Bisa memuat Single atau Double Segel) */}
            {status === 'valid' && (
               <>
                  <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner ring-4 ring-emerald-50">
                     <ShieldCheck size={48} />
                  </div>
                  <h2 className="text-3xl font-black text-slate-800 mb-2">SEAL VALID</h2>
                  <p className="text-slate-500 font-medium mb-6">Segel ini resmi terdaftar di sistem keamanan Elnusa Petrofin.</p>
                  
                  <div className="w-full bg-slate-50 rounded-2xl p-5 text-left border border-slate-200 shadow-sm space-y-4">
                     <div className="border-b border-slate-200 pb-3">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ID Segel Terpindai</p>
                        <p className="font-mono font-black text-[#146b99] text-xl bg-blue-50 px-3 py-1 rounded-lg inline-block mt-1 border border-blue-100">
                           {sealId}
                        </p>
                        
                        {/* Indikator Peringatan Double Segel */}
                        {data.length > 1 && (
                           <div className="mt-3 bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-amber-800 text-xs font-bold flex items-center gap-2">
                              <span>⚠️</span> Terdapat {data.length} fisik segel aktif yang dipasang menggunakan ID ini.
                           </div>
                        )}
                     </div>
                     
                     <div className="space-y-4">
                        {data.map((item, idx) => (
                           <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                              <div className="flex justify-between items-center mb-3 border-b border-slate-50 pb-2">
                                 <p className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
                                    Detail Fisik Segel {data.length > 1 ? idx + 1 : ''}
                                 </p>
                                 <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border border-emerald-200">
                                    TERPASANG
                                 </span>
                              </div>
                              <div className="space-y-1.5">
                                 <p className="text-sm"><span className="text-slate-500 font-medium">Kendaraan:</span> <span className="font-black text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{item.nopol}</span></p>
                                 <p className="text-sm"><span className="text-slate-500 font-medium">Posisi Objek:</span> <span className="font-bold text-slate-800">{item.seal_category}</span></p>
                                 <p className="text-sm"><span className="text-slate-500 font-medium">Jenis Segel:</span> <span className="font-bold text-slate-800">{item.seal_type}</span></p>
                                 <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-50 flex flex-col gap-0.5">
                                    <span>Dipasang oleh: <b className="text-slate-600">{item.pic}</b> ({item.location})</span>
                                    <span>Waktu Pasang: <b className="text-slate-600">{item.installDate}</b></span>
                                 </p>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </>
            )}
            
            {/* STATE 3: INVALID */}
            {status === 'invalid' && (
               <>
                  <div className="w-24 h-24 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-6 shadow-inner ring-4 ring-rose-50">
                     <ShieldAlert size={48} />
                  </div>
                  <h2 className="text-3xl font-black text-rose-600 mb-2">INVALID</h2>
                  <p className="text-slate-600 font-medium mb-6">Segel tidak ditemukan dalam database aktif atau telah diganti/dirusak.</p>
                  
                  <div className="w-full bg-rose-50 rounded-2xl p-5 text-center border border-rose-100 shadow-sm">
                     <p className="text-[10px] uppercase font-bold text-rose-400 tracking-wider mb-2">ID Segel Terpindai</p>
                     <div className="font-mono font-black text-rose-700 text-xl bg-white px-4 py-2 rounded-xl inline-block border border-rose-200 shadow-sm">
                        {sealId || 'Tidak Terbaca'}
                     </div>
                     <p className="text-[11px] text-rose-600 font-semibold mt-4 leading-relaxed bg-white/50 p-2 rounded-lg">
                        Peringatan: Jika benda fisik segel terpasang, hal ini mengindikasikan adanya indikasi pemalsuan, penggunaan ulang yang ilegal, atau kerusakan.
                     </p>
                  </div>
               </>
            )}

            <button onClick={() => window.location.href = '/'} className="mt-8 w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-colors shadow-sm border border-slate-200 flex items-center justify-center gap-2">
               Masuk ke Dasbor Sistem
            </button>
         </div>
         
         {/* FOOTER */}
         <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sistem Keamanan Segel - Elnusa Petrofin</p>
         </div>
      </div>
    </div>
  );
};

export default Verify;
