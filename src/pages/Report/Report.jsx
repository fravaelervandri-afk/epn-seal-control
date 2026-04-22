import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Search, Loader2, Camera, Scan, X, UploadCloud, SwitchCamera, ChevronDown, Check } from 'lucide-react';

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyaA8vZPHL_nD9poI4Afqb_NfGMayq80dBgqtANoAaZ7zw2BueodaugYSNRdpRN75R8/exec";

// Helper untuk memuat jsQR
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
  } catch (e) { return text; }
};

const Report = ({ session }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [installedSeals, setInstalledSeals] = useState([]);
  const [reportedSeals, setReportedSeals] = useState([]); 
  
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  // --- STATE FORM ---
  const [selectedNopol, setSelectedNopol] = useState('');
  const [selectedSealId, setSelectedSealId] = useState('');
  const [sealType, setSealType] = useState('Pecah Telur');
  const [incidentCategory, setIncidentCategory] = useState('Segel Rusak');
  const [incidentPhoto, setIncidentPhoto] = useState(null);
  const [uraianObservasi, setUraianObservasi] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSealTypeLocked, setIsSealTypeLocked] = useState(true);

  // --- STATE SCANNER ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const activeScanRef = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [currentCamIndex, setCurrentCamIndex] = useState(0);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
        const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
        setCurrentUser(roleData || { name: session.user.email, role: 'user', department: 'Pusat' });
      }

      const { data: sealData } = await supabase.from('installed_seals').select('*').order('timestamp', { ascending: false });
      if (sealData) setInstalledSeals(sealData);

      // Tarik data segel yang sudah masuk ke laporan aktif (belum diganti)
      const { data: reportData } = await supabase.from('seal_reports').select('sealId').neq('status', 'Selesai');
      if (reportData) setReportedSeals(reportData);

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  // Saring segel yang belum pernah dilaporkan / belum selesai
  const unreportedSeals = useMemo(() => {
    const reportedIds = reportedSeals.map(r => r.sealId);
    return installedSeals.filter(s => !reportedIds.includes(s.sealId) && s.status !== 'Diganti / Dilepas');
  }, [installedSeals, reportedSeals]);

  // Daftar Nopol unik untuk dropdown
  const uniqueNopols = useMemo(() => {
    return [...new Set(unreportedSeals.map(s => s.nopol))].filter(Boolean).sort();
  }, [unreportedSeals]);

  // Daftar ID Segel yang hanya ada pada Nopol terpilih dan belum dilaporkan
  const availableSeals = useMemo(() => {
    if (!selectedNopol) return [];
    return unreportedSeals.filter(s => s.nopol === selectedNopol);
  }, [selectedNopol, unreportedSeals]);

  // Auto-lock / unlock Jenis Segel berdasarkan ID yang dipilih
  useEffect(() => {
    if (!selectedSealId) {
      setSealType('');
      setIsSealTypeLocked(true);
      return;
    }
    
    const matchingSeals = availableSeals.filter(s => s.sealId === selectedSealId);
    
    if (matchingSeals.length === 1) {
      setSealType(matchingSeals[0].seal_type || 'Pecah Telur');
      setIsSealTypeLocked(true);
    } else if (matchingSeals.length > 1) {
      const uniqueTypes = [...new Set(matchingSeals.map(s => s.seal_type).filter(Boolean))];
      if (uniqueTypes.length === 1) {
        setSealType(uniqueTypes[0]);
        setIsSealTypeLocked(true);
      } else {
        setSealType(uniqueTypes[0]);
        setIsSealTypeLocked(false);
      }
    }
  }, [selectedSealId, availableSeals]);

  // Logika Scanner
  const startScanner = async (forcedCamIndex = null) => {
    setIsScannerOpen(true);
    activeScanRef.current = true;
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const jsQR = await loadJsQR();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const backCams = videoDevices.filter(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('belakang'));
      const targetList = backCams.length > 0 ? backCams : videoDevices;
      setCameras(targetList);
      const camIdx = forcedCamIndex !== null ? forcedCamIndex : 0;
      setCurrentCamIndex(camIdx);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: targetList[camIdx] ? { deviceId: { exact: targetList[camIdx].deviceId } } : { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        const scanLoop = () => {
          if (!activeScanRef.current) return;
          if (videoRef.current?.readyState === videoRef.current?.HAVE_ENOUGH_DATA) {
            const ctx = canvasRef.current.getContext("2d");
            const vw = videoRef.current.videoWidth; const vh = videoRef.current.videoHeight;
            const size = Math.min(vw, vh); const zoom = 2.5; const crop = size / zoom;
            canvasRef.current.width = crop; canvasRef.current.height = crop;
            ctx.drawImage(videoRef.current, (vw - crop) / 2, (vh - crop) / 2, crop, crop, 0, 0, crop, crop);
            const code = jsQR(ctx.getImageData(0, 0, crop, crop).data, crop, crop, { inversionAttempts: "attemptBoth" });
            if (code) {
              const id = extractSealId(code.data);

              if (reportedSeals.some(r => r.sealId === id)) {
                showNotification("Segel ini sudah pernah dilaporkan sebelumnya!", "error");
                stopScanner();
                return;
              }

              const found = installedSeals.find(s => s.sealId === id);
              if (found) {
                setSelectedNopol(found.nopol);
                setSelectedSealId(id);
                stopScanner();
              } else {
                showNotification("ID Segel tidak terdaftar di database pemasangan.", "error");
                stopScanner();
              }
              return;
            }
          }
          animationRef.current = requestAnimationFrame(scanLoop);
        };
        animationRef.current = requestAnimationFrame(scanLoop);
      }
    } catch (e) { stopScanner(); showNotification("Gagal akses kamera.", "error"); }
  };

  const stopScanner = () => {
    activeScanRef.current = false;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setIsScannerOpen(false);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setIncidentPhoto(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSealId || !incidentPhoto) return showNotification("Lengkapi data dan foto bukti!", "error");
    if (!uraianObservasi.trim()) return showNotification("Uraian observasi wajib diisi!", "error");
    
    setIsSubmitting(true);
    try {
      const base64Data = incidentPhoto.split(',')[1];
      const tglReport = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
      const filename = `REPORT_${selectedNopol}_${tglReport}.jpg`;

      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64: base64Data, filename: filename })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Gagal mengunggah foto laporan.");

      const uploadedPhotoUrl = result.url;

      const reportData = {
        nopol: selectedNopol,
        sealId: selectedSealId,
        seal_type: sealType,
        incident_type: incidentCategory,
        photo: uploadedPhotoUrl,
        notes: uraianObservasi,
        reporter: currentUser?.name || 'Unknown',
        location: currentUser?.department || 'Head Office',
        report_date: new Date().toLocaleString('id-ID'),
        timestamp: Date.now(),
        status: 'Menunggu Tindakan'
      };

      const { error } = await supabase.from('seal_reports').insert([reportData]);
      if (error) throw error;

      // Update status di installed_seals sesuai kategori insiden (Soft Update)
      const { error: updateError } = await supabase
        .from('installed_seals')
        .update({ status: incidentCategory }) 
        .eq('sealId', selectedSealId)
        .eq('seal_type', sealType)
        .eq('nopol', selectedNopol);
        
      if (updateError) throw updateError;

      showNotification("Laporan berhasil dikirim!", "success");
      
      setIncidentPhoto(null); 
      setUraianObservasi(''); 
      setSelectedSealId('');
      setSelectedNopol('');
      
    } catch (e) { 
      console.error(e);
      showNotification(e.message || "Gagal mengirim laporan. Periksa koneksi Anda.", "error"); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-[#146b99]" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />

      {isScannerOpen && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-4">
          <button onClick={stopScanner} className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full"><X size={24}/></button>
          <div className="w-full max-w-sm aspect-square border-2 border-rose-500 rounded-3xl overflow-hidden relative">
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="w-full h-full object-cover" />
          </div>
          <p className="text-white mt-8 font-bold animate-pulse">Arahkan ke QR Segel...</p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeMenu="pelaporan-segel" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto bg-[#f8f9fa]">
          <Header activeMenuLabel="Input Pelaporan" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full animate-in fade-in duration-300">
            <div className="bg-white p-4 md:p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-xl font-bold text-gray-800">Form Pelaporan Insiden</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                
                {/* Kolom Kiri: Input Utama */}
                <div className="space-y-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">Wilayah Kerja <span className="text-red-500">*</span></label>
                      <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-800">
                        {currentUser.department || 'Head Office'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">Nomor Polisi <span className="text-red-500">*</span></label>
                      <select 
                        value={selectedNopol} 
                        onChange={(e) => { setSelectedNopol(e.target.value); setSelectedSealId(''); }}
                        className="w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none bg-white"
                      >
                        <option value="">Pilih Kendaraan</option>
                        {uniqueNopols.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">ID Segel <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <select 
                          value={selectedSealId} 
                          onChange={(e) => setSelectedSealId(e.target.value)}
                          disabled={!selectedNopol}
                          className="flex-1 p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                        >
                          <option value="">Pilih ID Segel</option>
                          {availableSeals.map(s => <option key={s.id} value={s.sealId}>{s.sealId} ({s.seal_category})</option>)}
                        </select>
                        <button onClick={() => startScanner()} className="bg-[#146b99] p-3 rounded-lg text-white hover:bg-[#11577c] transition-colors shadow-sm">
                          <Scan size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-2">Jenis Segel</label>
                        <select 
                          value={sealType} 
                          onChange={(e) => setSealType(e.target.value)} 
                          disabled={isSealTypeLocked}
                          className={`w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none transition-colors ${isSealTypeLocked ? 'bg-gray-100 cursor-not-allowed opacity-70' : 'bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'}`}
                        >
                          <option value="Pecah Telur">Pecah Telur</option>
                          <option value="Kabel Ties">Kabel Ties</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-2">Kategori Insiden</label>
                        <select value={incidentCategory} onChange={(e) => setIncidentCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                          <option value="Segel Rusak">Segel Rusak</option>
                          <option value="Segel Hilang">Segel Hilang</option>
                          <option value="Indikasi Sabotase">Indikasi Sabotase</option>
                          <option value="Segel Tidak Sesuai">Segel Tidak Sesuai</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="block text-[13px] font-bold text-gray-700">Upload Photo Bukti <span className="text-red-500">*</span></label>
                      <div className="w-full h-48 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center p-6 gap-6">
                        <label className="w-20 h-20 bg-white border-2 border-rose-300 border-dashed rounded-xl flex items-center justify-center cursor-pointer hover:bg-rose-50 transition-colors shrink-0">
                          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoUpload} />
                          <Camera size={32} className="text-rose-400" />
                        </label>
                        <div className="flex-1 overflow-hidden">
                          {incidentPhoto ? (
                            <img src={incidentPhoto} className="h-32 w-full object-cover rounded-lg border border-white shadow-sm" alt="Preview" />
                          ) : (
                            <p className="text-xs font-bold text-gray-400 italic">Belum ada foto insiden yang diambil...</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kolom Kanan: Uraian */}
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl space-y-6 h-full flex flex-col">
                    <div className="flex-1">
                      <label className="block text-[13px] font-bold text-gray-700 mb-3 uppercase tracking-wider">Uraian Observasi Kejadian</label>
                      <textarea 
                        placeholder="Jelaskan kondisi kronologi secara detail..." 
                        className="w-full h-[350px] p-4 bg-white border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-semibold text-gray-700 resize-none shadow-sm"
                        value={uraianObservasi}
                        onChange={(e) => setUraianObservasi(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-6 border-t border-gray-100 flex justify-start">
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="bg-[#0051cc] text-white px-10 py-3.5 rounded-xl font-bold hover:bg-blue-800 transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : null}
                  {isSubmitting ? 'MENGIRIM LAPORAN...' : 'Simpan Laporan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;