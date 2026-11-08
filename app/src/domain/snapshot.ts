// Snapshot codec: canonical serialization and version-gated parsing. Pure domain code.
import { ConfigurationV2 } from './articulated'

/** Exact JSON text for a number. JSON.stringify writes -0 as 0, which would lose a stored value. */
const canonicalNumber = (v: number) => (Object.is(v, -0) ? '-0' : JSON.stringify(v))

/** Keys in code-unit order, 2-space indent, all-number arrays on one line. Input key order never matters. */
function canonicalJson(value: unknown, indent = ''): string {
  if (typeof value === 'number') return canonicalNumber(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(v => typeof v === 'number')) return `[${value.map(canonicalNumber).join(', ')}]`
    return `[\n${value.map(v => inner + canonicalJson(v, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (entries.length === 0) return '{}'
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${canonicalJson(v, inner)}`).join(',\n')}\n${indent}}`
}

/**
 * The canonical bytes of a configuration. Throws if the configuration does not satisfy the strict
 * schema, so a value that could not be re-imported is never written out.
 */
export function serializeSnapshot(configuration: ConfigurationV2): string {
  return `${canonicalJson(ConfigurationV2.parse(configuration))}\n`
}
