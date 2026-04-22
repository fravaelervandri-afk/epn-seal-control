import React from 'react';
import ReactDOM from 'react-dom/client';
import DaftarPelaporan from './DaftarPelaporan.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

// "Satpam" Session: Cek jika sudah login, jika tidak tendang ke halaman Login
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = '/index.html';
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <DaftarPelaporan session={session} />
      </React.StrictMode>
    );
  }
});