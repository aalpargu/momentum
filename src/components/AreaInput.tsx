import { useId } from 'react'
import type { Area } from '../lib/domain'

export function AreaInput({ value, areas, onChange, label }: { value: Area; areas: Area[]; onChange: (area: Area) => void; label?: string }) {
  const id = useId()
  return <><input aria-label={label} list={id} maxLength={40} value={value} onChange={event => onChange(event.target.value)} placeholder="Yeni veya mevcut alan" /><datalist id={id}>{areas.map(area => <option key={area} value={area} />)}</datalist></>
}
