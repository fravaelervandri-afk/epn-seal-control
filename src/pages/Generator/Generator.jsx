import React, { useState, useEffect } from 'react';
import { PlusCircle, Download, X, Type, Plus, Info, Loader2, Trash2, ShieldCheck, Printer, Settings2 } from 'lucide-react';

import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';
import QRCodeCustom from '../../components/QRCodeCustom';

const Generator = ({ session }) => {
  // ==========================================================================
  // 1. STATE GLOBAL MPA (Layout & Sesi)
  // ==========================================================================
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  const dbClient = supabase;

  // ==========================================================================
  // 2. STATE ASLI GENERATOR
  // ==========================================================================
  const [generateHistory, setGenerateHistory] = useState([]);
  const [previewBatchId, setPreviewBatchId] = useState(null);
  const [generatedQRs, setGeneratedQRs] = useState([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [templateImg, setTemplateImg] = useState(null);
  
  // STATE POSISI & UKURAN ELEMEN
  const [qrPositions, setQrPositions] = useState([{ id: Date.now(), x: 50, y: 50, size: 25 }]);
  const [textPositions, setTextPositions] = useState([]);
  
  const [printConfig, setPrintConfig] = useState({ 
    paper: 'A4', orientation: 'portrait', cols: 1, 
    marginTop: 10, marginBottom: 10, marginX: 10, gapY: 5, gapX: 5,
    widthMm: 100, heightMm: 60, showOutline: true, embedQrText: false, autoCenter: true
  });

  const [inputPrefix, setInputPrefix] = useState('EPN-');
  const [startNum, setStartNum] = useState(1);
  const [count, setCount] = useState(1);
  const [copiesPerId, setCopiesPerId] = useState(1);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false); 

  const activeBatch = previewBatchId ? generateHistory.find(b => b.id === previewBatchId) : null;
  const activeBatchUniqueIds = activeBatch ? [...new Set((activeBatch.items || []).map(item => item?.id).filter(Boolean))] : [];

  // ==========================================================================
  // 3. LIFECYCLE & FETCH DATA
  // ==========================================================================
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
         const { data: roleData } = await dbClient.from('user_roles').select('*').eq('user_id', session.user.id).single();
         setCurrentUser(roleData || { name: session.user.email, role: 'user', department: 'Pusat' });
      }

      const { data: histData } = await dbClient.from('generate_history').select('*').order('timestamp', { ascending: false });
      if (histData) setGenerateHistory(histData);
      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session, dbClient]);

  useEffect(() => {
    const storedBatchId = localStorage.getItem('previewBatchId');
    if (storedBatchId && generateHistory.length > 0) {
      const batch = generateHistory.find(b => b.id === storedBatchId);
      if (batch) {
        setPreviewBatchId(storedBatchId);
        setGeneratedQRs(batch.items);
        setSelectedBatchIds([...new Set(batch.items.map(item => item.id))]);
      }
      localStorage.removeItem('previewBatchId');
    }
  }, [generateHistory]);

  useEffect(() => {
    if (!previewBatchId) {
      const samePrefixBatches = generateHistory.filter(b => b.prefix === inputPrefix);
      if (samePrefixBatches.length > 0) {
        const maxEnd = Math.max(...samePrefixBatches.map(b => parseInt(b.end) || 0));
        setStartNum(maxEnd + 1);
      } else {
        setStartNum(1);
      }
    }
  }, [inputPrefix, previewBatchId, generateHistory]);

  // ==========================================================================
  // 4. KONTROL PRESISI ELEMEN (SINKRON UKURAN)
  // ==========================================================================
  const addQrPosition = () => {
    const currentSize = qrPositions.length > 0 ? qrPositions[0].size : 25;
    setQrPositions([...qrPositions, { id: Date.now(), x: 50, y: 50, size: currentSize }]);
  };
  
  const removeQrPosition = (id) => { 
    if (qrPositions.length > 1) setQrPositions(qrPositions.filter(pos => pos.id !== id)); 
  };
  
  const addTextPosition = () => {
    const currentSize = textPositions.length > 0 ? textPositions[0].size : 4;
    setTextPositions([...textPositions, { id: Date.now(), x: 50, y: 80, size: currentSize }]);
  };
  
  const removeTextPosition = (id) => {
    setTextPositions(textPositions.filter(pos => pos.id !== id));
  };

  // ==========================================================================
  // 5. FUNGSI GENERATOR UTAMA
  // ==========================================================================
  const handleBulkGenerate = () => {
    const newItems = [];
    const duplicates = [];
    const uniqueGeneratedIds = [...new Set(generateHistory.flatMap(batch => (batch.items || []).map(item => item?.id).filter(Boolean)))];
    
    for (let i = 0; i < count; i++) {
      const id = `${inputPrefix}${(startNum + i).toString().padStart(5, '0')}`;
      if (uniqueGeneratedIds.includes(id)) duplicates.push(id);
      for (let j = 0; j < copiesPerId; j++) newItems.push({ id });
    }
    
    if (duplicates.length > 0) {
       showNotification(`DUPLIKASI TERDETEKSI:\nTerdapat ${duplicates.length} ID yang sudah pernah digenerate sebelumnya.\nSistem memblokir duplikasi.`, 'error');
       return;
    }

    setGeneratedQRs(newItems);
    setPreviewBatchId(null); 
    setSelectedBatchIds([]);
  };

  const handleGenerateQR = async () => {
    if (!templateImg) return showNotification("Template stiker belum diunggah!", 'error');
    setIsGeneratingPDF(true);

    let jsPDF;
    try {
        const jspdfModule = await import('jspdf');
        jsPDF = jspdfModule.jsPDF || jspdfModule.default;
    } catch (e) {
        showNotification("Modul 'jspdf' gagal dimuat.", 'error'); 
        setIsGeneratingPDF(false); 
        return;
    }

    try {
      const format = printConfig.paper.toLowerCase(); 
      const orientation = printConfig.orientation === 'landscape' ? 'l' : 'p';
      const pdf = new jsPDF({ orientation, unit: 'mm', format });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const itemWidth = Number(printConfig.widthMm);
      const itemHeight = Number(printConfig.heightMm);
      
      const cols = printConfig.cols;
      const gapY = Number(printConfig.gapY) || 0;
      const gapX = cols > 1 ? (Number(printConfig.gapX) || 0) : 0;

      const effectiveMt = printConfig.autoCenter ? 0 : (Number(printConfig.marginTop) || 0);
      const effectiveMb = printConfig.autoCenter ? 0 : (Number(printConfig.marginBottom) || 0);
      
      const availableHeight = pdfHeight - effectiveMt - effectiveMb;
      let rowsPerPage = Math.max(1, Math.floor((availableHeight + gapY) / (itemHeight + gapY)));
      const itemsPerPage = cols * rowsPerPage;
      
      let batchIdToUse = previewBatchId;

      if (!previewBatchId) {
         let nextBatchNum = 1;
         if (generateHistory.length > 0) {
           const maxNum = Math.max(...generateHistory.map(b => parseInt(b.id.replace('BCH-', ''), 10) || 0));
           nextBatchNum = maxNum + 1;
         }
         batchIdToUse = `BCH-${String(nextBatchNum).padStart(5, '0')}`;
         
         const newBatch = {
           id: batchIdToUse, date: new Date().toLocaleString('id-ID'), timestamp: Date.now(),
           prefix: inputPrefix, start: startNum, end: startNum + count - 1, count: count, copies: copiesPerId, items: generatedQRs
         };

         if (dbClient) {
           const { error } = await dbClient.from('generate_history').insert([newBatch]);
           if (error) throw error;
         }

         setGenerateHistory([newBatch, ...generateHistory]);
         setPreviewBatchId(batchIdToUse);
         setSelectedBatchIds([...new Set(generatedQRs.map(item => item.id))]);
      }

      const generateQROnCanvas = async (text, payload, size, showText) => {
          return new Promise((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "Anonymous";
              img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}&qzone=2&ecc=H`;
              
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = size; canvas.height = size;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, size, size);
                  
                  if (showText) {
                      const fontSize = Math.floor(size * 0.09); 
                      ctx.font = `bold ${fontSize}px monospace`;
                      const textWidth = ctx.measureText(text).width;
                      const paddingX = Math.floor(size * 0.03);
                      const paddingY = Math.floor(size * 0.03);
                      
                      ctx.fillStyle = 'white';
                      ctx.fillRect(size - textWidth - (paddingX * 2), size - fontSize - (paddingY * 2), textWidth + (paddingX * 2), fontSize + (paddingY * 2));
                      ctx.fillStyle = 'black';
                      ctx.textAlign = 'right'; 
                      ctx.textBaseline = 'bottom';
                      ctx.fillText(text, size - paddingX, size - paddingY + (fontSize * 0.1));
                  }
                  resolve(canvas.toDataURL('image/png'));
              };
              img.onerror = () => reject(new Error("Gagal mengunduh QR"));
          });
      };

      const imgFormat = templateImg.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const templateContainer = document.getElementById('master-template-container');
      const previewWidthPx = templateContainer ? templateContainer.getBoundingClientRect().width : 800;

      const uniqueIds = [...new Set(generatedQRs.map(item => item.id))];
      const qrImageCache = {};
      const batchLimit = 10;
      
      for (let b = 0; b < uniqueIds.length; b += batchLimit) {
        const batch = uniqueIds.slice(b, b + batchLimit);
        await Promise.all(batch.map(async (id) => {
           try {
              const dataUrl = await generateQROnCanvas(id, `${window.location.origin}/?verify=${id}`, 300, printConfig.embedQrText);
              qrImageCache[id] = dataUrl;
           } catch (e) { console.error(`Gagal fetch QR untuk ${id}`, e); }
        }));
      }

      for (let i = 0; i < generatedQRs.length; i++) {
        if (i > 0 && i % itemsPerPage === 0) pdf.addPage(); 
        
        const indexOnPage = i % itemsPerPage;
        const col = indexOnPage % cols;
        const row = Math.floor(indexOnPage / cols);

        let startX = Number(printConfig.marginX) || 0;
        let startY = Number(printConfig.marginTop) || 0;

        if (printConfig.autoCenter) {
           const totalGridWidth = (cols * itemWidth) + ((cols - 1) * gapX);
           startX = (pdfWidth - totalGridWidth) / 2;
           const itemsOnThisPage = Math.min(itemsPerPage, generatedQRs.length - (Math.floor(i / itemsPerPage) * itemsPerPage));
           const rowsOnThisPage = Math.ceil(itemsOnThisPage / cols);
           const totalGridHeight = (rowsOnThisPage * itemHeight) + ((rowsOnThisPage - 1) * gapY);
           startY = (pdfHeight - totalGridHeight) / 2;
        }

        const x = startX + (col * (itemWidth + gapX));
        const y = startY + (row * (itemHeight + gapY));

        pdf.addImage(templateImg, imgFormat, x, y, itemWidth, itemHeight, 'TEMPLATE_BG', 'FAST');

        if (printConfig.showOutline) {
           pdf.setDrawColor(200, 200, 200); 
           pdf.setLineWidth(0.2); 
           pdf.rect(x, y, itemWidth, itemHeight);
        }

        const currentId = generatedQRs[i].id;
        const cachedQrImage = qrImageCache[currentId];

        for (let posIdx = 0; posIdx < qrPositions.length; posIdx++) {
           const pos = qrPositions[posIdx];
           if (cachedQrImage) {
               const qrMmWidth = itemWidth * (pos.size / 100);
               const qrMmX = x + (itemWidth * (pos.x / 100)) - (qrMmWidth / 2);
               const qrMmY = y + (itemHeight * (pos.y / 100)) - (qrMmWidth / 2);
               pdf.addImage(cachedQrImage, 'PNG', qrMmX, qrMmY, qrMmWidth, qrMmWidth, `QR_${currentId}`, 'FAST');
           }
        }
        
        if (textPositions.length > 0 && generatedQRs[i]) {
            pdf.setTextColor(0, 0, 0); 
            pdf.setFont("helvetica", "bold");
            
            textPositions.forEach(pos => {
                const fontScaleFactor = itemWidth / previewWidthPx;
                const pxToPt = 2.83465;
                const pdfFontSizePt = (previewWidthPx * (pos.size / 100)) * fontScaleFactor * pxToPt * 1.15; 
                
                pdf.setFontSize(pdfFontSizePt); 
                const textX = x + (itemWidth * (pos.x / 100));
                const textY = y + (itemHeight * (pos.y / 100));
                pdf.text(generatedQRs[i].id, textX, textY, { align: "center", baseline: "middle" });
            });
        }
      }
      
      pdf.save(`SealMaster_${batchIdToUse}.pdf`);
      showNotification("PDF berhasil di-generate dan diunduh!", 'success');
    } catch (error) {
      showNotification("Terjadi kesalahan sistem saat menyusun file PDF.", 'error');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleToggleBatchId = (id) => {
    const newSelected = selectedBatchIds.includes(id) ? selectedBatchIds.filter(sid => sid !== id) : [...selectedBatchIds, id];
    setSelectedBatchIds(newSelected);
    if (activeBatch) setGeneratedQRs(activeBatch.items.filter(item => newSelected.includes(item.id)));
  };

  const handleSelectAllBatchIds = () => { 
      if (activeBatch) { setSelectedBatchIds(activeBatchUniqueIds); setGeneratedQRs(activeBatch.items); } 
  };
  const handleDeselectAllBatchIds = () => { setSelectedBatchIds([]); setGeneratedQRs([]); };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) { 
        const reader = new FileReader(); 
        reader.onload = (event) => setTemplateImg(event.target.result); 
        reader.readAsDataURL(file); 
    }
  };

  // ==========================================================================
  // 6. FUNGSI DRAG KANVAS VISUAL
  // ==========================================================================
  const handleDragStart = (e, index, isText = false) => {
    e.preventDefault(); 
    const container = document.getElementById('master-template-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    const onMove = (mv) => {
      let cx = mv.clientX ?? (mv.touches?.[0].clientX); 
      let cy = mv.clientY ?? (mv.touches?.[0].clientY);
      if (!cx || !cy) return;
      let newX = ((cx - rect.left) / rect.width) * 100; 
      let newY = ((cy - rect.top) / rect.height) * 100;
      
      const setter = isText ? setTextPositions : setQrPositions;
      setter(prev => {
        const updated = [...prev]; 
        updated[index] = { ...updated[index], x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) };
        return updated;
      });
    };
    
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
    };
    
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchmove', onUp);
  };

  // FUNGSI RESIZE MOUSE (SINKRON UKURAN)
  const handleResizeStart = (e, dirX, index, isText = false) => {
    e.preventDefault(); e.stopPropagation();
    const container = document.getElementById('master-template-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX ?? (e.touches?.[0].clientX);
    const startSize = isText ? textPositions[index].size : qrPositions[index].size;
    
    const onMove = (mv) => {
      let cx = mv.clientX ?? (mv.touches?.[0].clientX); 
      if (!cx) return;
      const deltaX = cx - startX; 
      const deltaPercent = ((deltaX * dirX) / rect.width) * 100 * 2;
      
      const setter = isText ? setTextPositions : setQrPositions;
      const minSize = isText ? 0.5 : 5;
      
      // Terapkan size ke SEMUA elemen agar selalu sinkron
      setter(prev => prev.map(p => ({ ...p, size: Math.max(minSize, Math.min(100, startSize + deltaPercent)) })));
    };
    
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
    };
    
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchmove', onUp);
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="generator" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser?.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="QR Generator" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative animate-in fade-in duration-300">
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
               
               {/* ========================================================= */}
               {/* KOLOM KIRI: PENGATURAN & CETAK                              */}
               {/* ========================================================= */}
               <div className="lg:col-span-4 space-y-5">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b pb-3">
                      <span className="bg-blue-100 text-blue-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span> 
                      Unggah Template Stiker
                    </h2>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </div>

                  {previewBatchId ? (
                     <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60 animate-in fade-in duration-300">
                       <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b pb-3">
                         <span className="bg-blue-100 text-blue-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span> 
                         Pilih ID untuk Dicetak
                       </h2>
                       
                       <div className="mb-3 flex justify-between items-center px-1">
                         <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                           Terpilih: {selectedBatchIds.length} / {activeBatchUniqueIds.length}
                         </span>
                         <div className="flex gap-2">
                           <button onClick={handleSelectAllBatchIds} className="text-[11px] text-blue-600 hover:text-blue-800 font-bold">Semua</button>
                           <span className="text-gray-300">|</span>
                           <button onClick={handleDeselectAllBatchIds} className="text-[11px] text-blue-600 hover:text-blue-800 font-bold">Kosong</button>
                         </div>
                       </div>
                       
                       <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50 custom-scrollbar">
                         {activeBatchUniqueIds.map(id => (
                            <label 
                              key={id} 
                              className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-lg border transition-all ${
                                selectedBatchIds.includes(id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-blue-200'
                              }`}
                            >
                              <input 
                                type="checkbox" 
                                checked={selectedBatchIds.includes(id)} 
                                onChange={() => handleToggleBatchId(id)} 
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                              />
                              <span className="text-sm font-mono text-slate-700 font-bold">{id}</span>
                            </label>
                         ))}
                       </div>
                     </div>
                  ) : (
                     <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60 animate-in fade-in duration-300">
                       <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b pb-3">
                         <span className="bg-blue-100 text-blue-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span> 
                         Parameter Stok Baru
                       </h2>
                       
                       <div className="grid grid-cols-2 gap-4 mb-4">
                         <div>
                           <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Prefix</label>
                           <input 
                             type="text" 
                             value={inputPrefix} 
                             onChange={(e) => setInputPrefix(e.target.value)} 
                             className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                           />
                         </div>
                         <div>
                           <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Mulai Dari</label>
                           <input 
                             type="number" 
                             value={startNum} 
                             onChange={(e) => setStartNum(parseInt(e.target.value) || 1)} 
                             className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                           />
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4 mb-5">
                         <div>
                           <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total ID Berbeda</label>
                           <input 
                             type="number" 
                             min="1" 
                             value={count} 
                             onChange={(e) => setCount(parseInt(e.target.value) || 1)} 
                             className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                           />
                         </div>
                         <div>
                           <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Salinan per ID</label>
                           <input 
                             type="number" 
                             min="1" 
                             value={copiesPerId} 
                             onChange={(e) => setCopiesPerId(Math.max(1, parseInt(e.target.value) || 1))} 
                             className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                           />
                         </div>
                       </div>
                       
                       <button 
                         onClick={handleBulkGenerate} 
                         className="w-full bg-[#146b99] text-white py-3 text-sm font-bold rounded-xl hover:bg-[#11577c] transition-colors flex items-center justify-center gap-2"
                       >
                         <PlusCircle size={18} /> Tampilkan Pratinjau
                       </button>
                     </div>
                  )}

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60">
                     <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4 border-b pb-3">
                       <span className="bg-blue-100 text-blue-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">3</span> 
                       Pengaturan Cetak
                     </h2>
                     
                     <div className="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-lg">
                        <p className="text-[11px] font-bold text-blue-800 uppercase mb-2">Ukuran Fisik Stiker (Presisi MM)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Lebar Kertas (mm)</label>
                            <input 
                              type="number" 
                              value={printConfig.widthMm} 
                              onChange={(e) => setPrintConfig({...printConfig, widthMm: Number(e.target.value)})} 
                              className="w-full p-1.5 text-sm font-semibold border rounded bg-white outline-blue-400 focus:border-blue-500" 
                          />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Tinggi Kertas (mm)</label>
                            <input 
                              type="number" 
                              value={printConfig.heightMm} 
                              onChange={(e) => setPrintConfig({...printConfig, heightMm: Number(e.target.value)})} 
                              className="w-full p-1.5 text-sm font-semibold border rounded bg-white outline-blue-400 focus:border-blue-500" 
                            />
                          </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4 mb-4">
                       <div>
                         <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Kertas Target</label>
                         <select 
                           value={printConfig.paper} 
                           onChange={(e) => setPrintConfig({...printConfig, paper: e.target.value})} 
                           className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg bg-slate-50 outline-none focus:border-blue-500"
                         >
                           <option value="A4">A4</option>
                           <option value="A5">A5</option>
                           <option value="A3">A3</option>
                           <option value="Letter">Letter</option>
                         </select>
                       </div>
                       <div>
                         <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Orientasi</label>
                         <select 
                           value={printConfig.orientation} 
                           onChange={(e) => setPrintConfig({...printConfig, orientation: e.target.value})} 
                           className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg bg-slate-50 outline-none focus:border-blue-500"
                         >
                           <option value="landscape">Landscape</option>
                           <option value="portrait">Portrait</option>
                         </select>
                       </div>
                     </div>
                     
                     <div className="mb-4">
                         <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Kolom per Baris (Layout)</label>
                         <select 
                           value={printConfig.cols} 
                           onChange={(e) => setPrintConfig({...printConfig, cols: parseInt(e.target.value)})} 
                           className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg bg-slate-50 outline-none focus:border-blue-500"
                         >
                           <option value="1">1 Kolom</option>
                           <option value="2">2 Kolom</option>
                           <option value="3">3 Kolom</option>
                           <option value="4">4 Kolom</option>
                           <option value="5">5 Kolom</option>
                         </select>
                     </div>
                     
                     <div className="mb-4 border-t border-slate-200 pt-4 space-y-4">
                       <label className="flex items-start gap-3 cursor-pointer group">
                         <div className="mt-0.5">
                           <input 
                             type="checkbox" 
                             checked={printConfig.autoCenter} 
                             onChange={(e) => setPrintConfig({...printConfig, autoCenter: e.target.checked})} 
                             className="w-4 h-4 text-[#146b99] rounded border-gray-300 focus:ring-[#146b99] cursor-pointer" 
                           />
                         </div>
                         <div>
                           <p className="text-sm font-bold text-gray-800">Auto Center (Tengah Otomatis)</p>
                           <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Menempatkan posisi cetak stiker otomatis tepat di tengah PDF (mengabaikan margin luar).</p>
                         </div>
                       </label>
                     </div>

                     {!printConfig.autoCenter && (
                       <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">Margin Kertas Luar (mm)</p>
                         <div className="grid grid-cols-3 gap-2">
                           <div>
                             <label className="block text-[10px] text-slate-500 mb-1 font-semibold">Atas</label>
                             <input 
                               type="number" 
                               min="0" 
                               value={printConfig.marginTop} 
                               onChange={(e) => setPrintConfig({...printConfig, marginTop: e.target.value})} 
                               className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-300 rounded bg-white outline-none focus:border-blue-500" 
                             />
                           </div>
                           <div>
                             <label className="block text-[10px] text-slate-500 mb-1 font-semibold">Bawah</label>
                             <input 
                               type="number" 
                               min="0" 
                               value={printConfig.marginBottom} 
                               onChange={(e) => setPrintConfig({...printConfig, marginBottom: e.target.value})} 
                               className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-300 rounded bg-white outline-none focus:border-blue-500" 
                             />
                           </div>
                           <div>
                             <label className="block text-[10px] text-slate-500 mb-1 font-semibold">Samping</label>
                             <input 
                               type="number" 
                               min="0" 
                               value={printConfig.marginX} 
                               onChange={(e) => setPrintConfig({...printConfig, marginX: e.target.value})} 
                               className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-300 rounded bg-white outline-none focus:border-blue-500" 
                             />
                           </div>
                         </div>
                       </div>
                     )}

                     <div className="mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1">Jarak Antar Stiker (mm)</p>
                       <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="block text-[10px] text-slate-500 mb-1 font-semibold">Vertikal</label>
                            <input 
                              type="number" 
                              min="0" 
                              value={printConfig.gapY} 
                              onChange={(e) => setPrintConfig({...printConfig, gapY: e.target.value})} 
                              className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-300 rounded bg-white outline-none focus:border-blue-500" 
                            />
                         </div>
                         <div className={printConfig.cols === 1 ? 'opacity-50' : ''}>
                            <label className="block text-[10px] text-slate-500 mb-1 font-semibold">Horizontal</label>
                            <input 
                              type="number" 
                              min="0" 
                              value={printConfig.gapX} 
                              onChange={(e) => setPrintConfig({...printConfig, gapX: e.target.value})} 
                              disabled={printConfig.cols === 1} 
                              className="w-full px-2 py-1.5 text-sm font-semibold border border-slate-300 rounded bg-white outline-none focus:border-blue-500 disabled:bg-gray-100" 
                            />
                         </div>
                       </div>
                     </div>

                     <div className="mb-6 border-t border-slate-200 pt-4 space-y-4">
                       <label className="flex items-start gap-3 cursor-pointer group">
                         <div className="mt-0.5">
                           <input 
                             type="checkbox" 
                             checked={printConfig.showOutline} 
                             onChange={(e) => setPrintConfig({...printConfig, showOutline: e.target.checked})} 
                             className="w-4 h-4 text-[#146b99] rounded border-gray-300 focus:ring-[#146b99] cursor-pointer" 
                           />
                         </div>
                         <div>
                           <p className="text-sm font-bold text-gray-800">Garis Tepi (Outline)</p>
                           <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Menambahkan garis tepi abu-abu tipis pada setiap stiker.</p>
                         </div>
                       </label>

                       <label className="flex items-start gap-3 cursor-pointer group">
                         <div className="mt-0.5">
                           <input 
                             type="checkbox" 
                             checked={printConfig.embedQrText} 
                             onChange={(e) => setPrintConfig({...printConfig, embedQrText: e.target.checked})} 
                             className="w-4 h-4 text-[#146b99] rounded border-gray-300 focus:ring-[#146b99] cursor-pointer" 
                           />
                         </div>
                         <div>
                           <p className="text-sm font-bold text-gray-800">Teks ID Kecil (Dalam QR)</p>
                           <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Mencetak ID berukuran sangat kecil yang menempel di pojok gambar QR Code.</p>
                         </div>
                       </label>
                     </div>

                     <button 
                       onClick={handleGenerateQR} 
                       disabled={generatedQRs.length === 0 || isGeneratingPDF} 
                       className={`w-full text-white py-3.5 text-sm font-bold rounded-xl disabled:opacity-50 transition flex items-center justify-center gap-2 ${
                         previewBatchId ? 'bg-[#76b539] hover:bg-[#69a132]' : 'bg-[#8dc63f] hover:bg-[#7bc025]'
                       }`}
                     >
                       {isGeneratingPDF ? (
                         <><Loader2 size={18} className="animate-spin" /> Menyiapkan QR & PDF...</>
                       ) : previewBatchId ? (
                         <><Download size={18} /> Unduh PDF Batch</>
                       ) : (
                         <><Download size={18} /> Simpan sebagai PDF</>
                       )}
                     </button>
                  </div>
               </div>

               {/* ========================================================= */}
               {/* KOLOM KANAN: PREVIEW, DRAG & DROP, SIZE PATEN               */}
               {/* ========================================================= */}
               <div className="lg:col-span-8 flex flex-col gap-6">
                 
                 {templateImg && (
                   <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                     
                     {/* KANVAS VISUAL */}
                     <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-3">
                        <h2 className="font-bold text-slate-800 text-lg">Penyesuaian Posisi Visual</h2>
                        <div className="flex gap-2">
                          <button 
                            onClick={addQrPosition} 
                            className="bg-blue-50 text-[#146b99] hover:bg-blue-100 text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition border border-blue-200"
                          >
                            <Plus size={14} strokeWidth={3} /> Tambah QR
                          </button>
                          <button 
                            onClick={addTextPosition} 
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition border border-emerald-200"
                          >
                            <Type size={14} strokeWidth={3} /> Tambah Teks ID
                          </button>
                        </div>
                     </div>
                     <p className="text-[10px] text-gray-500 mb-4 italic">*Geser dan tarik sudut elemen di bawah ini untuk mengatur posisi dan ukurannya.</p>
                     
                     <div 
                       id="master-template-container" 
                       className="relative w-full border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 shadow-inner" 
                       style={{ aspectRatio: `${printConfig.widthMm} / ${printConfig.heightMm}` }}
                     >
                       <img 
                         src={templateImg} 
                         alt="Master Template" 
                         className="absolute inset-0 w-full h-full object-contain block pointer-events-none" 
                       />
                       
                       {qrPositions.map((pos, index) => (
                         <div 
                           key={pos.id} 
                           className="absolute bg-white p-1 rounded shadow-xl cursor-move ring-2 ring-transparent hover:ring-blue-500 transition-shadow touch-none z-10 group" 
                           style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.size}%`, transform: 'translate(-50%, -50%)' }} 
                           onMouseDown={(e) => handleDragStart(e, index)} 
                           onTouchStart={(e) => handleDragStart(e, index)}
                         >
                            <QRCodeCustom 
                              displayValue={`${inputPrefix}XXXXX`} 
                              qrPayload={`${window.location.origin}/?verify=${inputPrefix}XXXXX`} 
                              size={300} 
                              showText={printConfig.embedQrText} 
                            />
                            
                            {qrPositions.length > 1 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeQrPosition(pos.id); }} 
                                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110"
                              >
                                <X size={12} strokeWidth={3} />
                              </button>
                            )}
                            
                            <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-[#146b99] border-[2px] border-white rounded-full cursor-nw-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, -1, index)} onTouchStart={(e) => handleResizeStart(e, -1, index)} />
                            <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-[#146b99] border-[2px] border-white rounded-full cursor-ne-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 1, index)} onTouchStart={(e) => handleResizeStart(e, 1, index)} />
                            <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-[#146b99] border-[2px] border-white rounded-full cursor-sw-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, -1, index)} onTouchStart={(e) => handleResizeStart(e, -1, index)} />
                            <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-[#146b99] border-[2px] border-white rounded-full cursor-se-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 1, index)} onTouchStart={(e) => handleResizeStart(e, 1, index)} />
                         </div>
                       ))}

                       {textPositions.map((pos, index) => (
                         <div 
                           key={pos.id} 
                           className="absolute bg-white/90 px-2 py-0.5 rounded shadow-md cursor-move hover:ring-2 hover:ring-emerald-500 transition-shadow touch-none z-20 whitespace-nowrap text-center group border border-transparent" 
                           style={{ 
                             left: `${pos.x}%`, 
                             top: `${pos.y}%`, 
                             transform: 'translate(-50%, -50%)', 
                             fontSize: `${pos.size}cqw`, 
                             fontWeight: 'bold', 
                             color: 'black', 
                             border: '1px dashed transparent' 
                           }} 
                           onMouseDown={(e) => handleDragStart(e, index, true)} 
                           onTouchStart={(e) => handleDragStart(e, index, true)} 
                           title="Geser label ID ini"
                         >
                           {inputPrefix}XXXXX
                           <button 
                             onClick={(e) => { e.stopPropagation(); removeTextPosition(pos.id); }} 
                             className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:scale-110"
                           >
                             <X size={10} strokeWidth={3} />
                           </button>
                           
                           <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-emerald-600 border-[2px] border-white rounded-full cursor-nw-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, -1, index, true)} onTouchStart={(e) => handleResizeStart(e, -1, index, true)} />
                           <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-emerald-600 border-[2px] border-white rounded-full cursor-ne-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 1, index, true)} onTouchStart={(e) => handleResizeStart(e, 1, index, true)} />
                           <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-emerald-600 border-[2px] border-white rounded-full cursor-sw-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, -1, index, true)} onTouchStart={(e) => handleResizeStart(e, -1, index, true)} />
                           <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-emerald-600 border-[2px] border-white rounded-full cursor-se-resize shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 1, index, true)} onTouchStart={(e) => handleResizeStart(e, 1, index, true)} />
                         </div>
                       ))}

                       {printConfig.showOutline && (
                         <div className="absolute inset-0 border border-gray-400 pointer-events-none z-10"></div>
                       )}
                     </div>
                   </div>
                 )}

                 {/* AREA CETAK GRID */}
                 <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200/60 flex-1">
                   <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                     <div>
                       <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                         <ShieldCheck size={20} className="text-green-500" /> Area Pratinjau 
                         <span className="text-xs font-bold text-gray-600 bg-slate-100 px-2 py-1 rounded ml-1">{generatedQRs.length} Stiker</span>
                       </h2>
                       <p className="text-[10px] text-slate-400 mt-1 italic">*Tampilan ini hanya visualisasi. Akurasi cetak dapat dilihat di PDF hasil unduhan.</p>
                     </div>
                     {generatedQRs.length > 0 && (
                        <button onClick={() => { setGeneratedQRs([]); setPreviewBatchId(null); setSelectedBatchIds([]); }} className="text-red-500 font-bold text-sm hover:bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition self-start sm:self-auto shrink-0">
                           <Trash2 size={16} /> Batal & Kosongkan
                        </button>
                     )}
                   </div>

                   {generatedQRs.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                       <Printer size={48} className="mb-3 text-slate-300" strokeWidth={1.5} />
                       <p className="font-bold text-slate-500">Area Kosong.</p>
                       <p className="text-sm font-medium mt-1">Silakan generate data atau pilih ID di panel kiri.</p>
                     </div>
                   ) : (
                     <div className="max-h-[700px] overflow-y-auto bg-slate-50 rounded-xl p-2 border border-slate-100 custom-scrollbar">
                       <div className="print-container" style={{ display: 'grid', gridTemplateColumns: `repeat(${printConfig.cols}, minmax(0, 1fr))`, gap: '10px' }}>
                         {generatedQRs.map((item, index) => (
                           <div key={index} className="stiker-item relative bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-sm" style={{ aspectRatio: `${printConfig.widthMm} / ${printConfig.heightMm}`, width: '100%' }}>
                             {templateImg ? <img src={templateImg} alt="Template" className="absolute inset-0 w-full h-full object-contain block pointer-events-none" /> : <div className="absolute inset-0 bg-slate-100 flex items-center justify-center text-slate-400 text-xs italic">[Tanpa Template]</div>}
                             
                             {qrPositions.map((pos) => (
                                <div key={pos.id} className="absolute bg-white p-[2px] rounded-sm pointer-events-none" style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.size}%`, transform: 'translate(-50%, -50%)' }}>
                                   <QRCodeCustom displayValue={item.id} qrPayload={`${window.location.origin}/?verify=${item.id}`} size={250} showText={printConfig.embedQrText} />
                                </div>
                             ))}

                             {textPositions.map((pos) => (
                               <div key={pos.id} className="absolute whitespace-nowrap text-center" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', fontSize: `${pos.size}cqw`, fontWeight: 'bold', color: 'black' }}>{item.id}</div>
                             ))}

                             {printConfig.showOutline && <div className="absolute inset-0 border border-gray-400 pointer-events-none z-10"></div>}
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Generator;
