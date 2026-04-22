import React, { useState, useEffect, useRef } from 'react';
import { Lock, Camera, Scan, X, Loader2, SwitchCamera, ChevronDown, Search, CheckCircle2 } from 'lucide-react';

import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import Notification from '../../components/Notification';

const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyaA8vZPHL_nD9poI4Afqb_NfGMayq80dBgqtANoAaZ7zw2BueodaugYSNRdpRN75R8/exec";

// Fungsi helper untuk memuat jsQR tanpa menyebabkan error import di Vite
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

const InputData = ({ session }) => {
  // --- STATE GLOBAL HALAMAN (MPA) ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [notification, setNotification] = useState({ isOpen: false, type: 'success', message: '', onConfirm: null });
  const showNotification = (message, type = 'success') => setNotification({ isOpen: true, message, type, onConfirm: null });

  const [generateHistory, setGenerateHistory] = useState([]);
  const [installedSeals, setInstalledSeals] = useState([]);

  // --- STATE FORM INPUT ---
  const [installForm, setInstallForm] = useState({ location: '', pic: '', nopol: '' });
  
  const initialSealInputs = {
    gps: { id: '', type: 'Segel Pecah Telur', name: 'GPS', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
    mdvr: { id: '', type: 'Segel Pecah Telur', name: 'MDVR', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
    dsm: { id: '', type: 'Segel Pecah Telur', name: 'DSM', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
    ch3: { id: '', type: 'Segel Pecah Telur', name: 'CH 3 (Menghadap Depan)', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
    ch1: { id: '', type: 'Segel Pecah Telur', name: 'CH 1 (Kamera Kanan)', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
    ch2: { id: '', type: 'Segel Pecah Telur', name: 'CH 2 (Kamera Kiri)', isDouble: false, id2: '', type2: 'Kabel Ties', isNone: false, photo: null },
  };
  
  const [sealInputs, setSealInputs] = useState(initialSealInputs);
  const [isUploading, setIsUploading] = useState(false); 
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  
  const sealDropdownRef = useRef(null);
  const [scannerModal, setScannerModal] = useState({ isOpen: false, category: null, slot: null });

  // --- REFS UNTUK SCANNER ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const activeScanRef = useRef(false);
  const scanTimeoutRef = useRef(null);

  const [cameras, setCameras] = useState([]);
  const [currentCamIndex, setCurrentCamIndex] = useState(0);

  // --- FETCH DATA (MPA) ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsSyncing(true);
      if (session?.user?.id) {
          const { data: roleData } = await supabase.from('user_roles').select('*').eq('user_id', session.user.id).single();
          const userObj = roleData || { name: session.user.email, role: 'user', department: 'Pusat' };
          setCurrentUser(userObj);
          setInstallForm(prev => ({ ...prev, location: userObj.department, pic: userObj.name }));
      }

      const { data: histData } = await supabase.from('generate_history').select('*');
      if (histData) setGenerateHistory(histData);

      const { data: sealData } = await supabase.from('installed_seals').select('*');
      if (sealData) setInstalledSeals(sealData);

      setIsSyncing(false);
    };
    fetchInitialData();
  }, [session]);

  useEffect(() => {
    return () => stopInputScanner();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sealDropdownRef.current && !sealDropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const uniqueGeneratedIds = [...new Set(generateHistory.flatMap(batch => (batch.items || []).map(item => item?.id).filter(Boolean)))];

  const handleCategoryPhotoUpload = (e, key) => {
    const file = e.target.files[0];
    if (file) {
       const reader = new FileReader();
       reader.onload = (event) => {
           setSealInputs(prev => ({ 
             ...prev, 
             [key]: { ...prev[key], photo: event.target.result } 
           }));
       };
       reader.readAsDataURL(file);
    }
  };

  // --- LOGIKA UPDATE INPUT DENGAN PENCEGAHAN DUPLIKASI JENIS SEGEL ---
  const updateSealInput = (key, field, value) => {
    setSealInputs(prev => {
      let newState = { ...prev, [key]: { ...prev[key], [field]: value } };
      
      // Preventif: Jika mode Double Segel diaktifkan, pastikan jenis Slot 2 berbeda dari Slot 1
      if (field === 'isDouble' && value === true) {
        if (newState[key].type === newState[key].type2) {
          newState[key].type2 = newState[key].type === 'Segel Pecah Telur' ? 'Kabel Ties' : 'Segel Pecah Telur';
        }
      }
      
      // Preventif: Jika merubah jenis di salah satu slot, otomatis ubah slot pasangan jika sama
      if (newState[key].isDouble) {
        if (field === 'type' && value === newState[key].type2) {
           newState[key].type2 = value === 'Segel Pecah Telur' ? 'Kabel Ties' : 'Segel Pecah Telur';
        }
        if (field === 'type2' && value === newState[key].type) {
           newState[key].type = value === 'Segel Pecah Telur' ? 'Kabel Ties' : 'Segel Pecah Telur';
        }
      }
      
      return newState;
    });
  };

  // --- LOGIKA VALIDASI ---
  const isFormValid = () => {
    if (!installForm.location || !installForm.pic || !installForm.nopol) return false;
    
    const categories = Object.keys(sealInputs);
    const activeCats = categories.filter(c => !sealInputs[c].isNone);
    if (activeCats.length === 0) return false; 

    let hasNewSeal = false;

    for (let cat of activeCats) {
      const data = sealInputs[cat];
      
      const catActiveSeals = installedSeals.filter(s => s.nopol === installForm.nopol && s.seal_category === data.name && s.status === 'Terpasang');
      const isSlot1Locked = catActiveSeals.some(s => s.seal_type === data.type);
      const isSlot2Locked = data.isDouble && catActiveSeals.some(s => s.seal_type === data.type2);

      if (!isSlot1Locked) {
         if (!data.id) return false;
         hasNewSeal = true;
      }
      
      if (data.isDouble && !isSlot2Locked) {
         if (!data.id2) return false;
         hasNewSeal = true;
      }

      const needsPhoto = (!isSlot1Locked && data.id) || (data.isDouble && !isSlot2Locked && data.id2);
      if (needsPhoto && !data.photo) return false;
    }
    
    return hasNewSeal;
  };

  const getAvailableIdsFor = (categoryKey, isSecondSlot = false) => {
    const currentType = isSecondSlot ? sealInputs[categoryKey].type2 : sealInputs[categoryKey].type;
    const usedInForm = [];
    
    Object.entries(sealInputs).forEach(([key, val]) => {
      if (!val.isNone) {
        if (key !== categoryKey || isSecondSlot) {
          if (val.id && val.type === currentType) usedInForm.push(val.id);
        }
        if (key !== categoryKey || !isSecondSlot) {
          if (val.isDouble && val.id2 && val.type2 === currentType) usedInForm.push(val.id2);
        }
      }
    });
    
    return uniqueGeneratedIds.filter(id => {
       const isUsedInDB = installedSeals.some(seal => seal.sealId === id && seal.seal_type === currentType);
       const isUsedInForm = usedInForm.includes(id);
       return !isUsedInDB && !isUsedInForm;
    });
  };

  const startInputScanner = async (category, slot, forcedCamIndex = null) => {
    if (activeScanRef.current && forcedCamIndex === null) return;
    
    setScannerModal({ isOpen: true, category, slot });
    activeScanRef.current = true;

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    
    scanTimeoutRef.current = setTimeout(() => {
        if (activeScanRef.current) {
            stopInputScanner();
            showNotification("Batas waktu scan habis (15 Detik). Silakan gunakan opsi input manual.", 'warning');
        }
    }, 15000);

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!activeScanRef.current) return;

      const jsQR = await loadJsQR();

      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);

      let targetList = cameras;
      if (targetList.length === 0) {
          try {
              const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
              tempStream.getTracks().forEach(t => t.stop());
          } catch(e) {}

          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
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
          const bestIdx = targetList.findIndex(c => {
              const lbl = c.label.toLowerCase();
              if (lbl.includes('main') || lbl.includes('1x') || lbl.includes('standard') || lbl.includes('utama')) return true;
              return !lbl.includes('ultra') && !lbl.includes('0.5') && !lbl.includes('wide') && !lbl.includes('macro') && !lbl.includes('tele') && !lbl.includes('depth');
          });
          camIndexToUse = bestIdx !== -1 ? bestIdx : 0;
      }

      setCurrentCamIndex(camIndexToUse);

      const constraints = {
          video: targetList.length > 0 && targetList[camIndexToUse].deviceId 
              ? { deviceId: { exact: targetList[camIndexToUse].deviceId }, width: { ideal: 1280 }, advanced: [{ focusMode: "continuous" }] } 
              : { facingMode: "environment", width: { ideal: 1280 }, advanced: [{ focusMode: "continuous" }] }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          videoRef.current.play();

          const scanLoop = () => {
              if (!activeScanRef.current) return;
              
              if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  const ctx = canvas.getContext("2d", { willReadFrequently: true });
                  
                  const vw = videoRef.current.videoWidth;
                  const vh = videoRef.current.videoHeight;
                  
                  const size = Math.min(vw, vh);
                  const zoomFactor = 2.5; 
                  const cropSize = size / zoomFactor; 
                  const sx = (vw - cropSize) / 2;
                  const sy = (vh - cropSize) / 2;
                  
                  canvas.width = cropSize; 
                  canvas.height = cropSize;
                  ctx.filter = 'none';
                  ctx.drawImage(videoRef.current, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);

                  const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
                  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });

                  if (code && code.data) {
                      const scannedId = extractSealId(code.data).trim();
                      handleSuccessfulScan(scannedId, category, slot);
                      return;
                  }
              }
              animationRef.current = requestAnimationFrame(scanLoop);
          };
          animationRef.current = requestAnimationFrame(scanLoop);
      }

    } catch (err) {
      if (activeScanRef.current) {
          showNotification("Gagal mengakses kamera. Pastikan izin kamera diberikan.", 'error');
          stopInputScanner();
      }
    }
  };

  const handleSuccessfulScan = (scannedId, category, slot) => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

      if (!uniqueGeneratedIds.includes(scannedId)) {
         showNotification(`INVALID: ID '${scannedId}' palsu atau tidak terdaftar di Master Data!`, 'error');
         stopInputScanner();
         return;
      }

      const currentType = slot === 1 ? sealInputs[category].type : sealInputs[category].type2;
      let isAlreadyScanned = false;
      
      Object.keys(sealInputs).forEach(k => {
         if (!sealInputs[k].isNone) {
           if (sealInputs[k].id === scannedId && sealInputs[k].type === currentType) isAlreadyScanned = true;
           if (sealInputs[k].isDouble && sealInputs[k].id2 === scannedId && sealInputs[k].type2 === currentType) isAlreadyScanned = true;
         }
      });
      
      const isUsedInDB = installedSeals.some(seal => seal.sealId === scannedId && seal.seal_type === currentType);
      
      if (isAlreadyScanned || isUsedInDB) {
         showNotification(`Peringatan: ID ini sudah terpakai sebagai ${currentType}!`, 'error');
         stopInputScanner();
         return;
      }

      stopInputScanner();
      updateSealInput(category, slot === 1 ? 'id' : 'id2', scannedId);
  };

  const switchCameraInput = async () => {
    if (cameras.length <= 1) return;
    const nextIdx = (currentCamIndex + 1) % cameras.length;
    startInputScanner(scannerModal.category, scannerModal.slot, nextIdx);
  };

  const stopInputScanner = () => {
    activeScanRef.current = false;
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setScannerModal({ isOpen: false, category: null, slot: null });
  };

  // --- FUNGSI SUBMIT DENGAN PENYAMAAN NAMA KATEGORI ---
  const handleInstallSubmit = async (e) => {
    e.preventDefault();

    const activeSeals = [];
    Object.keys(sealInputs).forEach(key => {
       const s = sealInputs[key];
       if (s.isNone) return;

       // Saring berdasarkan slot yang tidak terkunci
       const catActiveSeals = installedSeals.filter(installed => installed.nopol === installForm.nopol && installed.seal_category === s.name && installed.status === 'Terpasang');
       const isSlot1Locked = catActiveSeals.some(installed => installed.seal_type === s.type);
       const isSlot2Locked = s.isDouble && catActiveSeals.some(installed => installed.seal_type === s.type2);

       // KEDUA SLOT SEKARANG DISIMPAN DENGAN NAMA KATEGORI YANG SAMA (s.name)
       if (!isSlot1Locked && s.id !== '') activeSeals.push({ id: s.id, name: s.name, type: s.type });
       if (s.isDouble && !isSlot2Locked && s.id2 !== '') activeSeals.push({ id: s.id2, name: s.name, type: s.type2 });
    });
    
    if (activeSeals.length === 0) return showNotification('Silakan pilih minimal 1 ID Segel Baru!', 'error');
    if (!installForm.location || !installForm.pic) return showNotification('Lokasi dan PIC wajib diisi!', 'error');
    if (!installForm.nopol) return showNotification('No. Polisi wajib diisi!', 'error');
    
    if (!GOOGLE_APPS_SCRIPT_URL) {
       showNotification("URL Google Apps Script belum diisi di kode!", 'error');
       return;
    }

    setIsUploading(true);

    try {
      const imagesToGrid = [];
      Object.keys(sealInputs).forEach(key => {
        const data = sealInputs[key];
        if (!data.isNone && data.photo) {
           const catActiveSeals = installedSeals.filter(s => s.nopol === installForm.nopol && s.seal_category === data.name && s.status === 'Terpasang');
           const isSlot1Locked = catActiveSeals.some(s => s.seal_type === data.type);
           const isSlot2Locked = data.isDouble && catActiveSeals.some(s => s.seal_type === data.type2);
           
           if (!isSlot1Locked || (data.isDouble && !isSlot2Locked)) {
               imagesToGrid.push({ src: data.photo, label: data.name.toUpperCase() });
           }
        }
      });

      if (imagesToGrid.length === 0) {
          setIsUploading(false);
          return showNotification("Peringatan: Tidak ada satupun foto item segel yang diunggah!", 'error');
      }

      const len = imagesToGrid.length;
      let cols = 1, rows = 1;
      if (len === 2) { cols = 2; rows = 1; }
      else if (len === 3) { cols = 3; rows = 1; }
      else if (len === 4) { cols = 2; rows = 2; }
      else if (len === 5 || len === 6) { cols = 3; rows = 2; }
      else if (len > 6) { cols = 3; rows = Math.ceil(len / 3); }

      const CELL_SIZE = 800; 
      const canvas = document.createElement('canvas');
      canvas.width = cols * CELL_SIZE; canvas.height = rows * CELL_SIZE;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImage = (src) => new Promise((resolve, reject) => {
          const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
      });

      for (let i = 0; i < imagesToGrid.length; i++) {
          const imgItem = imagesToGrid[i];
          try {
              const img = await loadImage(imgItem.src);
              const col = i % cols; const row = Math.floor(i / cols);
              const x = col * CELL_SIZE; const y = row * CELL_SIZE;

              const size = Math.min(img.width, img.height);
              const sx = (img.width - size) / 2; const sy = (img.height - size) / 2;
              
              ctx.drawImage(img, sx, sy, size, size, x, y, CELL_SIZE, CELL_SIZE);

              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(x, y + CELL_SIZE - 80, CELL_SIZE, 80);
              
              ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px "Nunito", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(imgItem.label, x + (CELL_SIZE / 2), y + CELL_SIZE - 40);
              
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
          } catch (err) {}
      }

      const gridBase64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      const tglSegel = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
      const newFilename = `${installForm.nopol}_${installForm.location}_${tglSegel}.jpg`;
      
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64: gridBase64, filename: newFilename })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      const uploadedPhotoUrl = result.url;

      const newSealsData = activeSeals.map(s => ({
        sealId: s.id,
        location: installForm.location,
        pic: installForm.pic,
        nopol: installForm.nopol,
        seal_category: s.name,
        seal_type: s.type,
        photo: uploadedPhotoUrl, 
        installDate: new Date().toLocaleString('id-ID'),
        timestamp: Date.now(),
        status: 'Terpasang'
      }));

      const { data, error } = await supabase.from('installed_seals').insert(newSealsData).select();
      if (error) {
         if (error.code === '23505') throw new Error("Terjadi duplikasi: Nomor Segel sudah terdaftar di database.");
         throw error;
      }

      setInstalledSeals([...(data || []), ...installedSeals]);
      setInstallForm(prev => ({ ...prev, nopol: '', photo: null }));
      setSealInputs(initialSealInputs);
      
      showNotification(`${newSealsData.length} Data segel berhasil disimpan!`, 'success');
      
      setTimeout(() => {
        if(currentUser?.role === 'admin') window.location.href = '/daftar-data.html';
        else window.scrollTo(0, 0);
      }, 1500);
      
    } catch(err) {
      showNotification(err.message || "Gagal menyimpan data.", 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // --- RENDER BARIS KATEGORI ---
  const renderSealCategoryRow = (key) => {
    const sealData = sealInputs[key];
    const available1 = getAvailableIdsFor(key, false).filter(id => String(id).toLowerCase().includes(String(dropdownSearch).toLowerCase()));
    const isOpen1 = openDropdown === `${key}_1`;
    
    const available2 = getAvailableIdsFor(key, true).filter(id => String(id).toLowerCase().includes(String(dropdownSearch).toLowerCase()));
    const isOpen2 = openDropdown === `${key}_2`;

    // Collision Detection: Mencari data terpasang pada Nopol & Kategori yang sama
    const activeSealsForCat = installedSeals.filter(s => s.nopol === installForm.nopol && s.seal_category === sealData.name && s.status === 'Terpasang');
    
    const isSlot1Locked = activeSealsForCat.some(s => s.seal_type === sealData.type);
    const lockedSeal1 = activeSealsForCat.find(s => s.seal_type === sealData.type);
    
    const isSlot2Locked = activeSealsForCat.some(s => s.seal_type === sealData.type2);
    const lockedSeal2 = activeSealsForCat.find(s => s.seal_type === sealData.type2);

    return (
      <div key={key} className={`p-4 border ${sealData.isNone ? 'border-gray-200 bg-gray-100 opacity-60' : 'border-blue-200 bg-blue-50/30'} rounded-xl flex flex-col gap-4 transition-all duration-300`}>
         <div className="flex justify-between items-center border-b border-gray-200 pb-2">
            <p className="text-sm font-extrabold text-gray-800">{sealData.name}</p>
            <div className="flex gap-4">
               <label className="flex items-center gap-1.5 cursor-pointer">
                 <input type="checkbox" checked={sealData.isNone} onChange={(e) => updateSealInput(key, 'isNone', e.target.checked)} className="w-4 h-4 text-gray-600 rounded border-gray-300" />
                 <span className="text-xs font-bold text-gray-600">Tidak Ada</span>
               </label>
               <label className={`flex items-center gap-1.5 ${sealData.isNone ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                 <input type="checkbox" disabled={sealData.isNone} checked={sealData.isDouble} onChange={(e) => updateSealInput(key, 'isDouble', e.target.checked)} className="w-4 h-4 text-[#146b99] rounded border-gray-300 focus:ring-[#146b99]" />
                 <span className="text-xs font-bold text-[#146b99]">Double Segel</span>
               </label>
            </div>
         </div>

         {!sealData.isNone && (
           <div className="animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-4">
             
             {/* --- SLOT SEGEL 1 --- */}
             <div className="flex flex-col md:flex-row gap-3">
                 <div className="w-full md:w-1/3">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Jenis Segel</label>
                    <select 
                      value={sealData.type} 
                      onChange={(e) => updateSealInput(key, 'type', e.target.value)} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-bold text-gray-700 outline-none focus:border-[#146b99]"
                    >
                       <option value="Segel Pecah Telur">Segel Pecah Telur</option>
                       <option value="Kabel Ties">Kabel Ties</option>
                    </select>
                 </div>
                 
                 <div className="w-full md:w-2/3">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nomor / ID Segel</label>
                    
                    {/* LOGIKA PENGUNCIAN SLOT 1 */}
                    {isSlot1Locked ? (
                       <div className="w-full px-3 border-2 border-emerald-200 bg-emerald-50 rounded-lg flex items-center text-emerald-700 h-[38px] cursor-not-allowed shadow-inner">
                         <span className="font-bold text-[13px] flex items-center gap-2">
                           <CheckCircle2 size={16} className="text-emerald-500" /> Terpasang: {lockedSeal1?.sealId}
                         </span>
                       </div>
                    ) : (
                       <div className="flex gap-2 items-center w-full">
                         <div className="flex-1 relative" ref={isOpen1 ? sealDropdownRef : null}>
                            <div 
                              onClick={() => { setOpenDropdown(isOpen1 ? null : `${key}_1`); setDropdownSearch(''); }} 
                              className={`w-full px-3 py-2 border ${isOpen1 ? 'border-[#146b99] ring-1 ring-[#146b99]' : 'border-gray-300'} rounded-lg flex justify-between items-center bg-white cursor-pointer transition-colors h-[38px]`}
                            >
                               <span className={sealData.id ? "text-gray-800 font-semibold text-sm" : "text-gray-400 text-sm"}>
                                 {sealData.id || (sealData.type === 'Segel Pecah Telur' ? "Pilih atau Ketik ID Segel..." : "Pilih ID Kabel Ties...")}
                               </span>
                               <div className="flex items-center gap-1">
                                  {sealData.id && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); updateSealInput(key, 'id', ''); }} className="text-gray-400 hover:text-red-500">
                                      <X size={14}/>
                                    </button>
                                  )}
                                  <ChevronDown size={14} className="text-gray-400"/>
                               </div>
                            </div>
                            
                            {isOpen1 && (
                               <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
                                  <div className="p-2 border-b flex items-center bg-gray-50">
                                     <Search size={14} className="text-gray-400 mr-2" />
                                     <input autoFocus type="text" className="w-full bg-transparent outline-none text-sm" placeholder="Cari ID..." value={dropdownSearch} onChange={e => setDropdownSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                                  </div>
                                  <ul className="max-h-48 overflow-y-auto custom-scrollbar">
                                     {available1.map(id => (
                                       <li key={id} onClick={() => { updateSealInput(key, 'id', id); setOpenDropdown(null); }} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-50 flex items-center gap-2">
                                         <span className="font-mono text-gray-700">{id}</span>
                                       </li>
                                     ))}
                                     {available1.length === 0 && (
                                       <li className="p-3 text-xs text-center text-gray-500">Tidak ada ID tersedia</li>
                                     )}
                                  </ul>
                               </div>
                            )}
                         </div>
                         
                         {sealData.type === 'Segel Pecah Telur' && (
                           <button type="button" onClick={() => startInputScanner(key, 1)} title="Scan QR Segel" className="h-[38px] px-3 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[#146b99] rounded-lg flex items-center justify-center transition-colors shrink-0">
                             <Scan size={18}/>
                           </button>
                         )}
                       </div>
                    )}
                 </div>
             </div>

             {/* --- SLOT SEGEL 2 (DOUBLE) --- */}
             {sealData.isDouble && (
                 <div className="flex flex-col md:flex-row gap-3 pt-3 border-t border-dashed border-blue-200">
                     <div className="w-full md:w-1/3">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Jenis Segel (Ke-2)</label>
                        <select 
                          value={sealData.type2} 
                          onChange={(e) => updateSealInput(key, 'type2', e.target.value)} 
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-bold text-gray-700 outline-none focus:border-[#146b99]"
                        >
                           <option value="Segel Pecah Telur">Segel Pecah Telur</option>
                           <option value="Kabel Ties">Kabel Ties</option>
                        </select>
                     </div>
                     <div className="w-full md:w-2/3">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nomor / ID Segel (Ke-2)</label>
                        
                        {/* LOGIKA PENGUNCIAN SLOT 2 */}
                        {isSlot2Locked ? (
                           <div className="w-full px-3 border-2 border-emerald-200 bg-emerald-50 rounded-lg flex items-center text-emerald-700 h-[38px] cursor-not-allowed shadow-inner">
                             <span className="font-bold text-[13px] flex items-center gap-2">
                               <CheckCircle2 size={16} className="text-emerald-500" /> Terpasang: {lockedSeal2?.sealId}
                             </span>
                           </div>
                        ) : (
                           <div className="flex gap-2 items-center w-full">
                              <div className="flex-1 relative" ref={isOpen2 ? sealDropdownRef : null}>
                                 <div 
                                   onClick={() => { setOpenDropdown(isOpen2 ? null : `${key}_2`); setDropdownSearch(''); }} 
                                   className={`w-full px-3 py-2 border ${isOpen2 ? 'border-[#146b99] ring-1 ring-[#146b99]' : 'border-gray-300'} rounded-lg flex justify-between items-center bg-white cursor-pointer transition-colors h-[38px]`}
                                 >
                                    <span className={sealData.id2 ? "text-gray-800 font-semibold text-sm" : "text-gray-400 text-sm"}>
                                      {sealData.id2 || (sealData.type2 === 'Segel Pecah Telur' ? "Pilih atau Ketik ID Segel Ke-2..." : "Pilih ID Kabel Ties Ke-2...")}
                                    </span>
                                    <div className="flex items-center gap-1">
                                       {sealData.id2 && (
                                         <button type="button" onClick={(e) => { e.stopPropagation(); updateSealInput(key, 'id2', ''); }} className="text-gray-400 hover:text-red-500">
                                           <X size={14}/>
                                         </button>
                                       )}
                                       <ChevronDown size={14} className="text-gray-400"/>
                                    </div>
                                 </div>
                                 
                                 {isOpen2 && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
                                       <div className="p-2 border-b flex items-center bg-gray-50">
                                          <Search size={14} className="text-gray-400 mr-2" />
                                          <input autoFocus type="text" className="w-full bg-transparent outline-none text-sm" placeholder="Cari ID..." value={dropdownSearch} onChange={e => setDropdownSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                                       </div>
                                       <ul className="max-h-48 overflow-y-auto custom-scrollbar">
                                          {available2.map(id => (
                                            <li key={id} onClick={() => { updateSealInput(key, 'id2', id); setOpenDropdown(null); }} className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-50 flex items-center gap-2">
                                              <span className="font-mono text-gray-700">{id}</span>
                                            </li>
                                          ))}
                                          {available2.length === 0 && (
                                            <li className="p-3 text-xs text-center text-gray-500">Tidak ada ID tersedia</li>
                                          )}
                                       </ul>
                                    </div>
                                 )}
                              </div>
                              
                              {sealData.type2 === 'Segel Pecah Telur' && (
                                <button type="button" onClick={() => startInputScanner(key, 2)} title="Scan QR Segel Ke-2" className="h-[38px] px-3 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[#146b99] rounded-lg flex items-center justify-center transition-colors shrink-0">
                                  <Scan size={18}/>
                                </button>
                              )}
                           </div>
                        )}
                     </div>
                 </div>
             )}

             {/* --- UPLOAD FOTO BUKTI --- */}
             <div className="pt-3 border-t border-gray-200">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Foto Bukti Pemasangan ({sealData.name}) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                   {sealData.photo ? (
                      <img src={sealData.photo} alt="Preview" className="h-14 w-14 object-cover rounded-lg border-2 border-gray-300 shadow-sm shrink-0" />
                   ) : (
                      <div className={`h-14 w-14 bg-white rounded-lg border-2 border-dashed ${isSlot1Locked && (!sealData.isDouble || isSlot2Locked) ? 'border-gray-200 bg-gray-50' : 'border-gray-300'} flex items-center justify-center text-gray-400 shrink-0`}>
                        <Camera size={20} className={isSlot1Locked && (!sealData.isDouble || isSlot2Locked) ? 'opacity-30' : ''}/>
                      </div>
                   )}
                   <div className="flex-1 w-full relative">
                     <input 
                       type="file" 
                       accept="image/*" 
                       capture="environment" 
                       onChange={(e) => handleCategoryPhotoUpload(e, key)} 
                       disabled={isSlot1Locked && (!sealData.isDouble || isSlot2Locked)} 
                       className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-[#146b99] file:text-white hover:file:bg-[#11577c] disabled:file:bg-gray-300 disabled:file:text-gray-500 cursor-pointer transition-colors shadow-sm disabled:cursor-not-allowed" 
                     />
                   </div>
                </div>
             </div>
           </div>
         )}
      </div>
    );
  };

  if (!currentUser) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      <Notification notification={notification} setNotification={setNotification} />

      {/* --- MODAL SCANNER KAMERA --- */}
      {scannerModal.isOpen && (
        <div className="fixed inset-0 bg-black z-[99999] flex flex-col animate-in fade-in zoom-in duration-200">
           <div className="p-4 bg-gray-900 text-white flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3">
                 <div className="bg-blue-600 p-2 rounded-lg"><Scan size={20} /></div>
                 <div>
                    <h3 className="font-bold text-sm leading-none">Arahkan ke QR Code Segel</h3>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">{sealInputs[scannerModal.category]?.name} {scannerModal.slot === 2 ? '(Ke-2)' : ''}</p>
                 </div>
              </div>
              <button type="button" onClick={stopInputScanner} className="p-2 bg-gray-800 rounded-full hover:bg-red-500 transition-colors"><X size={20}/></button>
           </div>
           <div className="flex-1 flex flex-col justify-center items-center bg-black relative p-4">
               <div className="absolute inset-0 border-4 border-blue-500 opacity-20 pointer-events-none m-4 rounded-3xl"></div>
               <div className="w-full max-w-md aspect-square bg-gray-900 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
                  <video ref={videoRef} className="hidden" playsInline muted />
                  <canvas ref={canvasRef} className="w-full h-full object-cover scale-[1.02]" />
                  <div className="absolute inset-0 border-2 border-blue-500/40 m-24 rounded-xl pointer-events-none"></div>
                  <div className="absolute top-1/2 left-24 right-24 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] pointer-events-none" style={{animation: 'scan-animation 2s ease-in-out infinite'}}></div>
               </div>
               <p className="text-white text-sm font-semibold mt-8 animate-pulse text-center">Sedang memindai...</p>
               {cameras.length > 1 && (
                 <button type="button" onClick={switchCameraInput} className="mt-8 bg-gray-800/80 backdrop-blur-md border border-gray-600 text-white px-6 py-3 rounded-full font-bold tracking-wider hover:bg-gray-700 transition-colors flex items-center gap-2 z-10">
                   <SwitchCamera size={18} /> Ganti Lensa ({currentCamIndex + 1}/{cameras.length})
                 </button>
               )}
           </div>
        </div>
      )}

      {/* --- KONTEN UTAMA --- */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar activeMenu="input-data" isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isAdmin={currentUser.role === 'admin'} />

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative w-full">
          <Header activeMenuLabel="Input Data Seal" setIsMobileMenuOpen={setIsMobileMenuOpen} currentUser={currentUser} isSyncing={isSyncing} />
          
          <div className="flex-1 p-4 md:p-8 w-full max-w-[1400px] mx-auto relative">
            <div className="animate-in fade-in duration-300">
              <div className="bg-white p-4 md:p-8 rounded-xl shadow-sm border border-gray-200">
                <div className="mb-6 border-b border-gray-100 pb-4">
                  <h2 className="text-xl font-bold text-gray-800">Form Pemasangan Segel</h2>
                </div>
                
                <form onSubmit={handleInstallSubmit} className="space-y-6">
                  <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div>
                         <label className="block text-xs font-bold text-blue-800 mb-1.5 uppercase tracking-wide">Lokasi / Tag Data <Lock size={12} className="inline mb-0.5"/></label>
                         <input type="text" value={installForm.location} readOnly className="w-full px-4 py-2 font-bold bg-blue-100/50 border border-blue-200 text-blue-900 rounded-md outline-none text-sm cursor-not-allowed" />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-blue-800 mb-1.5 uppercase tracking-wide">Nama PIC / Akun <Lock size={12} className="inline mb-0.5"/></label>
                         <input type="text" value={installForm.pic} readOnly className="w-full px-4 py-2 font-bold bg-blue-100/50 border border-blue-200 text-blue-900 rounded-md outline-none text-sm cursor-not-allowed" />
                       </div>
                     </div>
                     <p className="text-[10px] text-blue-600 font-semibold mt-3 italic"></p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-1.5">No. Polisi / Detail Objek Tambahan <span className="text-red-500">*</span></label>
                    <input 
                      required 
                      type="text" 
                      placeholder="Ketik Nopol Kendaraan (Sistem akan melacak segel yang sudah terpasang otomatis)" 
                      value={installForm.nopol} 
                      onChange={(e) => setInstallForm({...installForm, nopol: e.target.value.replace(/\s/g, '').toUpperCase()})} 
                      className="w-full px-4 py-2.5 font-semibold border border-gray-300 rounded-md focus:ring-1 focus:ring-[#146b99] focus:border-[#146b99] outline-none text-sm text-gray-700 bg-white shadow-sm" 
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100">
                     <h3 className="text-sm font-bold text-gray-800 border-b pb-2 mb-4">Data Segel Terpasang (Pilih yang sesuai)</h3>
                     {['gps', 'mdvr', 'dsm', 'ch3', 'ch1', 'ch2'].map(key => renderSealCategoryRow(key))}
                  </div>

                  <div className="pt-4 flex justify-end border-t border-gray-100 mt-6">
                    <button type="submit" disabled={isUploading || !isFormValid()} className="w-full sm:w-auto bg-[#156592] hover:bg-[#11577c] text-white px-8 py-3 rounded-md font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                      {isUploading ? <Loader2 size={16} className="animate-spin" /> : null} 
                      {isUploading ? "Menyimpan Data..." : "Simpan Data Pemasangan"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputData;