import React from 'react';
import ReactDOM from 'react-dom/client';
import History from './History.jsx'; // Meng-import History
import '../../index.css';
import { supabase } from '../../config/supabase';

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = '/index.html';
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        {/* MERENDER HISTORY, BUKAN GENERATOR */}
        <History session={session} /> 
      </React.StrictMode>
    );
  }
});