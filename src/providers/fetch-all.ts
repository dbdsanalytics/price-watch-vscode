import type { ModelOffer } from "../domain/model"
import type { ProviderId, ProviderSnapshot } from "../domain/provider"
import { sanitizeErrorText } from "../domain/sanitize"

export type ProviderLoaders = Record<ProviderId, () => Promise<ModelOffer[]>>

export async function fetchAllProviders(loaders: ProviderLoaders): Promise<ProviderSnapshot[]> {
  const providers = Object.keys(loaders) as ProviderId[]
  return Promise.all(providers.map(async (provider) => {
    try {
      return { provider, offers: await loaders[provider](), checkedAt: Date.now(), stale: false }
    } catch (error) {
      return { provider, offers: [], checkedAt: Date.now(), stale: true, error: { kind: "network" as const, message: sanitizeErrorText(error instanceof Error ? error.message : String(error)) } }
    }
  }))
}
