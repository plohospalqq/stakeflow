import { useSetUnit } from '@/hooks/useUnitUrlSync';
import { useI18n } from '@/i18n/useI18n';
import type { Unit } from '@/lib/units';
import { useUnitStore } from '@/stores/unit';
import { SegmentedControl } from './SegmentedControl';

export function UnitToggle() {
  const { m, v } = useI18n();
  const unit = useUnitStore((s) => s.unit);
  const setUnit = useSetUnit();
  const options: { value: Unit; label: string }[] = [
    { value: 'boe', label: v(m.units.boe.toggle) },
    { value: 'sm3', label: v(m.units.sm3.toggle) },
  ];
  return (
    <SegmentedControl
      size="sm"
      label={m.settings.units}
      options={options}
      value={unit}
      onChange={setUnit}
    />
  );
}
