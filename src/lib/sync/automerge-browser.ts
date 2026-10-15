import * as Automerge from '@automerge/automerge/slim'
import wasmUrl from '@automerge/automerge/automerge.wasm?url'

export type AutomergeApi = typeof Automerge

let ready: Promise<AutomergeApi> | undefined

/**
 * Loads Automerge's WebAssembly as a separate, cacheable asset instead of
 * inlining it as base64 into the JavaScript bundle.
 */
export function loadAutomerge() {
  ready ??= Automerge.initializeWasm(wasmUrl).then(() => Automerge)
  return ready
}
