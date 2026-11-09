import { useId } from 'react';

interface ScenarioSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Visible value, e.g. '−30%'. */
  text: string;
  /** Spoken value for screen readers, e.g. '−30 percent change'. */
  spoken: string;
  onChange: (value: number) => void;
  color?: string;
}

/** A labelled range input with its value; the track fills up to the knob. */
export function ScenarioSlider({
  label,
  value,
  min,
  max,
  step,
  text,
  spoken,
  onChange,
  color,
}: ScenarioSliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="flex items-center gap-2 text-[15px] font-medium">
          {color ? <span className="dot" style={{ background: color }} aria-hidden="true" /> : null}
          {label}
        </label>
        <span
          className="display num text-[19px] font-semibold tracking-[-0.02em]"
          aria-hidden="true"
        >
          {text}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={spoken}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${fill}%` }}
      />
    </div>
  );
}
