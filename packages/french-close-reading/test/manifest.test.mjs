import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

test('bundle manifest ships every entry, patch, and generated Remote contract', () => {
  for (const file of manifest.files) {
    assert.ok(existsSync(path.join(packageRoot, file)), `missing bundle file: ${file}`)
  }
  assert.ok(existsSync(path.join(packageRoot, manifest.main)))
  assert.ok(existsSync(path.join(packageRoot, manifest.dsh.bundle.patch.slice(2))))
  assert.ok(manifest.exports['./remote'])
  assert.ok(manifest.files.includes('lib/typert.host.js'))
  assert.ok(manifest.files.includes('lib/typert.remote-client.js'))
  // Regression guard: declaring this package's own remote subpath as an
  // external is a self-request that misses the module table and fails web boot.
  assert.equal(manifest.dsh.client.external, undefined)
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-typert-protocol'], '0.2.0-rc.2')
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-typert-protocol'], '0.2.0-rc.2')
  assert.equal(manifest.scripts?.preinstall, undefined)
  assert.equal(manifest.scripts?.install, undefined)
  assert.equal(manifest.scripts?.prepare, undefined)
})

test('every relative import in the published Node artifacts is shipped', () => {
  const shipped = new Set(manifest.files)
  for (const file of manifest.files) {
    if (!file.endsWith('.js') || !file.startsWith('lib/')) continue
    const source = readFileSync(path.join(packageRoot, file), 'utf8')
    for (const match of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/gu)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))
      assert.ok(shipped.has(target), `${file} imports ${target}, which package.json "files" omits`)
      assert.ok(existsSync(path.join(packageRoot, target)), `${file} imports missing ${target}`)
    }
  }
})
