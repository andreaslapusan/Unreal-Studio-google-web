import React from "react";
import { fmtThousands, parseNum } from "../lib/numberFormat";

/**
 * Input numérico que MUESTRA separador de miles por puntos (99.000) pero
 * emite el valor crudo en string ("99000") por onChangeValue. Drop-in para
 * sustituir <input type="number"> en todos los menús de la web.
 *
 * Mantiene el teclado numérico en móvil (inputMode="numeric"/"decimal").
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | number | null | undefined;
  onChangeValue: (raw: string) => void;
  decimal?: boolean;
};

const NumberInput: React.FC<Props> = ({ value, onChangeValue, decimal = false, inputMode, ...rest }) => {
  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode || (decimal ? "decimal" : "numeric")}
      value={fmtThousands(value)}
      onChange={(e) => {
        const raw = parseNum(e.target.value);
        onChangeValue(decimal ? raw : raw.replace(/[.,].*$/, ""));
      }}
    />
  );
};

export default NumberInput;
