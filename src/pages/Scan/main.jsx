import React from 'react';
import ReactDOM from 'react-dom/client';
import Scanner from './Scanner.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = '/index.html';
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <Scanner session={session} />
      </React.StrictMode>
    );
  }
});