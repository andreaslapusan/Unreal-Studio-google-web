// Registro central de permisos granulares por empleado.
//
// Para añadir un permiso nuevo: agrega aquí una entrada a EMPLOYEE_PERMISSIONS
// y su toggle aparecerá automáticamente en Admin → Empleados, sin tocar la UI.
// Los gates de cada feature deben leer su estado con hasPermission(emp, key).

export interface EmployeePermission {
  key: string;
  label: string;
  description?: string;
  // Si true, el permiso se considera concedido cuando employees.permissions
  // todavía no define la key (empleados antiguos sin backfill de esa key).
  defaultOn?: boolean;
}

export const EMPLOYEE_PERMISSIONS: EmployeePermission[] = [
  { key: 'check_in', label: 'Fichar entrada/salida', defaultOn: true },
  { key: 'upload_reports', label: 'Subir reportes de obra' },
  { key: 'request_vacation', label: 'Solicitar vacaciones', defaultOn: true },
  { key: 'view_team_calendar', label: 'Ver calendario del equipo', defaultOn: true },
  { key: 'edit_properties', label: 'Editar fichas de propiedades (avance de obra, datos, galería…)' },
];

// Forma mínima del empleado necesaria para evaluar permisos.
export interface EmployeePermissionSource {
  permissions?: Record<string, boolean> | null;
  can_upload_reports?: boolean | null;
}

/**
 * Indica si un empleado tiene concedido el permiso `key`.
 * - Lee de emp.permissions[key].
 * - Fallback para 'upload_reports': si permissions no lo define, usa la
 *   columna legacy can_upload_reports (compatibilidad).
 * - Por defecto false, salvo que la entrada del registro tenga defaultOn.
 */
export function hasPermission(
  emp: EmployeePermissionSource | null | undefined,
  key: string
): boolean {
  if (!emp) return false;

  const value = emp.permissions?.[key];
  if (typeof value === 'boolean') return value;

  // Fallback de compatibilidad para el permiso legacy de reportes.
  if (key === 'upload_reports' && typeof emp.can_upload_reports === 'boolean') {
    return emp.can_upload_reports;
  }

  const entry = EMPLOYEE_PERMISSIONS.find((p) => p.key === key);
  return entry?.defaultOn ?? false;
}
