/**
 * ECharts hands tooltip formatters either one params object or an array of them (axis
 * trigger). Charts here index their own data arrays, so the data index is all they need.
 */
export function firstDataIndex(params: unknown): number | null {
  const first: unknown = Array.isArray(params) ? params[0] : params;
  if (typeof first !== 'object' || first === null || !('dataIndex' in first)) return null;
  const index: unknown = first.dataIndex;
  return typeof index === 'number' ? index : null;
}
