import { refKey } from './domain/catalog'
import manifest from '../public/previews/manifest.json'
export const previewAssets: Record<string, string> = Object.fromEntries(manifest.assets.map(a => [a.catalogKey, a.url]))
const estimates = new Set(['adafruit-mini-chiclet-keyboard@1', 'anker-10000-30w@1'])
export function previewAsset(ref: {id:string;revision:number}, body?: 'base'|'lid') {
 return previewAssets[refKey(ref)+(body?'/'+body:'')]
}
export function previewPolicy(ref: {id:string;revision:number}, body?: 'base'|'lid') {
 const url = previewAsset(ref, body)
 if (url) return {kind:'mesh' as const, url}
 if (!body && estimates.has(refKey(ref))) return {kind:'estimate' as const}
 return {kind:'missing' as const, diagnostic:`Missing preview mapping: ${refKey(ref)}${body ? '/'+body : ''}`}
}
