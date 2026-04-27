import React from 'react';
import ReactDOM from 'react-dom/client';
import Verify from './Verify.jsx';
import '../../index.css';
import { supabase } from '../../config/supabase';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Verify />
  </React.StrictMode>
);
