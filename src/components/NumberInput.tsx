import { type ComponentProps, useId } from 'react'

type NumberInputProps = Omit<ComponentProps<'input'>, 'type'> & { unit?: string }

/** Keep native validation and arrow-key support, with a consistent unit suffix. */
export function NumberInput({ unit, className = '', inputMode, step = 1, 'aria-describedby': describedBy, ...props }: NumberInputProps) {
  const unitId = useId()
  const decimal = step === 'any' || !Number.isInteger(Number(step))
  return <span className={`number-field ${className}`}>
    <input {...props} type="number" step={step} inputMode={inputMode ?? (decimal ? 'decimal' : 'numeric')}
      aria-describedby={[describedBy, unit ? unitId : ''].filter(Boolean).join(' ') || undefined} />
    {unit && <span id={unitId} className="number-field-unit">{unit}</span>}
  </span>
}
