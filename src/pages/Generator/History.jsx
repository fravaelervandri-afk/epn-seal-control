import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import { Search, Loader2 } from 'lucide-react';

const History = ({ session }) => {
  // --- STATE GLOBAL HALAMAN ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });
  const showConfirm = (message, onConfirm) => setNotification({ isOpen: true, message, type: 'confirm', onConfirm });

  const [generateHistory, setGenerateHistory] = useState([]);

  // --- STATE LOKAL HISTORI ---
  const [historiSearch, setHistoriSearch] = useState('');
  const [historiEntries, setHistoriEntries] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // --- FETCH DATA AWAL ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
          const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
          setCurrentUser(roleData || { name: session.user.email, role: 'user', department: 'Pusat' });
      }

      const { data: histData } = await supabase.from('generate_history').select('*').order('timestamp', { ascending: false });
      if (histData) setGenerateHistory(histData);

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  // Reset ke halaman 1 jika user melakukan pencarian atau mengubah jumlah entri
  useEffect(() => {
    setCurrentPage(1);
  }, [historiSearch, historiEntries]);

  const filteredHistory = generateHistory.filter(batch => 
    String(batch?.id || '').toLowerCase().includes(String(historiSearch).toLowerCase()) ||
    String(batch?.prefix || '').toLowerCase().includes(String(historiSearch).toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredHistory.length / historiEntries) || 1;
  const startIndex = (currentPage - 1) * historiEntries;
  const displayedHistory = filteredHistory.slice(startIndex, startIndex + historiEntries);

  const handleDeleteBatch = async (batchId) => {
    showConfirm('Yakin ingin menghapus histori ini? Semua ID segel akan ditarik.', async () => {
       const { error } = await supabase.from('generate_history').delete().eq('id', batchId);
       if (error) {
          return showNotification("Gagal menghapus data dari Supabase.", 'error');
       }
       setGenerateHistory(generateHistory.filter(b => b.id !== batchId));
       showNotification("Histori berhasil dihapus.", 'success');
    });
  };

  const handleViewBatch = (batch) => {
    // Karena menggunakan arsitektur MPA, simpan ke localStorage lalu redirect
    localStorage.setItem('previewBatchId', batch.id);
    window.location.href = '/generator.html';
  };

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="histori-generator" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Histori Generator" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative">
            
            {/* --- KONTEN HISTORI --- */}
            <div className="animate-in fade-in duration-300">
              <div className="mb-5">
                 <h2 className="text-2xl font-bold text-gray-800">Daftar Histori Generate QR</h2>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 bg-white">
                   <div className="flex items-center gap-2">
                      <select 
                        value={historiEntries} 
                        onChange={(e) => setHistoriEntries(Number(e.target.value))} 
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-[#146b99] cursor-pointer"
                      >
                         <option value={10}>10</option>
                         <option value={25}>25</option>
                         <option value={50}>50</option>
                         <option value={100}>100</option>
                      </select>
                      <span className="text-sm text-gray-500 font-medium">entri per halaman</span>
                   </div>
                   
                   <div className="relative w-full sm:w-auto">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Cari ID Batch..." 
                        value={historiSearch} 
                        onChange={(e) => setHistoriSearch(e.target.value)} 
                        className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:border-[#146b99] w-full sm:w-64" 
                      />
                   </div>
                </div>

                <div className="overflow-x-auto min-h-[400px] custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead className="bg-[#156592] text-white text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">ID Batch</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Waktu Generate</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Rentang ID</th>
                        <th className="px-6 py-4 font-bold whitespace-nowrap">Spesifikasi</th>
                        <th className="px-6 py-4 font-bold text-center whitespace-nowrap">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedHistory.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-gray-400 font-bold text-sm">
                            Belum ada histori.
                          </td>
                        </tr>
                      ) : (
                        displayedHistory.map((batch) => (
                          <tr key={batch.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono font-extrabold text-[#156592] whitespace-nowrap">{batch.id}</td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">{batch.date}</td>
                            <td className="px-6 py-4 text-sm text-gray-800 font-mono font-bold whitespace-nowrap">
                              {batch.prefix}{String(batch.start).padStart(5,'0')} - {batch.prefix}{String(batch.end).padStart(5,'0')}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-extrabold">{batch.count} ID Unik</span>
                                <span className="text-xs font-semibold text-gray-400">@{batch.copies} Salinan / ID</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <div className="flex justify-center gap-3">
                                <button 
                                  onClick={() => handleViewBatch(batch)} 
                                  className="text-xs font-bold text-gray-400 hover:text-[#156592] transition-colors"
                                >
                                  LIHAT
                                </button>
                                <button 
                                  onClick={() => handleDeleteBatch(batch.id)} 
                                  className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  HAPUS
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* FITUR PAGINATION (HALAMAN) BAWAH */}
                <div className="p-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white text-sm">
                  <div className="text-gray-500 font-medium text-xs sm:text-sm">
                    Menampilkan <span className="font-bold text-gray-800">{filteredHistory.length === 0 ? 0 : startIndex + 1}</span> hingga <span className="font-bold text-gray-800">{Math.min(startIndex + historiEntries, filteredHistory.length)}</span> dari <span className="font-bold text-gray-800">{filteredHistory.length}</span> entri
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-bold uppercase">
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1)
                      .map((p, index, array) => (
                        <React.Fragment key={p}>
                          {index > 0 && p - array[index - 1] > 1 && <span className="px-2 text-gray-400">...</span>}
                          <button onClick={() => setCurrentPage(p)} className={`min-w-[32px] py-1.5 rounded-lg border ${currentPage === p ? 'bg-[#146b99] text-white border-[#146b99] font-bold' : 'bg-transparent border-transparent text-gray-600 hover:bg-gray-100'} transition-colors font-semibold`}>
                            {p}
                          </button>
                        </React.Fragment>
                    ))}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-bold uppercase">
                      Next
                    </button>
                  </div>
                </div>

              </div>
            </div>
            {/* --- END KONTEN HISTORI --- */}

          </div>
        </div>
      </div>
    </div>
  );
};

export default History;