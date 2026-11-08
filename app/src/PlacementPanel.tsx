import { useState, type FormEvent } from 'react'
import type { ConfigurationV2 } from './domain/articulated'
import { estimateFeatures, refKey, type ComponentDefinition, type EnclosureDefinition } from './domain/catalog'
import { rotateAboutBodyAxis, type PlacementPatch } from './domain/placementEdit'

type Placement = ConfigurationV2['placements'][number]
type Quaternion = Placement['rotation']
type Axis = 'x' | 'y' | 'z'

/** Exact, round-trippable text for stored numbers (shortest JS representation, signed zero kept). */
export const formatExact = (values: readonly number[]) =>
  `[${values.map(v => (Object.is(v, -0) ? '-0' : String(v))).join(', ')}]`

/** Blank or non-numeric text becomes NaN so the domain edit rejects it; nothing is coerced to 0. */
const parseField = (s: string) => (s.trim() === '' ? NaN : Number(s))

export const positionPatch = (f: { x: string; y: string; z: string }) =>
  ({ position: [parseField(f.x), parseField(f.y), parseField(f.z)] as [number, number, number] })

export function rotationPatch(stored: Quaternion, axis: Axis, sign: 1 | -1, step: string) {
  const degrees = parseField(step)
  return Number.isFinite(degrees) ? { rotation: rotateAboutBodyAxis(stored, axis, sign * degrees) } : null
}

interface Props {
  placement: Placement
  component: ComponentDefinition
  enclosure: EnclosureDefinition | undefined
  enclosureRef: { id: string; revision: number }
  errors: string[]
  onEdit: (patch: PlacementPatch) => void
}

export function PlacementPanel({ placement, component, enclosure, enclosureRef, errors, onEdit }: Props) {
  const [step, setStep] = useState('90')
  const [stepError, setStepError] = useState(false)
  const estimates = estimateFeatures(component)
  const body = placement.attachment

  const submitPosition = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    onEdit(positionPatch({ x: String(data.get('x')), y: String(data.get('y')), z: String(data.get('z')) }))
  }
  const rotateBy = (axis: Axis, sign: 1 | -1) => {
    const patch = rotationPatch(placement.rotation, axis, sign, step)
    setStepError(patch === null)
    if (patch) onEdit(patch)
  }

  return (
    <section className="details" aria-label="Selected placement">
      <h2>{component.name}</h2>
      <dl>
        <dt>Component</dt>
        <dd data-field="component">{refKey(placement.component)}</dd>
        <dt>Attachment body</dt>
        <dd data-field="attachment">{body}</dd>
        <dt>Stored position · mm</dt>
        <dd data-field="position">{formatExact(placement.position)}</dd>
        <dt>Stored quaternion [x, y, z, w]</dt>
        <dd data-field="rotation">{formatExact(placement.rotation)}</dd>
        <dt>Enclosure</dt>
        <dd data-field="calibration">
          {refKey(enclosureRef)} calibration: {enclosure?.schemaVersion === 2 ? enclosure.calibration : 'no calibration record'}
        </dd>
      </dl>
      <p className="muted">Catalog features recorded as estimate:</p>
      <ul className="estimates" data-field="estimates">
        {estimates.map(f => <li key={f}>{f}</li>)}
      </ul>
      {estimates.length === 0 && <p className="muted">None recorded as estimate.</p>}

      {/* key resets the draft inputs whenever the stored value or selection changes */}
      <form key={`${placement.id}:${formatExact(placement.position)}`} className="edit" onSubmit={submitPosition}
        aria-label={`Body-local position relative to ${body}`}>
        <p className="muted">Body-local position relative to {body} · mm</p>
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <label key={axis}>
            {axis.toUpperCase()}
            <input name={axis} type="number" step="any" defaultValue={String(placement.position[i])} />
          </label>
        ))}
        <button type="submit">Apply position</button>
      </form>

      <fieldset className="edit">
        <legend className="muted">Rotate about {body} axes</legend>
        <label>
          Step °
          <input type="number" step="any" value={step} onChange={e => setStep(e.target.value)} aria-invalid={stepError} />
        </label>
        {(['x', 'y', 'z'] as const).map(axis => (
          <span key={axis} className="axis">
            {([-1, 1] as const).map(sign => (
              <button key={sign} type="button" onClick={() => rotateBy(axis, sign)}
                aria-label={`Rotate ${sign < 0 ? '−' : '+'} step about ${body} ${axis.toUpperCase()}`}>
                {axis.toUpperCase()}{sign < 0 ? '−' : '+'}
              </button>
            ))}
          </span>
        ))}
      </fieldset>
      {stepError && <p role="alert" className="error">Rotation step must be a finite number of degrees. Nothing was changed.</p>}
      {errors.length > 0 && (
        <div role="alert" className="error">
          Edit rejected; configuration unchanged.
          <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
