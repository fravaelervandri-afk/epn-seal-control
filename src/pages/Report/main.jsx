import React from 'react';
import ReactDOM from 'react-dom/client';
import Report from './Report.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.href = '/index.html';
  } else {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <Report session={session} />
      </React.StrictMode>
    );
  }
});
