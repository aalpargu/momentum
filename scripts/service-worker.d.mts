export function shellRevision(sources: Iterable<readonly [string, string | Uint8Array]>): string
export function createServiceWorker(version: string, assets: string[]): string
export function buildServiceWorker(version: string, bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array }>): string
