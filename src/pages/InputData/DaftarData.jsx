import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Search, Loader2, CalendarClock, Eye, Trash2, FileSpreadsheet, X, Filter, CheckSquare, Square, Download, ChevronDown } from 'lucide-react';

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

const DaftarData = ({ session }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });
  const showConfirm = (message, onConfirm) => setNotification({ isOpen: true, message, type: 'confirm', onConfirm });

  const [installedSeals, setInstalledSeals] = useState([]);
  const [sealSearch, setSealSearch] = useState('');
  const [sealEntries, setSealEntries] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedNopol, setSelectedNopol] = useState(null); 
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Tab State untuk Memisahkan Data Aktif vs Histori
  const [activeTab, setActiveTab] = useState('aktif'); 

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      let currentRole = 'admin';
      let currentDept = 'Pusat';

      if (session?.user?.id) {
          const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
          if (roleData) {
              currentRole = roleData.role;
              currentDept = roleData.department;
              setCurrentUser(roleData);
          } else {
              currentRole = 'user';
              setCurrentUser({ name: session.user.email, role: 'user', department: 'Pusat' });
          }
      }

      // Filter Supabase: Jika bukan admin, hanya tarik data lokasi dia saja
      let query = supabase.from('installed_seals').select('*').order('timestamp', { ascending: false });
      if (currentRole !== 'admin') {
          query = query.eq('location', currentDept);
      }

      const { data: sealData } = await query;
      if (sealData) setInstalledSeals(sealData);

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  const groupedByNopol = useMemo(() => {
    const groups = {};
    
    // Filter berdasarkan Tab Aktif vs Histori
    const filteredByTab = installedSeals.filter(seal => {
       if (activeTab === 'aktif') {
          return seal.status !== 'Diganti / Dilepas';
       } else {
          return seal.status === 'Diganti / Dilepas';
       }
    });

    filteredByTab.forEach(seal => {
        const nopol = seal.nopol || 'Tanpa Nopol';
        if (!groups[nopol]) {
            groups[nopol] = {
                nopol: nopol,
                location: seal.location,
                pic: seal.pic,
                latestDate: seal.installDate,
                timestamp: seal.timestamp || 0,
                seals: []
            };
        }
        if ((seal.timestamp || 0) > groups[nopol].timestamp) {
            groups[nopol].latestDate = seal.installDate;
            groups[nopol].timestamp = seal.timestamp;
            groups[nopol].location = seal.location; 
            groups[nopol].pic = seal.pic;
        }
        groups[nopol].seals.push(seal);
    });
    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
  }, [installedSeals, activeTab]);

  useEffect(() => {
    if (selectedNopol) {
      const updatedGroup = groupedByNopol.find(g => g.nopol === selectedNopol.nopol);
      if (!updatedGroup) setSelectedNopol(null);
      else setSelectedNopol(updatedGroup);
    }
  }, [groupedByNopol]);

  useEffect(() => { setCurrentPage(1); }, [sealSearch, sealEntries, activeTab]);

  const filteredGroups = groupedByNopol.filter(group => 
    String(group.nopol).toLowerCase().includes(String(sealSearch).toLowerCase()) || 
    String(group.location).toLowerCase().includes(String(sealSearch).toLowerCase()) ||
    String(group.pic).toLowerCase().includes(String(sealSearch).toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredGroups.length / sealEntries) || 1;
  const startIndex = (currentPage - 1) * sealEntries;
  const displayedGroups = filteredGroups.slice(startIndex, startIndex + sealEntries);

  const handleDeleteInstalledSeal = async (sealTarget) => {
    showConfirm(`Yakin ingin menghapus segel (ID: ${sealTarget.sealId}) ini secara permanen?`, async () => {
      let query = supabase.from('installed_seals').delete();
      if (sealTarget.id) query = query.eq('id', sealTarget.id);
      else query = query.eq('sealId', sealTarget.sealId).eq('seal_type', sealTarget.seal_type);
      
      const { error } = await query;
      if (error) {
         return showNotification(`Gagal menghapus: ${error.message}`, 'error');
      }
      
      setInstalledSeals(installedSeals.filter(s => 
         sealTarget.id ? s.id !== sealTarget.id : (s.sealId !== sealTarget.sealId || s.seal_type !== sealTarget.seal_type)
      ));
      showNotification("Data segel berhasil dihapus.", 'success');
    });
  };

  const ExportModal = () => {
    const [exportMode, setExportMode] = useState('all'); 
    const [selectedLocs, setSelectedLocs] = useState([]);
    const [selectedNopols, setSelectedNopols] = useState([]);
    const [nopolFilterText, setNopolFilterText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Data source untuk export disesuaikan dengan tab yang sedang aktif
    const dataSourceForExport = useMemo(() => {
       if (activeTab === 'aktif') return installedSeals.filter(s => s.status !== 'Diganti / Dilepas');
       return installedSeals.filter(s => s.status === 'Diganti / Dilepas');
    }, [installedSeals, activeTab]);

    const uniqueLocations = useMemo(() => [...new Set(dataSourceForExport.map(s => s.location).filter(Boolean))], [dataSourceForExport]);
    const uniqueNopols = useMemo(() => [...new Set(dataSourceForExport.map(s => s.nopol).filter(Boolean))], [dataSourceForExport]);
    const filteredNopolChoices = uniqueNopols.filter(n => n.toLowerCase().includes(nopolFilterText.toLowerCase()));

    const toggleArrayItem = (array, setArray, item) => {
      if (array.includes(item)) setArray(array.filter(i => i !== item));
      else setArray([...array, item]);
    };

    const dataToExportCount = useMemo(() => {
      if (exportMode === 'all') return dataSourceForExport.length;
      return dataSourceForExport.filter(seal => {
        if (exportMode === 'lokasi') return selectedLocs.length === 0 || selectedLocs.includes(seal.location);
        if (exportMode === 'nopol') return selectedNopols.length === 0 || selectedNopols.includes(seal.nopol);
        return false;
      }).length;
    }, [exportMode, selectedLocs, selectedNopols, dataSourceForExport]);

    const handleExecuteExport = async () => {
      if (dataToExportCount === 0) return showNotification('Tidak ada data yang cocok dengan filter.', 'error');
      setIsGenerating(true);
      try {
        const XLSX = await loadXLSX();
        let dataToProcess = dataSourceForExport;
        if (exportMode !== 'all') {
          dataToProcess = dataSourceForExport.filter(seal => {
            if (exportMode === 'lokasi') return selectedLocs.length === 0 || selectedLocs.includes(seal.location);
            if (exportMode === 'nopol') return selectedNopols.length === 0 || selectedNopols.includes(seal.nopol);
            return false;
          });
        }

        const formattedData = dataToProcess.map((s, idx) => ({
          'No': idx + 1,
          'No. Polisi': s.nopol,
          'Tanggal Pemasangan': s.installDate,
          'Lokasi': s.location,
          'PIC': s.pic,
          'ID Segel': s.sealId,
          'Kategori Posisi': s.seal_category,
          'Jenis Segel': s.seal_type,
          'Status': s.status,
          'Catatan': s.notes || '-',
          'Link Foto Bukti': s.photo || 'Tidak Ada'
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Data Segel ${activeTab}`);
        
        const wscols = [{wch:5}, {wch:15}, {wch:20}, {wch:15}, {wch:15}, {wch:20}, {wch:25}, {wch:20}, {wch:15}, {wch:15}, {wch:40}];
        worksheet['!cols'] = wscols;

        const dateStr = new Date().toISOString().split('T')[0];
        const modeStr = exportMode === 'all' ? 'All' : exportMode === 'lokasi' ? 'Lokasi' : 'Nopol';
        const filename = `Report_Segel_${activeTab}_${modeStr}_${dateStr}.xlsx`;
        
        XLSX.writeFile(workbook, filename);
        showNotification('File Excel berhasil diunduh!', 'success');
        setIsExportModalOpen(false);
      } catch (err) {
        showNotification('Gagal membuat file Excel. Pastikan koneksi internet stabil.', 'error');
      } finally {
        setIsGenerating(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="flex justify-between items-center p-5 md:p-6 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><FileSpreadsheet size={24} /></div>
              <div>
                <h2 className="font-extrabold text-gray-800 text-lg leading-tight">Export Data ke Excel</h2>
                <p className="text-xs font-semibold text-gray-500 mt-0.5">Pilih parameter data yang ingin ditarik</p>
              </div>
            </div>
            <button onClick={() => setIsExportModalOpen(false)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><X size={20}/></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 md:p-6 custom-scrollbar bg-white">
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">Pilih Kriteria Ekspor</label>
              <div className="relative">
                <select value={exportMode} onChange={(e) => setExportMode(e.target.value)} className="w-full pl-4 pr-10 py-3 border-2 border-gray-200 hover:border-blue-300 rounded-xl font-bold text-gray-800 bg-white outline-none focus:ring-2 focus:ring-[#146b99] focus:border-[#146b99] appearance-none cursor-pointer transition-colors">
                  <option value="all">Tarik Semua Data di Tab Ini</option>
                  <option value="lokasi">Filter Berdasarkan Lokasi</option>
                  <option value="nopol">Filter Berdasarkan Nopol</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><ChevronDown size={20} /></div>
              </div>
            </div>

            {exportMode === 'lokasi' && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <div className="flex items-center gap-2 mb-3 border-t border-gray-100 pt-4">
                  <Filter size={16} className="text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-700">Daftar Lokasi</h3>
                  {selectedLocs.length > 0 && <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedLocs.length} Terpilih</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {uniqueLocations.map(loc => (
                    <label key={loc} className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer text-sm font-semibold transition-colors ${selectedLocs.includes(loc) ? 'bg-blue-50 border-blue-300 text-[#146b99]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={selectedLocs.includes(loc)} onChange={() => toggleArrayItem(selectedLocs, setSelectedLocs, loc)} />
                      {selectedLocs.includes(loc) ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                      <span className="truncate">{loc}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {exportMode === 'nopol' && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <div className="flex items-center gap-2 mb-3 border-t border-gray-100 pt-4">
                  <Search size={16} className="text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-700">Cari & Pilih Nopol</h3>
                  {selectedNopols.length > 0 && <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedNopols.length} Terpilih</span>}
                </div>
                <input type="text" placeholder="Ketik Nopol spesifik..." value={nopolFilterText} onChange={(e) => setNopolFilterText(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-3 outline-none focus:border-[#146b99] focus:ring-1 focus:ring-[#146b99]" />
                <div className="h-48 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 p-2 custom-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                  {filteredNopolChoices.map(nopol => (
                    <label key={nopol} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-sm font-semibold bg-white transition-colors ${selectedNopols.includes(nopol) ? 'border-blue-400 text-[#146b99] shadow-sm' : 'border-gray-200 text-gray-600'}`}>
                      <input type="checkbox" className="hidden" checked={selectedNopols.includes(nopol)} onChange={() => toggleArrayItem(selectedNopols, setSelectedNopols, nopol)} />
                      {selectedNopols.includes(nopol) ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                      <span className="truncate">{nopol}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500 font-semibold text-center sm:text-left">
              Total <span className="font-black text-gray-800 text-base">{dataToExportCount}</span> data siap diekspor
            </div>
            <button onClick={handleExecuteExport} disabled={isGenerating || dataToExportCount === 0} className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} {isGenerating ? 'Memproses Excel...' : 'Unduh File Excel'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-[#146b99]" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />
      {isExportModalOpen && <ExportModal />}

      {/* POPUP DETAIL SEALS PER NOPOL */}
      {selectedNopol && (
        <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="flex justify-between items-center p-5 md:p-6 border-b border-gray-100 bg-[#146b99]">
                 <div className="text-white">
                    <h2 className="font-black text-xl leading-tight">Detail Segel Terpasang</h2>
                    <p className="text-sm font-semibold opacity-80 mt-1">Kendaraan No. Pol: <span className="font-mono bg-white/20 px-1.5 rounded">{selectedNopol.nopol}</span></p>
                 </div>
                 <button onClick={() => setSelectedNopol(null)} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
              </div>
              
              <div className="flex-1 overflow-auto p-5 md:p-6 bg-slate-50 custom-scrollbar">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                       <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Lokasi Pemasangan</p>
                       <p className="font-bold text-gray-800">{selectedNopol.location}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                       <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">PIC Instalasi</p>
                       <p className="font-bold text-gray-800">{selectedNopol.pic}</p>
                    </div>
                 </div>

                 <h3 className="font-extrabold text-gray-800 mb-3 border-b pb-2">Daftar Segel Aktif ({selectedNopol.seals.length})</h3>
                 <div className="grid grid-cols-1 gap-4">
                    {selectedNopol.seals.map((seal, idx) => (
                       <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="flex-1">
                             <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono font-black text-[#146b99] text-lg bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{seal.sealId}</span>
                                <span className={`${seal.status === 'Terpasang' ? 'bg-emerald-100 text-emerald-700' : seal.status === 'Diganti / Dilepas' ? 'bg-gray-100 text-gray-600' : 'bg-rose-100 text-rose-700'} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest`}>
                                  {seal.status || 'AKTIF'}
                                </span>
                             </div>
                             <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-sm font-semibold text-gray-600">
                                <div><span className="text-gray-400 text-xs">Kategori:</span> {seal.seal_category || '-'}</div>
                                <div><span className="text-gray-400 text-xs">Jenis:</span> {seal.seal_type || '-'}</div>
                                <div><span className="text-gray-400 text-xs">Tgl:</span> {seal.installDate}</div>
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-2 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                             {seal.photo && (
                               <button onClick={() => window.open(seal.photo, '_blank')} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[#146b99] rounded-lg text-xs font-bold transition-colors">
                                 <Eye size={16}/> Foto
                               </button>
                             )}
                             {/* HANYA ADMIN YANG BISA MENGHAPUS DATA SECARA PERMANEN */}
                             {currentUser?.role === 'admin' && (
                               <button onClick={() => handleDeleteInstalledSeal(seal)} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors">
                                 <Trash2 size={16}/> Hapus
                               </button>
                             )}
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="daftar-data" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Daftar Data Seal" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative">
            <div className="animate-in fade-in duration-300">
              <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div>
                   <h2 className="text-2xl font-black text-gray-800">Daftar Kendaraan Tersegel</h2>
                   <p className="text-sm text-gray-500 font-semibold mt-1"></p>
                 </div>
                 
                 {/* HANYA ADMIN YANG BISA EXPORT EXCEL */}
                 {currentUser?.role === 'admin' && (
                   <button onClick={() => setIsExportModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-colors shrink-0">
                     <FileSpreadsheet size={18} /> Export Excel
                   </button>
                 )}
              </div>

              {/* UI TAB AKTIF & HISTORI */}
              <div className="flex gap-4 mb-4 border-b border-gray-200">
                 <button onClick={() => setActiveTab('aktif')} className={`pb-3 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'aktif' ? 'border-[#146b99] text-[#146b99]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                   Segel Terpasang & Bermasalah
                 </button>
                 <button onClick={() => setActiveTab('histori')} className={`pb-3 px-2 font-bold text-sm transition-all border-b-2 ${activeTab === 'histori' ? 'border-[#146b99] text-[#146b99]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                   Histori (Sudah Diganti)
                 </button>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 bg-gray-50/50">
                   <div className="flex items-center gap-3">
                      <select value={sealEntries} onChange={(e) => setSealEntries(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-[#146b99] cursor-pointer bg-white">
                         <option value={10}>10 Baris</option><option value={25}>25 Baris</option><option value={50}>50 Baris</option>
                      </select>
                   </div>
                   
                   <div className="relative w-full sm:w-72">
                      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Cari Nopol atau Lokasi..." value={sealSearch} onChange={(e) => setSealSearch(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold outline-none focus:border-[#146b99] w-full bg-white" />
                   </div>
                </div>

                <div className="overflow-x-auto min-h-[400px] custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead className="bg-[#146b99] text-white text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-extrabold whitespace-nowrap">No. Polisi</th>
                        <th className="px-6 py-4 font-extrabold whitespace-nowrap">Waktu Terakhir</th>
                        <th className="px-6 py-4 font-extrabold whitespace-nowrap">Lokasi</th>
                        <th className="px-6 py-4 font-extrabold whitespace-nowrap">PIC</th>
                        <th className="px-6 py-4 font-extrabold text-center whitespace-nowrap">Jumlah Segel</th>
                        <th className="px-6 py-4 font-extrabold text-center whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedGroups.length === 0 ? (
                        <tr><td colSpan="6" className="p-12 text-center text-gray-400 font-bold text-sm bg-gray-50/50">Tidak ada data kendaraan yang ditemukan.</td></tr>
                      ) : (
                        displayedGroups.map((group, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                            <td className="px-6 py-4"><span className="text-base font-black text-gray-800 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{group.nopol}</span></td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-600 whitespace-nowrap flex items-center gap-2"><CalendarClock size={16} className="text-[#146b99]" /> {group.latestDate}</td>
                            <td className="px-6 py-4 text-sm font-extrabold text-gray-800 whitespace-nowrap">{group.location}</td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-600 whitespace-nowrap">{group.pic}</td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <button onClick={() => setSelectedNopol(group)} className="inline-flex items-center justify-center bg-blue-100 text-[#146b99] px-3 py-1 rounded-full text-xs font-black border border-blue-200 hover:bg-[#146b99] hover:text-white transition-all shadow-sm">
                                {group.seals.length} Segel Aktif
                              </button>
                            </td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <button onClick={() => setSelectedNopol(group)} className="text-sm font-bold text-[#146b99] hover:text-blue-800 flex items-center justify-center gap-1.5 mx-auto opacity-70 group-hover:opacity-100 transition-all">
                                <Eye size={18}/> Detail
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white text-sm">
                  <div className="text-gray-500 font-semibold text-xs sm:text-sm">Menampilkan <span className="font-black text-gray-800">{filteredGroups.length === 0 ? 0 : startIndex + 1}</span> hingga <span className="font-black text-gray-800">{Math.min(startIndex + sealEntries, filteredGroups.length)}</span> dari <span className="font-black text-gray-800">{filteredGroups.length}</span> kendaraan</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold uppercase">Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1).map((p, index, array) => (
                        <React.Fragment key={p}>
                          {index > 0 && p - array[index - 1] > 1 && <span className="px-2 text-gray-400 font-bold">...</span>}
                          <button onClick={() => setCurrentPage(p)} className={`min-w-[36px] py-2 rounded-lg border ${currentPage === p ? 'bg-[#146b99] text-white border-[#146b99] shadow-sm font-black' : 'bg-transparent border-transparent text-gray-600 hover:bg-gray-100 font-bold'} transition-all`}>{p}</button>
                        </React.Fragment>
                    ))}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold uppercase">Next</button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DaftarData;