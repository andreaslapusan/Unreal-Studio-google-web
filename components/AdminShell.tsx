/**
 * AdminShell — envoltorio de ruta que coloca el menú lateral (AdminSidebar)
 * a la izquierda de las páginas admin INDEPENDIENTES (Marketing, Portal Manager,
 * Agencias). Así ninguna es un callejón sin salida: siempre hay navegación entre
 * secciones y logout visible. AdminDashboard ya integra su propio sidebar.
 */
import React from 'react';
import AdminSidebar from './AdminSidebar';

const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex bg-gray-50">
    <AdminSidebar />
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

export default AdminShell;

// deploy nudge 064504
