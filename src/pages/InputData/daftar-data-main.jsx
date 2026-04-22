import React from 'react';
import ReactDOM from 'react-dom/client';
import DaftarData from './DaftarData.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

// Mengecek sesi login sebelum memuat halaman
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    // Jika tidak ada sesi (belum login), arahkan kembali ke halaman login
    window.location.href = '/index.html';
  } else {
    // Jika ada sesi, render komponen DaftarData dengan meneruskan prop session
    const rootElement = document.getElementById('root');
    
    if (rootElement) {
      ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
          <DaftarData session={session} />
        </React.StrictMode>
      );
    }
  }
});