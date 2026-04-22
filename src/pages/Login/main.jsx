import React from 'react';
import ReactDOM from 'react-dom/client';
import Login from './Login.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

// "Satpam" Session: Cek jika sudah login, tendang ke Dashboard (Input Data)
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    window.location.href = '/input.html';
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <Login />
      </React.StrictMode>
    );
  }
});