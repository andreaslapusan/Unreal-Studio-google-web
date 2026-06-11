/**
 * GlobalLoading — ruedecita de carga CENTRADA en pantalla, visible mientras haya
 * alguna acción async en curso (ver lib/loading withLoading). Se monta una vez en App.
 */
import React, { useEffect, useState } from 'react';
import { subscribeLoading } from '../lib/loading';

export default function GlobalLoading() {
  const [n, setN] = useState(0);
  useEffect(() => subscribeLoading(setN), []);
  if (n <= 0) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
      <div className="bg-white rounded-2xl shadow-xl p-5">
        <div className="w-10 h-10 border-4 border-primary/15 border-t-primary rounded-full animate-spin" />
      </div>
    </div>
  );
}
