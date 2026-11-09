import { expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Domain code must run in plain Node (docs/CONVENTIONS.md). This guards the rule mechanically now
// that browser persistence sits next to it: storage, files and rendering stay outside domain/.
const sources = readdirSync(__dirname).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))

test('domain sources are present', () => {
  expect(sources).toContain('snapshot.ts')
})

test.each(sources)('%s imports only zod and sibling domain modules', name => {
  const text = readFileSync(join(__dirname, name), 'utf8')
  const imports = [...text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? m[2])
  for (const target of imports) expect(target === 'zod' || target.startsWith('./'), `${name} imports ${target}`).toBe(true)
})

test.each(sources)('%s uses no browser or framework globals', name => {
  const code = readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  expect(code).not.toMatch(/\b(window|document|navigator|localStorage|sessionStorage|fetch|FileReader|HTMLElement|createRoot|useState|useEffect|THREE)\b/)
})
