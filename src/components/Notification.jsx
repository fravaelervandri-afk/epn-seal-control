import React from 'react';
import { CheckCircle2, ShieldAlert, AlertTriangle } from 'lucide-react';

const Notification = ({ notification, setNotification }) => {
  if (!notification.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            notification.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 
            notification.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 size={32} /> : 
             notification.type === 'error' ? <ShieldAlert size={32} /> : <AlertTriangle size={32} />}
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {notification.type === 'success' ? 'Berhasil' : 
             notification.type === 'error' ? 'Peringatan' : 'Konfirmasi'}
          </h3>
          <p className="text-sm text-slate-600 font-medium">{notification.message}</p>
        </div>
        <div className="border-t border-slate-100 p-3 bg-slate-50 flex justify-center gap-3">
          {notification.type === 'confirm' ? (
            <>
              <button onClick={() => setNotification({ ...notification, isOpen: false })} className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors shadow-sm">Batal</button>
              <button onClick={() => { notification.onConfirm(); setNotification({ ...notification, isOpen: false }); }} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm">Ya, Lanjutkan</button>
            </>
          ) : (
            <button onClick={() => setNotification({ ...notification, isOpen: false })} className="w-full max-w-[200px] py-2.5 bg-[#146b99] text-white rounded-xl font-bold text-sm hover:bg-[#11577c] transition-colors shadow-sm">Mengerti</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notification;