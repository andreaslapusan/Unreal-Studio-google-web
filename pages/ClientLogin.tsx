import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ClientLogin: React.FC = () => {
  useEffect(() => { document.title = 'Portal Inversor | Unreal Studio Madrid'; }, []);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem('_ust_client_');
    if (session) navigate('/cliente/dashboard');
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isEmail = identifier.includes('@');
      
      const { data, error: rpcError } = await supabase.rpc('verify_client_login', {
        p_email: isEmail ? identifier : null,
        p_phone: !isEmail ? identifier : null,
        p_password: password
      });
      if (rpcError || !data || !data.success) {
        setError('Credenciales incorrectas.');
        setPassword('');
        setLoading(false);
        return;
      }
      const token = btoa(`client_${data.client_id}_${Date.now()}`);
      localStorage.setItem('_ust_client_', token);
      if (data.must_change_password) {
        navigate('/cliente/dashboard?change_password=true');
      } else {
        navigate('/cliente/dashboard');
      }
    } catch (err) {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-almond flex items-center justify-center px-6">
      <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl border border-primary/5">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif text-primary mb-2">Portal Inversor</h1>
          <p className="text-sm text-primary/50">Accede a tu panel de inversiones</p>
        </div>
        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-bold p-4 rounded-xl mb-6 text-center">{error}</div>
        )}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Email o Teléfono</label>
            <input type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="tu@email.com o +34..." className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-2xl font-bold border border-gray-200 focus:border-primary focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> Accediendo...</> : 'Acceder al Portal'}
          </button>
        </form>
        <p className="text-center text-xs text-primary/30 mt-8">¿No tienes acceso? Contacta con tu asesor de Unreal Studio.</p>
      </div>
    </div>
  );
};

export default ClientLogin;