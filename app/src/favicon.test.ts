import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('entry page suppresses the implicit missing /favicon.ico request with an inline icon', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  expect(html).toMatch(/<link\s+rel="icon"\s+href="data:image\/svg\+xml,[^"]+"\s*\/?>/)
})
