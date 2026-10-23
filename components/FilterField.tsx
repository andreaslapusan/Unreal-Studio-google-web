/**
 * FilterField — celda de la barra de filtros (Home y /proyectos): icono fino,
 * rótulo en versalitas y el control. La barra es un "instrumento" de piedra con
 * divisiones de 1px, no una píldora flotante.
 */
import React from 'react';

interface Props {
  icon: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}

const FilterField: React.FC<Props> = ({ icon, label, children, className = '' }) => (
  <div className={`group flex items-center gap-3 px-4 md:px-5 py-3.5 md:py-4 min-w-0 border-primary/10 transition-colors duration-300 hover:bg-almond/50 focus-within:bg-almond/70 ${className}`}>
    <span className="hidden md:block shrink-0" aria-hidden="true"><span className="material-symbols-outlined text-[20px] text-primary/35 transition-colors group-focus-within:text-clay group-hover:text-primary/70">{icon}</span></span>
    <div className="flex-1 min-w-0 text-left">
      <span className="us-label block text-primary/45 mb-1">{label}</span>
      {children}
    </div>
  </div>
);

/** Clases compartidas de los <select>/<input> dentro de la barra. */
export const filterControl = 'w-full bg-transparent border-none p-0 text-primary focus:ring-0 font-medium text-sm cursor-pointer outline-none appearance-none pr-8 truncate';
export const filterInput = 'w-full min-w-0 bg-transparent border-none p-0 text-primary focus:ring-0 font-medium text-sm placeholder:text-primary/35 us-num';

export default FilterField;
