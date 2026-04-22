import React, { useState } from 'react';
import { 
  QrCode, Database, PlusCircle, List, ScanLine, 
  ChevronDown, ChevronRight, Layers, FileText, History, X 
} from 'lucide-react';

const Sidebar = ({ activeMenu, isMobileMenuOpen, setIsMobileMenuOpen, isAdmin }) => {
  // Buka menu accordion otomatis berdasarkan halaman yang sedang aktif
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(activeMenu === 'generator' || activeMenu === 'histori-generator');
  const [isDataSealOpen, setIsDataSealOpen] = useState(activeMenu === 'input-data' || activeMenu === 'daftar-data');
  const [isReportOpen, setIsReportOpen] = useState(activeMenu.includes('pelaporan'));

  const MenuItem = ({ href, icon: Icon, label, isActive, isChild = false }) => (
    <a
      href={href}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all duration-200 ${
        isActive 
          ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600 font-bold' 
          : 'text-gray-600 hover:bg-gray-50'
      } ${isChild ? 'pl-12' : ''}`}
    >
      {Icon && <Icon size={18} className={isActive ? 'text-blue-600' : 'text-gray-400'} />}
      <span>{label}</span>
    </a>
  );

  return (
    <>
      {isMobileMenuOpen && (
         <div 
           className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm transition-opacity" 
           onClick={() => setIsMobileMenuOpen(false)} 
         />
      )}
      <aside className={`fixed inset-y-0 left-0 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-300 ease-in-out w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6">
          <img 
            src="/logo-elnusa.png" 
            alt="Elnusa Petrofin" 
            className="w-36 h-auto max-h-10 object-contain" 
            onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} 
          />
          <div className="hidden items-center gap-3 w-full">
            <div className="w-8 h-8 bg-[#8dc63f] rounded-lg flex items-center justify-center text-white">
              <QrCode size={20} />
            </div>
            <div>
              <h1 className="font-black text-gray-800 leading-none">SEAL MASTER</h1>
              <p className="text-[10px] text-[#8dc63f] font-bold tracking-tighter uppercase">Elnusa Petrofin</p>
            </div>
          </div>
          <button 
            className="md:hidden text-gray-400 hover:text-gray-600" 
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          
          {/* MENU KHUSUS ADMIN */}
          {isAdmin && (
            <div className="mb-2">
              <button 
                onClick={() => setIsGeneratorOpen(!isGeneratorOpen)} 
                className="w-full flex items-center justify-between px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-semibold"
              >
                <div className="flex items-center gap-3">
                  <QrCode size={18} className="text-gray-400" />
                  <span>QR Generator</span>
                </div>
                {isGeneratorOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {isGeneratorOpen && (
                <div className="bg-gray-50/50">
                  <MenuItem href="/generator.html" isActive={activeMenu === 'generator'} icon={PlusCircle} label="Buat Baru" isChild />
                  <MenuItem href="/history.html" isActive={activeMenu === 'histori-generator'} icon={History} label="Histori" isChild />
                </div>
              )}
            </div>
          )}

          {/* MENU DATA SEAL */}
          <div className="mt-2">
            <button 
              onClick={() => setIsDataSealOpen(!isDataSealOpen)} 
              className="w-full flex items-center justify-between px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-semibold"
            >
              <div className="flex items-center gap-3">
                <Database size={18} className="text-gray-400" />
                <span>Data Seal</span>
              </div>
              {isDataSealOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            {isDataSealOpen && (
              <div className="bg-gray-50/50">
                <MenuItem href="/input.html" isActive={activeMenu === 'input-data'} icon={PlusCircle} label="Input Data Seal" isChild />
                {/* PERBAIKAN: Menghapus batas {isAdmin &&} agar User bisa melihat Daftar Data Seal */}
                <MenuItem href="/daftar-data.html" isActive={activeMenu === 'daftar-data'} icon={List} label="Daftar Data Seal" isChild />
              </div>
            )}
          </div>

          {/* MENU PELAPORAN */}
          <div className="mt-2">
            <button 
              onClick={() => setIsReportOpen(!isReportOpen)} 
              className="w-full flex items-center justify-between px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-semibold"
            >
              <div className="flex items-center gap-3">
                <Layers size={18} className="text-gray-400" />
                <span>Pelaporan</span>
              </div>
              {isReportOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            {isReportOpen && (
              <div className="bg-gray-50/50">
                <MenuItem href="/pelaporan.html" isActive={activeMenu === 'pelaporan-segel'} icon={FileText} label="Pelaporan Segel" isChild />
                {/* PERBAIKAN: Menghilangkan syarat `{isAdmin && ...}` 
                  Sehingga akun User biasa sekarang bisa melihat Daftar Pelaporan 
                */}
                <MenuItem href="/daftar-pelaporan.html" isActive={activeMenu === 'daftar-pelaporan'} icon={List} label="Daftar Pelaporan" isChild />
              </div>
            )}
          </div>

          {/* MENU SCAN QR */}
          <div className="px-3 mt-4 pt-2 border-t border-gray-100">
            <a 
              href="/scan.html"
              className={`w-full flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all ${
                activeMenu === 'scan' ? 'bg-blue-50 text-[#146b99] font-black' : 'text-slate-600 font-bold hover:bg-slate-50'
              }`}
            >
              <ScanLine size={18} />
              <span>Scan QR</span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;