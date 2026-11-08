import { useSetUnit } from '@/hooks/useUnitUrlSync';
import { UNIT_LABELS, type Unit } from '@/lib/units';
import { useUnitStore } from '@/stores/unit';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'boe', label: UNIT_LABELS.boe.toggle },
  { value: 'sm3', label: UNIT_LABELS.sm3.toggle },
] as const satisfies readonly { value: Unit; label: string }[];

export function UnitToggle() {
  const unit = useUnitStore((s) => s.unit);
  const setUnit = useSetUnit();
  return <SegmentedControl label="Units" options={OPTIONS} value={unit} onChange={setUnit} />;
}
