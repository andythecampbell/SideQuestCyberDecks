import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EXIT, GeneratorError } from './errors.mjs'

const toolManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)

const installedVersion = (name) =>
  JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version

/** Refuses to run against anything other than the exact pinned engine. */
export function checkEngineVersions(installed, pinned) {
  const mismatches = Object.keys(pinned).filter((name) => installed[name] !== pinned[name])
  if (mismatches.length > 0) {
    const detail = mismatches.map((name) => `${name}: installed ${installed[name]}, pinned ${pinned[name]}`).join('; ')
    throw new GeneratorError('ENGINE_VERSION_MISMATCH', `Engine does not match the pin: ${detail}. Run npm ci in tools/generator-spike.`, { stage: 'engine', exitCode: EXIT.INTERNAL })
  }
}

/**
 * Loads the single-threaded OpenCascade.js build for Replicad and captures what the kernel
 * prints, so the CLI's stdout stays machine-readable and kernel output is available to diagnostics.
 */
export async function loadEngine() {
  const pinned = {
    replicad: toolManifest.dependencies.replicad,
    'replicad-opencascadejs': toolManifest.dependencies['replicad-opencascadejs'],
  }
  checkEngineVersions(
    { replicad: installedVersion('replicad'), 'replicad-opencascadejs': installedVersion('replicad-opencascadejs') },
    pinned,
  )
  const messages = []
  let oc
  let replicad
  let wasmBinary
  try {
    replicad = await import('replicad')
    const { default: initOpenCascade } = await import('replicad-opencascadejs')
    wasmBinary = readFileSync(require.resolve('replicad-opencascadejs/wasm'))
    oc = await initOpenCascade({
      wasmBinary,
      print: (text) => messages.push(text),
      printErr: (text) => messages.push(text),
    })
    replicad.setOC(oc)
  } catch (cause) {
    throw new GeneratorError('ENGINE_LOAD_FAILED', `Could not load the Replicad/OpenCascade.js runtime: ${cause?.message ?? cause}`, { stage: 'engine', exitCode: EXIT.INTERNAL, cause })
  }
  return {
    replicad,
    oc,
    messages,
    versions: {
      replicad: pinned.replicad,
      replicadOpencascadejs: pinned['replicad-opencascadejs'],
      wasmBuild: 'replicad_single',
      wasmSha256: createHash('sha256').update(wasmBinary).digest('hex'),
      wasmBytes: wasmBinary.length,
    },
  }
}

/** Turns anything the kernel throws, including an opaque C++ exception pointer, into a readable message. */
export function describeKernelError(oc, thrown) {
  if (thrown instanceof WebAssembly.Exception) {
    try {
      const [type, message] = oc.getExceptionMessage(thrown)
      oc.decrementExceptionRefcount(thrown)
      return `OpenCascade ${type}: ${message || '(no message)'}`
    } catch {
      return 'Undecodable WebAssembly kernel exception.'
    }
  }
  if (typeof thrown === 'number') {
    try {
      const data = oc.OCJS.getStandard_FailureData(thrown)
      const text = data?.GetMessageString?.()
      const type = data?.DynamicType?.()?.Name?.()
      return `OpenCascade exception${type ? ` ${type}` : ''}: ${text || '(no message)'} [pointer ${thrown}]`
    } catch {
      return `Opaque kernel exception (pointer ${thrown}).`
    }
  }
  return thrown?.message ?? String(thrown)
}
