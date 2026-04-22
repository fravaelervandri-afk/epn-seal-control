import React from 'react';
import ReactDOM from 'react-dom/client';
import Generator from './Generator.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = '/index.html'; // Tendang ke login jika belum auth
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <Generator session={session} />
      </React.StrictMode>
    );
  }
});