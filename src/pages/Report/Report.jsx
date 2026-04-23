import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Loader2, Camera, UploadCloud, ChevronDown, Search } from 'lucide-react';

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyaA8vZPHL_nD9poI4Afqb_NfGMayq80dBgqtANoAaZ7zw2BueodaugYSNRdpRN75R8/exec";

const Report = ({ session }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [installedSeals, setInstalledSeals] = useState([]);
  const [reportedSeals, setReportedSeals] = useState([]); 
  
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  // --- STATE FORM PELAPORAN ---
  const [selectedNopol, setSelectedNopol] = useState('');
  const [selectedSealId, setSelectedSealId] = useState('');
  const [sealType, setSealType] = useState('');
  const [incidentCategory, setIncidentCategory] = useState('Segel Rusak');
  const [incidentPhoto, setIncidentPhoto] = useState(null);
  const [uraianObservasi, setUraianObservasi] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- STATE UNTUK DROPDOWN SEARCH NOPOL ---
  const [isNopolDropdownOpen, setIsNopolDropdownOpen] = useState(false);
  const [nopolSearch, setNopolSearch] = useState('');
  const nopolDropdownRef = useRef(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
        const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
        setCurrentUser(roleData || { name: session.user.email, role: 'user', department: 'Pusat' });
      } else {
        setCurrentUser({ name: 'Admin', role: 'admin', department: 'Pusat' });
      }

      const { data: sealData } = await supabase.from('installed_seals').select('*').order('timestamp', { ascending: false });
      if (sealData) setInstalledSeals(sealData);

      // Mengambil daftar ID segel yang sudah pernah dilaporkan
      const { data: reportData } = await supabase.from('seal_reports').select('sealId');
      if (reportData) setReportedSeals(reportData.map(r => r.sealId));

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  // Handle klik di luar area dropdown untuk menutup pencarian Nopol
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (nopolDropdownRef.current && !nopolDropdownRef.current.contains(event.target)) {
        setIsNopolDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Daftar Nopol unik dari data pemasangan segel (Difilter berdasarkan role & lokasi)
  const uniqueNopols = useMemo(() => {
    if (!currentUser) return [];

    const filteredSeals = installedSeals.filter(s => {
      if (currentUser.role === 'admin') return true; // Admin melihat semua
      return s.location === currentUser.department;  // User biasa hanya melihat sesuai lokasinya
    });

    return [...new Set(filteredSeals.map(s => s.nopol))].filter(Boolean).sort();
  }, [installedSeals, currentUser]);

  // Daftar ID Segel yang tersedia pada Nopol terpilih dan BELUM dilaporkan
  const availableSealIds = useMemo(() => {
    if (!selectedNopol) return [];
    return [...new Set(installedSeals
      .filter(s => s.nopol === selectedNopol && !reportedSeals.includes(s.sealId))
      .map(s => s.sealId)
    )].filter(Boolean);
  }, [selectedNopol, installedSeals, reportedSeals]);

  // Daftar Jenis Segel berdasarkan Nopol dan ID Segel terpilih
  const availableTypes = useMemo(() => {
    if (!selectedNopol || !selectedSealId) return [];
    return [...new Set(installedSeals
      .filter(s => s.nopol === selectedNopol && s.sealId === selectedSealId)
      .map(s => s.seal_type)
    )].filter(Boolean);
  }, [selectedNopol, selectedSealId, installedSeals]);

  // Auto-select jenis segel jika hanya ada 1 tipe yang tersedia
  useEffect(() => {
    if (availableTypes.length === 1) {
      setSealType(availableTypes[0]);
    } else if (availableTypes.length === 0 || !availableTypes.includes(sealType)) {
      setSealType('');
    }
  }, [availableTypes, sealType]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setIncidentPhoto(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedNopol || !selectedSealId || !sealType) return showNotification("Pilih Kendaraan, ID, dan Jenis Segel terlebih dahulu!", "error");
    if (!incidentPhoto) return showNotification("Foto bukti kerusakan wajib diunggah!", "error");
    if (!uraianObservasi.trim()) return showNotification("Uraian observasi wajib diisi!", "error");
    
    setIsSubmitting(true);
    try {
      // 1. Persiapan data foto
      const base64Data = incidentPhoto.split(',')[1];
      const tglReport = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
      const filename = `REPORT_${selectedNopol}_${sealType.replace(/\s+/g, '')}_${tglReport}.jpg`;

      // 2. Upload ke Google Drive dengan parameter FOLDER TYPE
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
           base64: base64Data, 
           filename: filename,
           folderType: 'REPORT' // Mengarahkan ke subfolder Pelaporan
        })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Gagal mengunggah foto laporan.");

      const uploadedPhotoUrl = result.url;

      // 3. Simpan data laporan ke Supabase
      const targetSeal = installedSeals.find(s => s.sealId === selectedSealId && s.seal_type === sealType && s.nopol === selectedNopol);

      const reportData = {
        nopol: selectedNopol,
        sealId: selectedSealId,
        seal_category: targetSeal?.seal_category || 'Tidak Diketahui',
        seal_type: sealType || 'Tidak Diketahui',
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

      // Update daftar reportedSeals di state agar segera hilang dari dropdown
      setReportedSeals(prev => [...prev, selectedSealId]);

      // 4. Update status di database installed_seals (Soft Update)
      const { error: updateError } = await supabase
        .from('installed_seals')
        .update({ status: incidentCategory }) 
        .eq('sealId', selectedSealId)
        .eq('seal_type', sealType)
        .eq('nopol', selectedNopol);
        
      if (updateError) throw updateError;

      showNotification("Laporan kerusakan berhasil dikirim!", "success");
      
      // Reset Form
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

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="pelaporan-segel" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser?.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Input Pelaporan" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative animate-in fade-in duration-300">
            <div className="bg-white p-4 md:p-8 rounded-xl shadow-sm border border-gray-200">
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h2 className="text-xl font-bold text-gray-800">Form Pelaporan Insiden Kerusakan</h2>
                <p className="text-sm text-gray-500 mt-1 font-medium">Laporkan segel yang rusak atau hilang untuk segera ditindaklanjuti.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">Wilayah Kerja <span className="text-red-500">*</span></label>
                      <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-800 uppercase tracking-wide">
                        {currentUser?.department || 'Head Office'}
                      </div>
                    </div>

                    {/* --- KOTAK DROPDOWN SEARCH NOPOL --- */}
                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">Nomor Polisi <span className="text-red-500">*</span></label>
                      <div className="relative" ref={nopolDropdownRef}>
                        <div 
                          onClick={() => { setIsNopolDropdownOpen(!isNopolDropdownOpen); setNopolSearch(''); }}
                          className={`w-full p-3 border ${isNopolDropdownOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'} rounded-lg flex justify-between items-center bg-white cursor-pointer transition-colors min-h-[50px]`}
                        >
                          <span className={selectedNopol ? "text-gray-800 font-bold" : "text-gray-400 font-bold"}>
                            {selectedNopol || "Pilih Kendaraan Terindikasi"}
                          </span>
                          <ChevronDown className={`text-gray-400 transition-transform ${isNopolDropdownOpen ? 'rotate-180' : ''}`} size={18} />
                        </div>

                        {isNopolDropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
                            <div className="p-2 border-b flex items-center bg-gray-50">
                              <Search size={16} className="text-gray-400 mr-2" />
                              <input 
                                autoFocus 
                                type="text" 
                                className="w-full bg-transparent outline-none text-sm font-semibold text-gray-700" 
                                placeholder="Cari Nomor Polisi..." 
                                value={nopolSearch} 
                                onChange={e => setNopolSearch(e.target.value)} 
                                onClick={e => e.stopPropagation()} 
                              />
                            </div>
                            <ul className="max-h-48 overflow-y-auto custom-scrollbar">
                              {uniqueNopols
                                .filter(n => n.toLowerCase().includes(nopolSearch.toLowerCase()))
                                .map(n => (
                                  <li 
                                    key={n} 
                                    onClick={() => { 
                                      setSelectedNopol(n); 
                                      setSelectedSealId(''); 
                                      setSealType('');
                                      setIsNopolDropdownOpen(false); 
                                    }} 
                                    className="px-4 py-3 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-50 font-bold text-gray-700 transition-colors"
                                  >
                                    {n}
                                  </li>
                                ))}
                              {uniqueNopols.filter(n => n.toLowerCase().includes(nopolSearch.toLowerCase())).length === 0 && (
                                <li className="p-4 text-sm text-center text-gray-500 font-medium">Kendaraan tidak ditemukan</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-2">ID Segel <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <select 
                            value={selectedSealId} 
                            onChange={(e) => setSelectedSealId(e.target.value)}
                            disabled={!selectedNopol}
                            className="w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <option value="">Pilih ID Segel</option>
                            {availableSealIds.map(id => <option key={id} value={id}>{id}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-2">Jenis Segel <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <select 
                            value={sealType} 
                            onChange={(e) => setSealType(e.target.value)} 
                            disabled={availableTypes.length <= 1}
                            className={`w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none appearance-none transition-colors ${availableTypes.length <= 1 ? 'bg-gray-100 cursor-not-allowed opacity-80' : 'bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer'}`}
                          >
                            <option value="">Otomatis Deteksi...</option>
                            {availableTypes.map(type => <option key={type} value={type}>{type}</option>)}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">Kategori Insiden <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <select value={incidentCategory} onChange={(e) => setIncidentCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none bg-white cursor-pointer">
                          <option value="Segel Rusak">Segel Rusak</option>
                          <option value="Segel Hilang">Segel Hilang</option>
                          <option value="Indikasi Sabotase">Indikasi Sabotase</option>
                          <option value="Segel Tidak Sesuai">Segel Tidak Sesuai</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="block text-[13px] font-bold text-gray-700">Foto Bukti Kerusakan <span className="text-red-500">*</span></label>
                      <div className="w-full h-48 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center p-6 gap-6">
                        <label className="w-20 h-20 bg-white border-2 border-rose-300 border-dashed rounded-xl flex items-center justify-center cursor-pointer hover:bg-rose-50 transition-colors shrink-0 shadow-sm">
                          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoUpload} />
                          <Camera size={32} className="text-rose-400" />
                        </label>
                        <div className="flex-1 overflow-hidden">
                          {incidentPhoto ? (
                            <img src={incidentPhoto} className="h-32 w-full object-cover rounded-lg border border-white shadow-sm" alt="Preview" />
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-rose-700">Lampirkan Bukti</span>
                              <span className="text-xs font-semibold text-gray-500 mt-1">Gunakan kamera HP Anda untuk memotret kondisi aktual di lapangan.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl space-y-6 h-full flex flex-col">
                    <div className="flex-1">
                      <label className="block text-[13px] font-bold text-gray-700 mb-3 uppercase tracking-wider">Uraian Observasi Kejadian <span className="text-red-500">*</span></label>
                      <textarea 
                        placeholder="Jelaskan kondisi dan kronologi secara detail..." 
                        className="w-full h-[350px] p-4 bg-white border border-gray-300 rounded-xl outline-none focus:ring-1 focus:ring-[#146b99] focus:border-[#146b99] font-semibold text-gray-700 resize-none shadow-sm"
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
                  disabled={isSubmitting || !selectedNopol || !selectedSealId || !sealType || !incidentPhoto || !uraianObservasi.trim()}
                  className="bg-[#156592] text-white px-10 py-3.5 rounded-xl font-bold hover:bg-[#11577c] transition-all flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                  {isSubmitting ? 'MENGIRIM LAPORAN...' : 'Kirim Laporan Kerusakan'}
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
