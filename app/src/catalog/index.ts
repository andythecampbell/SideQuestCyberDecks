// Loads every catalog JSON file at build time and validates it.
import { CatalogEntry, refKey, type ComponentDefinition, type EnclosureDefinition } from '../domain/catalog'

export const catalogFiles: Record<string, unknown> = import.meta.glob('../../../catalog/**/*.json', {
  eager: true,
  import: 'default',
})

export interface Catalog {
  components: Map<string, ComponentDefinition>
  enclosures: Map<string, EnclosureDefinition>
}

export function parseCatalog(raw: Record<string, unknown>): Catalog {
  const catalog: Catalog = { components: new Map(), enclosures: new Map() }
  const errors: string[] = []
  for (const [path, data] of Object.entries(raw)) {
    const result = CatalogEntry.safeParse(data)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
      errors.push(`${path}:\n${issues.join('\n')}`)
      continue
    }
    const entry = result.data
    const key = refKey(entry)
    const exists = entry.kind === 'component' ? catalog.components.has(key) : catalog.enclosures.has(key)
    if (exists) errors.push(`${path}: duplicate ${key}`)
    if (entry.kind === 'component') catalog.components.set(key, entry)
    else catalog.enclosures.set(key, entry)
  }
  if (errors.length) throw new Error(`Invalid catalog:\n${errors.join('\n')}`)
  return catalog
}

export const catalog = parseCatalog(catalogFiles)
