import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Camera, ScanLine, Scan, X, Loader2, SwitchCamera, ShieldCheck, ShieldAlert } from 'lucide-react';

// Fungsi helper untuk memuat jsQR secara dinamis (mencegah error kompilasi Vite)
const loadJsQR = () => {
  return new Promise((resolve, reject) => {
    if (window.jsQR) return resolve(window.jsQR);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.onload = () => resolve(window.jsQR);
    script.onerror = () => reject(new Error("Gagal memuat modul QR"));
    document.body.appendChild(script);
  });
};

const extractSealId = (text) => {
  try {
      if (text.includes('?verify=')) {
          const url = new URL(text);
          return url.searchParams.get('verify') || text;
      }
      return text;
  } catch(e) { return text; }
};

const Scanner = ({ session }) => {
  // --- STATE GLOBAL HALAMAN (MPA) ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  const [generateHistory, setGenerateHistory] = useState([]);
  const [installedSeals, setInstalledSeals] = useState([]);

  // --- STATE SCANNER ---
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Custom Scanner Refs untuk Enterprise Architecture
  const activeScanRef = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  // State untuk Tukar Kamera
  const [cameras, setCameras] = useState([]);
  const [currentCamIndex, setCurrentCamIndex] = useState(0);

  // --- FETCH DATA (MPA) ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
          const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
          setCurrentUser(roleData || { name: session.user.email, role: 'user', department: 'Pusat' });
      }

      // Ambil histori batch untuk validasi Master Data
      const { data: histData } = await supabase.from('generate_history').select('id, items');
      if (histData) setGenerateHistory(histData);

      // Ambil data segel terpasang
      const { data: sealData } = await supabase.from('installed_seals').select('*');
      if (sealData) setInstalledSeals(sealData);

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  const processScannedData = (rawText) => { 
      const scannedId = extractSealId(rawText).trim();

      // VALIDASI KETAT: Periksa apakah ID pernah di-generate di Master Data
      const isValidGeneratedId = generateHistory.some(batch => 
         batch.items && batch.items.some(item => item.id === scannedId)
      );

      if (!isValidGeneratedId) {
          setScanResult({ 
            raw: rawText, 
            decoded: { 
              success: false, 
              error: "INVALID: ID Segel palsu atau tidak terdaftar di Master Data produksi." 
            } 
          }); 
          return;
      }

      setScanResult({ 
        raw: rawText, 
        decoded: { success: true, data: scannedId } 
      }); 
  };

  const startScanner = async (forcedCamIndex = null) => {
    if (activeScanRef.current && forcedCamIndex === null) return;
    activeScanRef.current = true;
    
    setScanResult(null); 
    setIsScanning(true);
    
    try {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!activeScanRef.current) return;

        // 1. Ambil Library ZXing (jsQR) menggunakan injeksi stabil
        const jsQR = await loadJsQR();

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        // 2. Logika Cerdas Pemilihan Kamera
        let targetList = cameras;
        if (targetList.length === 0) {
            try {
                // Pancing izin kamera
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                tempStream.getTracks().forEach(t => t.stop());
            } catch(e) {}

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            // Filter hanya kamera belakang
            const backCams = videoDevices.filter(c => {
                const lbl = c.label.toLowerCase();
                return lbl.includes('back') || lbl.includes('belakang') || lbl.includes('environment');
            });
            targetList = backCams.length > 0 ? backCams : videoDevices;
            setCameras(targetList);
        }

        let camIndexToUse = 0;
        if (forcedCamIndex !== null) {
            camIndexToUse = forcedCamIndex;
        } else if (targetList.length > 0) {
            // Cerdas: Cari lensa utama (bukan ultrawide, macro, atau depth)
            const bestIdx = targetList.findIndex(c => {
                const lbl = c.label.toLowerCase();
                if (lbl.includes('main') || lbl.includes('1x') || lbl.includes('standard') || lbl.includes('utama')) return true;
                return !lbl.includes('ultra') && !lbl.includes('0.5') && !lbl.includes('wide') && !lbl.includes('macro') && !lbl.includes('tele') && !lbl.includes('depth');
            });
            camIndexToUse = bestIdx !== -1 ? bestIdx : 0;
        }

        setCurrentCamIndex(camIndexToUse);

        // Paksa Continuous Auto-Focus & Resolusi Tinggi
        const constraints = {
            video: targetList.length > 0 && targetList[camIndexToUse].deviceId 
                ? { deviceId: { exact: targetList[camIndexToUse].deviceId }, width: { ideal: 1280 }, advanced: [{ focusMode: "continuous" }] } 
                : { facingMode: "environment", width: { ideal: 1280 }, advanced: [{ focusMode: "continuous" }] }
        };

        // 3. Nyalakan Kamera Mentah
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute("playsinline", true);
            videoRef.current.play();

            // 4. Mesin Looping Scanner Custom (ROI + Zoom + Filter GPU)
            const scanLoop = () => {
                if (!activeScanRef.current) return;
                
                if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });
                    
                    const vw = videoRef.current.videoWidth;
                    const vh = videoRef.current.videoHeight;
                    
                    // ROI & Digital Zoom 2.5x untuk Stiker berukuran sangat kecil (1x1 cm)
                    const size = Math.min(vw, vh);
                    const zoomFactor = 2.5; 
                    const cropSize = size / zoomFactor; 
                    const sx = (vw - cropSize) / 2;
                    const sy = (vh - cropSize) / 2;
                    
                    // OPTIMASI 1: Canvas dinamis mengikuti ukuran asli (Mencegah blur)
                    canvas.width = cropSize; 
                    canvas.height = cropSize;
                    
                    // OPTIMASI 2: Matikan filter agresif yang membuat silau lampu flash/matahari
                    ctx.filter = 'none';
                    ctx.drawImage(videoRef.current, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);

                    const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
                    
                    // Eksekusi jsQR
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        // OPTIMASI 3: attemptBoth agar bisa membaca QR inversi warna
                        inversionAttempts: "attemptBoth",
                    });

                    if (code && code.data) {
                        stopScanner();
                        processScannedData(code.data);
                        return;
                    }
                }
                animationRef.current = requestAnimationFrame(scanLoop);
            };
            animationRef.current = requestAnimationFrame(scanLoop);
        }

    } catch (err) { 
      console.error("Scanner Error:", err);
      if (activeScanRef.current) {
          showNotification("Gagal mengakses kamera. Pastikan izin akses diberikan.", 'error'); 
          setIsScanning(false); 
          activeScanRef.current = false;
      }
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIdx = (currentCamIndex + 1) % cameras.length;
    startScanner(nextIdx);
  };

  const stopScanner = () => {
    activeScanRef.current = false;
    if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
            track.stop();
        });
        streamRef.current = null;
    }
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  // Jalankan scanner OTOMATIS saat komponen pertama kali dirender
  useEffect(() => {
    let isMounted = true;
    startScanner();
    return () => {
      isMounted = false;
      stopScanner();
    };
  }, []);

  const installedMatches = scanResult && scanResult.decoded.success 
      ? installedSeals.filter(s => s.sealId === scanResult.decoded.data) 
      : [];

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-[#146b99]" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />

      {/* MODAL SCANNER LAYAR PENUH SEPERTI APLIKASI NATIVE */}
      {isScanning && (
        <div className="fixed inset-0 bg-black z-[99999] flex flex-col animate-in fade-in zoom-in duration-200">
           <div className="p-4 bg-gray-900 text-white flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3">
                 <div className="bg-[#146b99] p-2 rounded-lg">
                   <Scan size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-sm leading-none">Verifikasi Segel</h3>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">
                      Arahkan ke QR Code
                    </p>
                 </div>
              </div>
              <button 
                onClick={stopScanner} 
                className="p-2 bg-gray-800 rounded-full hover:bg-red-500 transition-colors"
              >
                <X size={20}/>
              </button>
           </div>
           <div className="flex-1 flex flex-col justify-center items-center bg-black relative p-4">
               <div className="absolute inset-0 border-4 border-[#146b99] opacity-20 pointer-events-none m-4 rounded-3xl"></div>
               
               {/* UI SCANNER ENTERPRISE CUSTOM */}
               <div className="w-full max-w-md aspect-square bg-gray-900 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
                  <video ref={videoRef} className="hidden" playsInline muted />
                  <canvas ref={canvasRef} className="w-full h-full object-cover scale-[1.02]" />
                  
                  {/* Panduan Area Scan yang diperkecil untuk menyesuaikan zoom 2.5x */}
                  <div className="absolute inset-0 border-2 border-[#146b99]/40 m-24 rounded-xl pointer-events-none"></div>
                  <div className="absolute top-1/2 left-24 right-24 h-0.5 bg-[#146b99] shadow-[0_0_10px_rgba(20,107,153,0.8)] pointer-events-none" style={{animation: 'scan-animation 2s ease-in-out infinite'}}></div>
               </div>
               
               <p className="text-white text-sm font-semibold mt-8 animate-pulse text-center">Sedang memindai...</p>

               {cameras.length > 1 && (
                 <button 
                   onClick={switchCamera}
                   className="mt-8 bg-gray-800/80 backdrop-blur-md border border-gray-600 text-white px-6 py-3 rounded-full font-bold tracking-wider hover:bg-gray-700 transition-colors flex items-center gap-2 z-10"
                 >
                   <SwitchCamera size={18} /> Ganti Lensa ({currentCamIndex + 1}/{cameras.length})
                 </button>
               )}
           </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="scan" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Scan QR" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative">
            <div className="max-w-2xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
              
              {!scanResult && !isScanning && (
                <div className="bg-white p-8 md:p-12 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center text-center">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                     <Camera size={40} className="text-[#146b99]" />
                  </div>
                  
                  <h2 className="text-2xl font-extrabold text-gray-800 mb-3">Scanner Siap</h2>
                  <p className="text-gray-500 text-sm font-medium mb-8 max-w-md">
                    Kamera otomatis terbuka ke layar penuh. Jika terhenti, silakan klik tombol di bawah ini.
                  </p>

                  <div className="w-full max-w-md aspect-[4/3] bg-[#0f172a] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center mb-4 shadow-lg">
                     <div className="w-40 h-40 border-2 border-gray-600 rounded-2xl flex items-center justify-center mb-4">
                       <Camera size={48} className="text-gray-600" strokeWidth={1.5} />
                     </div>
                     <button 
                       onClick={() => startScanner()} 
                       className="absolute bottom-6 bg-[#146b99] hover:bg-[#11577c] px-6 py-3 rounded-full border border-blue-400 text-white font-bold tracking-wider shadow-lg transition-all flex items-center gap-2 z-10"
                     >
                        <ScanLine size={18} /> BUKA KAMERA SEKARANG
                     </button>
                  </div>
                </div>
              )}

              {scanResult && !isScanning && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 animate-in fade-in zoom-in duration-300">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Hasil Pemindaian</p>
                  
                  <div className="mb-4">
                     <p className="text-xs font-bold text-slate-500 mb-1">Data Mentah Tersandi:</p>
                     <code className="block bg-slate-50 text-slate-500 p-2 rounded-lg text-xs break-all border border-slate-200">
                       {scanResult.raw}
                     </code>
                  </div>

                  {scanResult.decoded.success ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 bg-emerald-50 border border-emerald-100 rounded-2xl">
                       <div className="bg-emerald-500 text-white p-3 rounded-full shadow-lg shadow-emerald-200 shrink-0">
                         <ShieldCheck size={32} />
                       </div>
                       <div className="flex-1 w-full">
                          <h4 className="text-emerald-900 font-black text-xl leading-none">SEAL VALID!</h4>
                          <p className="text-emerald-700 font-semibold text-sm mt-1">
                            ID Terdaftar: <span className="font-mono bg-emerald-200 px-1.5 rounded break-all">{scanResult.decoded.data}</span>
                          </p>
                          
                          {installedMatches.length > 0 ? (
                             <div className="mt-3 space-y-2">
                               {installedMatches.map((match, idx) => (
                                 <div key={idx} className="p-3 bg-white rounded-lg border border-emerald-100 text-xs">
                                   <span className="font-extrabold text-emerald-800 block mb-1">Info Lapangan ({match.seal_type}):</span> 
                                   Segel ini sedang terpasang di kendaraan <b>{match.nopol || match.location}</b> (Posisi: {match.seal_category || 'Tidak diketahui'}).
                                 </div>
                               ))}
                             </div>
                          ) : (
                             <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs font-semibold text-amber-800">
                               Segel ini Valid, namun <b className="font-extrabold">belum terdata pemasangannya</b> di sistem (belum di-input).
                             </div>
                          )}
                       </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 bg-rose-50 border border-rose-100 rounded-2xl">
                       <div className="bg-rose-500 text-white p-3 rounded-full shadow-lg shadow-rose-200 shrink-0">
                         <ShieldAlert size={32} />
                       </div>
                       <div>
                         <h4 className="text-rose-900 font-black text-xl leading-none">INVALID!</h4>
                         <p className="text-rose-700 font-semibold text-sm mt-1">{scanResult.decoded.error}</p>
                       </div>
                    </div>
                  )}

                  <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center">
                     <button 
                       onClick={() => startScanner()} 
                       className="bg-[#146b99] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#11577c] transition-colors shadow-md flex items-center gap-2"
                     >
                       <ScanLine size={18} /> Scan QR Lainnya
                     </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scanner;