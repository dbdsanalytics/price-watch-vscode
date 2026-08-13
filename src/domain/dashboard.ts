import type { AccountStatus, OpenRouterManagementStatus } from "../accounts/types"
import type { AgentMetadata } from "../agents/discovery"
import type { AiResult } from "../ai"
import type { AttentionItem } from "./attention"
import type { PriceChange } from "./changes"
import type { ProviderSnapshot } from "./provider"

export interface DashboardState { snapshots: ProviderSnapshot[]; history: PriceChange[]; agents: AgentMetadata[]; accounts: AccountStatus[]; openRouterManagement?: OpenRouterManagementStatus | null; ai: AiResult | null; updatedAt: number; refreshError?: string | null; attention?: AttentionItem[] }
