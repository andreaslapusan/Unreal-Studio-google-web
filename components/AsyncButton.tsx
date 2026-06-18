import React, { useState } from 'react';

/**
 * Botón con rueda de carga automática para acciones asíncronas (guardar, enviar,
 * borrar, desplegar…). Mientras el onClick (que puede devolver una promesa) está
 * en curso, muestra un spinner y se deshabilita solo, para que en conexiones
 * lentas el usuario vea que está procesando y no vuelva a pulsar.
 *
 * Uso: igual que <button>, pero el onClick puede ser async.
 *   <AsyncButton className="..." onClick={async () => { await guardar(); }}>Guardar</AsyncButton>
 *
 * El spinner usa currentColor → se adapta al color del texto del botón (blanco en
 * botones primary, marrón en claros). `busy` opcional fuerza el estado desde fuera.
 */
interface AsyncButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  busy?: boolean;
}

const AsyncButton: React.FC<AsyncButtonProps> = ({ onClick, children, disabled, busy, className, type = 'button', ...rest }) => {
  const [internalBusy, setInternalBusy] = useState(false);
  const isBusy = busy || internalBusy;

  const handle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onClick || isBusy) return;
    try {
      setInternalBusy(true);
      await onClick(e);
    } finally {
      setInternalBusy(false);
    }
  };

  return (
    <button type={type} disabled={disabled || isBusy} onClick={handle} className={className} {...rest}>
      <span className="inline-flex items-center justify-center gap-2">
        {isBusy && (
          <span
            className="w-4 h-4 border-2 rounded-full animate-spin shrink-0 opacity-80"
            style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }}
            aria-hidden
          />
        )}
        {children}
      </span>
    </button>
  );
};

export default AsyncButton;
