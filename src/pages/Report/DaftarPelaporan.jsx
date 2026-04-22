import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Search, Loader2, CalendarClock, Eye, FileSpreadsheet, X, Filter, CheckSquare, Square, Download, ChevronDown, CheckCircle2, AlertTriangle, ShieldAlert, UploadCloud, Camera, Check } from 'lucide-react';

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyaA8vZPHL_nD9poI4Afqb_NfGMayq80dBgqtANoAaZ7zw2BueodaugYSNRdpRN75R8/exec";

const loadXLSX = () => {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Gagal memuat modul Excel"));
    document.body.appendChild(script);
  });
};

const DaftarPelaporan = ({ session }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  const [reports, setReports] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedReport, setSelectedReport] = useState(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [actionPhoto, setActionPhoto] = useState(null);
  const [actionNotes, setActionNotes] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      let userObj = { name: 'Admin', role: 'admin', department: 'Pusat' };
      
      if (session?.user?.id) {
          const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
          if (roleData) userObj = roleData;
          setCurrentUser(userObj);
      } else {
          setCurrentUser(userObj);
      }

      let query = supabase.from('seal_reports').select('*').order('timestamp', { ascending: false });
      if (userObj.role !== 'admin') {
          query = query.eq('location', userObj.department);
      }

      const { data: reportData, error } = await query;
      if (!error && reportData) {
          setReports(reportData);
      }

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, entriesPerPage]);

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const matchSearch = String(r.nopol).toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(r.sealId).toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(r.location).toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [reports, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredReports.length / entriesPerPage) || 1;
  const startIndex = (currentPage - 1) * entriesPerPage;
  const displayedReports = filteredReports.slice(startIndex, startIndex + entriesPerPage);

  const handleActionPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setActionPhoto(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  const submitAction = async () => {
    if (!actionPhoto) return showNotification("Foto bukti perbaikan wajib diunggah!", "error");
    if (!actionNotes.trim()) return showNotification("Uraian perbaikan wajib diisi!", "error");
    setIsSubmittingAction(true);

    try {
      const base64Data = actionPhoto.split(',')[1];
      const filename = `ACTION_${selectedReport.nopol}_${selectedReport.sealId}_${Date.now()}.jpg`;

      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64: base64Data, filename: filename })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      // Update Form Laporan -> Selesai
      const { error } = await supabase
        .from('seal_reports')
        .update({
           action_photo: result.url,
           action_notes: actionNotes,
           action_by: currentUser.name,
           action_date: new Date().toLocaleString('id-ID'),
           status: 'Selesai'
        })
        .eq('id', selectedReport.id);

      if (error) throw error;

      // Soft Delete Segel Terpasang -> Diganti / Dilepas
      const { error: updateError } = await supabase
        .from('installed_seals')
        .update({ status: 'Diganti / Dilepas' })
        .eq('sealId', selectedReport.sealId)
        .eq('nopol', selectedReport.nopol);
        
      if (updateError) throw updateError;

      showNotification("Tindak lanjut berhasil disimpan. Laporan Selesai.", "success");
      
      setReports(reports.map(r => r.id === selectedReport.id ? {
         ...r, action_photo: result.url, action_notes: actionNotes, action_by: currentUser.name, action_date: new Date().toLocaleString('id-ID'), status: 'Selesai'
      } : r));
      
      setSelectedReport(null);
      setActionPhoto(null);
      setActionNotes('');

    } catch (err) {
      showNotification("Gagal mengirim tindak lanjut.", "error");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const ExportModal = () => {
    const [exportAll, setExportAll] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const dataToExportCount = exportAll ? reports.length : filteredReports.length;

    const handleExecuteExport = async () => {
      if (dataToExportCount === 0) return showNotification('Tidak ada data untuk diekspor.', 'error');
      setIsGenerating(true);
      try {
        const XLSX = await loadXLSX();
        const dataToProcess = exportAll ? reports : filteredReports;

        const formattedData = dataToProcess.map((s, idx) => ({
          'No': idx + 1,
          'No. Polisi': s.nopol,
          'ID Segel': s.sealId,
          'Kategori': s.seal_category,
          'Lokasi': s.location,
          'Tanggal Lapor': s.report_date,
          'Pelapor': s.reporter,
          'Jenis Insiden': s.incident_type,
          'Uraian Insiden': s.notes || '-',
          'Status': s.status,
          'Tgl Tindak Lanjut': s.action_date || '-',
          'Petugas Tindak Lanjut': s.action_by || '-',
          'Uraian Perbaikan': s.action_notes || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Insiden");
        
        const wscols = [{wch:5}, {wch:15}, {wch:20}, {wch:15}, {wch:20}, {wch:20}, {wch:20}, {wch:20}, {wch:35}, {wch:20}, {wch:20}, {wch:20}, {wch:35}];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, `Rekap_Insiden_Segel_${new Date().toISOString().split('T')[0]}.xlsx`);
        showNotification('File Excel berhasil diunduh!', 'success');
        setIsExportModalOpen(false);
      } catch (err) {
        showNotification('Gagal membuat file Excel.', 'error');
      } finally {
        setIsGenerating(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="font-extrabold text-gray-800 text-lg flex items-center gap-2"><FileSpreadsheet className="text-emerald-600"/> Export Laporan</h2>
            <button onClick={() => setIsExportModalOpen(false)} className="p-2 text-gray-400 hover:text-red-500 rounded-full"><X size={20}/></button>
          </div>
          <div className="p-6">
             <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all mb-4 ${exportAll ? 'border-[#146b99] bg-blue-50/50' : 'border-gray-200'}`}>
              {exportAll ? <CheckSquare size={24} className="text-[#146b99]" /> : <Square size={24} className="text-gray-300" />}
              <div><p className="font-bold text-gray-800">Tarik Semua Histori</p><p className="text-xs text-gray-500">Seluruh laporan insiden</p></div>
              <input type="checkbox" className="hidden" checked={exportAll} onChange={() => setExportAll(true)} />
             </label>
             <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${!exportAll ? 'border-[#146b99] bg-blue-50/50' : 'border-gray-200'}`}>
              {!exportAll ? <CheckSquare size={24} className="text-[#146b99]" /> : <Square size={24} className="text-gray-300" />}
              <div><p className="font-bold text-gray-800">Sesuai Filter Tabel</p><p className="text-xs text-gray-500">Hanya yang tampil saat ini</p></div>
              <input type="checkbox" className="hidden" checked={!exportAll} onChange={() => setExportAll(false)} />
             </label>
             
             <button onClick={handleExecuteExport} disabled={isGenerating || dataToExportCount === 0} className="mt-8 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} {isGenerating ? 'Memproses...' : `Unduh ${dataToExportCount} Data`}
             </button>
          </div>
        </div>
      </div>
    );
  };

  const getStatusBadge = (status) => {
      switch(status) {
          case 'Selesai': return <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-bold border border-emerald-200 uppercase tracking-widest flex items-center gap-1 w-fit"><CheckCircle2 size={12}/> SELESAI</span>;
          default: return <span className="bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md text-[10px] font-bold border border-rose-200 uppercase tracking-widest flex items-center gap-1 w-fit"><ShieldAlert size={12}/> MENUNGGU TINDAKAN</span>;
      }
  };

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-[#146b99]" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />
      {isExportModalOpen && <ExportModal />}

      {/* POPUP DETAIL & TINDAK LANJUT */}
      {selectedReport && (
        <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] overflow-hidden">
              <div className="flex justify-between items-center p-5 md:p-6 border-b border-gray-100 bg-[#146b99]">
                 <div className="text-white">
                    <h2 className="font-black text-xl leading-tight">Detail Laporan & Tindak Lanjut</h2>
                    <p className="text-sm font-semibold opacity-80 mt-1">Kendaraan No. Pol: <span className="font-mono bg-white/20 px-1.5 rounded">{selectedReport.nopol}</span></p>
                 </div>
                 <button onClick={() => { setSelectedReport(null); setActionPhoto(null); setActionNotes(''); }} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
              </div>
              
              <div className="flex-1 overflow-auto p-5 md:p-6 bg-slate-50 custom-scrollbar">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* SISI KIRI: LAPORAN AWAL */}
                    <div className="bg-white border-2 border-rose-100 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                       <div className="bg-rose-50 px-5 py-3 border-b border-rose-100 flex items-center gap-2">
                          <AlertTriangle size={18} className="text-rose-600"/>
                          <h3 className="font-bold text-rose-800">Laporan Insiden (Awal)</h3>
                       </div>
                       <div className="p-5 space-y-4 flex-1">
                          <div className="flex justify-between items-start">
                             <div>
                               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kategori</p>
                               <p className="font-black text-lg text-gray-800">{selectedReport.incident_type}</p>
                             </div>
                             <div className="text-right">
                               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID Segel</p>
                               <p className="font-mono font-bold text-[#146b99]">{selectedReport.sealId}</p>
                             </div>
                          </div>
                          
                          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                             <div className="flex items-center gap-2 text-sm mb-2"><CalendarClock size={14} className="text-gray-400"/> <span className="font-bold text-gray-700">{selectedReport.report_date}</span></div>
                             <div className="text-sm"><span className="text-gray-500">Pelapor:</span> <span className="font-bold text-gray-800">{selectedReport.reporter}</span> ({selectedReport.location})</div>
                          </div>

                          <div>
                             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Foto Kondisi Laporan</p>
                             <img src={selectedReport.photo} alt="Bukti Rusak" className="w-full h-48 object-cover rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:opacity-90" onClick={() => window.open(selectedReport.photo, '_blank')} />
                          </div>

                          <div>
                             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Uraian Kejadian</p>
                             <p className="text-sm font-semibold text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-200 min-h-[80px]">{selectedReport.notes || 'Tidak ada uraian.'}</p>
                          </div>
                       </div>
                    </div>

                    {/* SISI KANAN: TINDAK LANJUT */}
                    <div className={`bg-white border-2 rounded-2xl overflow-hidden shadow-sm flex flex-col ${selectedReport.status === 'Selesai' ? 'border-emerald-200' : 'border-blue-100'}`}>
                       <div className={`px-5 py-3 border-b flex justify-between items-center ${selectedReport.status === 'Selesai' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
                          <div className="flex items-center gap-2">
                             <CheckCircle2 size={18} className={selectedReport.status === 'Selesai' ? 'text-emerald-600' : 'text-blue-600'}/>
                             <h3 className={`font-bold ${selectedReport.status === 'Selesai' ? 'text-emerald-800' : 'text-blue-800'}`}>Form Tindak Lanjut</h3>
                          </div>
                          {getStatusBadge(selectedReport.status)}
                       </div>
                       
                       <div className="p-5 flex-1 flex flex-col">
                          {selectedReport.status === 'Menunggu Tindakan' && currentUser.role === 'user' ? (
                             <div className="space-y-5 flex-1">
                                <div>
                                   <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Upload Foto Perbaikan <span className="text-red-500">*</span></label>
                                   <div className="flex items-center gap-4">
                                     <label className="w-20 h-20 bg-blue-50 border-2 border-blue-200 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors shrink-0 text-blue-500">
                                        <Camera size={24} />
                                        <span className="text-[10px] font-bold mt-1">Ambil</span>
                                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleActionPhotoUpload} />
                                     </label>
                                     <div className="flex-1">
                                        {actionPhoto ? <img src={actionPhoto} className="h-20 w-full object-cover rounded-xl shadow-sm border border-gray-200" /> : <p className="text-xs font-semibold text-gray-400">Harap unggah foto bukti pergantian/perbaikan fisik segel.</p>}
                                     </div>
                                   </div>
                                </div>
                                <div>
                                   <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Uraian Tindakan <span className="text-red-500">*</span></label>
                                   <textarea rows="5" placeholder="Contoh: Segel yang rusak telah dilepas dan diganti dengan segel baru bernomor EPN-00045..." value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold text-gray-700 bg-white resize-none" />
                                </div>
                                <div className="mt-auto pt-4">
                                   <button onClick={submitAction} disabled={isSubmittingAction} className="w-full bg-[#146b99] hover:bg-[#11577c] text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50">
                                      {isSubmittingAction ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />} {isSubmittingAction ? 'Mengirim Data...' : 'Simpan Tindak Lanjut'}
                                   </button>
                                </div>
                             </div>
                          ) : selectedReport.status === 'Menunggu Tindakan' && currentUser.role === 'admin' ? (
                             <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
                                <Loader2 size={40} className="mb-3 opacity-50"/>
                                <p className="font-bold">Menunggu Petugas Lapangan</p>
                                <p className="text-sm mt-1">Tindak lanjut hanya dapat diinput oleh akun User di lokasi.</p>
                             </div>
                          ) : (
                             <div className="space-y-4 flex-1 flex flex-col">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                                   <div className="flex items-center gap-2 text-sm mb-2"><CalendarClock size={14} className="text-gray-400"/> <span className="font-bold text-gray-700">{selectedReport.action_date}</span></div>
                                   <div className="text-sm"><span className="text-gray-500">Petugas:</span> <span className="font-bold text-gray-800">{selectedReport.action_by}</span></div>
                                </div>
                                <div>
                                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Foto Hasil Perbaikan</p>
                                   <img src={selectedReport.action_photo} alt="Bukti Perbaikan" className="w-full h-48 object-cover rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:opacity-90" onClick={() => window.open(selectedReport.action_photo, '_blank')} />
                                </div>
                                <div>
                                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Uraian Tindak Lanjut</p>
                                   <p className="text-sm font-semibold text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-200 min-h-[80px]">{selectedReport.action_notes}</p>
                                </div>
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="daftar-pelaporan" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Daftar Pelaporan Insiden" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative animate-in fade-in duration-300">
            <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div>
                 <h2 className="text-2xl font-black text-gray-800">Pemantauan Pelaporan</h2>
                 <p className="text-sm text-gray-500 font-semibold mt-1">Log pelaporan kerusakan dan tindak lanjut segel di lapangan.</p>
               </div>
               {currentUser.role === 'admin' && (
                 <button onClick={() => setIsExportModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-colors shrink-0">
                   <FileSpreadsheet size={18} /> Export Laporan
                 </button>
               )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:justify-between items-start lg:items-center gap-4 bg-gray-50/50">
                 <div className="flex flex-wrap items-center gap-3">
                    <select value={entriesPerPage} onChange={(e) => setEntriesPerPage(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-[#146b99] bg-white">
                       <option value={10}>10 Baris</option><option value={25}>25 Baris</option><option value={50}>50 Baris</option>
                    </select>
                    
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-[#146b99] bg-white">
                       <option value="All">Semua Status</option>
                       <option value="Menunggu Tindakan">Menunggu Tindakan</option>
                       <option value="Selesai">Selesai</option>
                    </select>
                 </div>
                 
                 <div className="relative w-full lg:w-72">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Cari Nopol, ID, Lokasi..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold outline-none focus:border-[#146b99] w-full bg-white" />
                 </div>
              </div>

              <div className="overflow-x-auto min-h-[400px] custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-[#146b99] text-white text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-4 font-extrabold whitespace-nowrap">Tanggal Lapor</th>
                      <th className="px-5 py-4 font-extrabold whitespace-nowrap">Objek Kendaraan</th>
                      <th className="px-5 py-4 font-extrabold whitespace-nowrap">ID Segel</th>
                      <th className="px-5 py-4 font-extrabold whitespace-nowrap">Insiden</th>
                      <th className="px-5 py-4 font-extrabold whitespace-nowrap">Status Penanganan</th>
                      <th className="px-5 py-4 font-extrabold text-center whitespace-nowrap">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayedReports.length === 0 ? (
                      <tr><td colSpan="6" className="p-12 text-center text-gray-400 font-bold text-sm bg-gray-50/50">Tidak ada data pelaporan ditemukan.</td></tr>
                    ) : (
                      displayedReports.map((report, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                          <td className="px-5 py-4">
                             <div className="text-sm font-bold text-gray-800">{report.report_date}</div>
                             <div className="text-xs font-semibold text-gray-500 mt-1">{report.reporter}</div>
                          </td>
                          <td className="px-5 py-4">
                             <div className="text-sm font-black text-gray-800">{report.nopol}</div>
                             <div className="text-xs font-bold text-gray-500 mt-1">{report.location}</div>
                          </td>
                          <td className="px-5 py-4">
                             <div className="font-mono font-black text-[#146b99] text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-100 w-fit">{report.sealId}</div>
                             <div className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-wider">{report.seal_category}</div>
                          </td>
                          <td className="px-5 py-4 text-sm font-extrabold text-rose-600 whitespace-nowrap">
                             {report.incident_type}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                             {getStatusBadge(report.status)}
                          </td>
                          <td className="px-5 py-4 text-center whitespace-nowrap">
                            <button onClick={() => setSelectedReport(report)} className="text-sm font-bold text-white bg-[#146b99] hover:bg-[#11577c] px-4 py-1.5 rounded-lg flex items-center justify-center gap-1.5 mx-auto transition-all shadow-sm">
                              <Eye size={16}/> Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white text-sm">
                <div className="text-gray-500 font-semibold text-xs sm:text-sm">Menampilkan <span className="font-black text-gray-800">{filteredReports.length === 0 ? 0 : startIndex + 1}</span> hingga <span className="font-black text-gray-800">{Math.min(startIndex + entriesPerPage, filteredReports.length)}</span> dari <span className="font-black text-gray-800">{filteredReports.length}</span> laporan</div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold uppercase">Prev</button>
                  <span className="px-3 py-2 text-gray-600 font-bold text-sm">Hal {currentPage} dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold uppercase">Next</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DaftarPelaporan;