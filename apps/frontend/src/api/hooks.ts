import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminMetrics,
  Assessment,
  BatchItem,
  BatchSummary,
  BlockDetail,
  BlockSummary,
  ChainNotification,
  FeedbackSummary,
  FraudCenterData,
  FullLifecycleData,
  Heatmap,
  HistoryEntry,
  Meta,
  ModelReport,
  NetworkData,
  ParticipantDashboardData,
  ParticipantView,
  RetrainResult,
  StageOverviewData,
  Summary,
  TimePoint,
  Trail,
  TransferItem,
  TxInput,
  TxView,
  UserProfile,
  VerifyResult,
} from "./types";

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: () =>
      api.get<{
        status: string;
        model_version: string;
        demo_mode: boolean;
        thresholds: { flag: number; quarantine: number };
      }>("/health"),
    staleTime: 60_000,
  });

export const useSummary = () =>
  useQuery({ queryKey: ["summary"], queryFn: () => api.get<Summary>("/stats/summary") });

export const useTimeseries = (bucket = 60, buckets = 24) =>
  useQuery({
    queryKey: ["timeseries", bucket, buckets],
    queryFn: () => api.get<TimePoint[]>(`/stats/timeseries?bucket_minutes=${bucket}&buckets=${buckets}`),
  });

export const useFraudByType = () =>
  useQuery({
    queryKey: ["fraud-by-type"],
    queryFn: () => api.get<{ type: string; label: string; count: number }[]>("/stats/fraud-by-type"),
  });

export const useHeatmap = () =>
  useQuery({ queryKey: ["heatmap"], queryFn: () => api.get<Heatmap>("/stats/risk-heatmap") });

export const useStages = () =>
  useQuery({
    queryKey: ["stages"],
    queryFn: () =>
      api.get<{ stage: string; clear: number; flagged: number; quarantined: number }[]>("/stats/stages"),
  });

export const useTransactions = (params: Record<string, string | number | undefined> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery({
    queryKey: ["transactions", qs],
    queryFn: () => api.get<TxView[]>(`/transactions?${qs}`),
  });
};

export const useTransaction = (id: string | null) =>
  useQuery({
    queryKey: ["transaction", id],
    queryFn: () => api.get<TxView>(`/transactions/${id}`),
    enabled: !!id,
  });

export const useQuarantine = () =>
  useQuery({
    queryKey: ["quarantine"],
    queryFn: () => api.get<{ open: TxView[]; reviewed: TxView[] }>("/quarantine"),
  });

export const useBlocks = (limit = 40) =>
  useQuery({
    queryKey: ["blocks", limit],
    queryFn: () =>
      api.get<{ height: number; pending: number; difficulty: number | null; blocks: BlockSummary[] }>(
        `/chain/blocks?limit=${limit}`,
      ),
  });

export const useBlock = (index: number | null) =>
  useQuery({
    queryKey: ["block", index],
    queryFn: () => api.get<BlockDetail>(`/chain/blocks/${index}`),
    enabled: index !== null,
  });

export const useBatches = (flaggedOnly: boolean) =>
  useQuery({
    queryKey: ["batches", flaggedOnly],
    queryFn: () => api.get<BatchSummary[]>(`/batches?flagged_only=${flaggedOnly}&limit=80`),
  });

export const useTrail = (id: string | null) =>
  useQuery({ queryKey: ["trail", id], queryFn: () => api.get<Trail>(`/batches/${id}/trail`), enabled: !!id });

export const useModelReport = () =>
  useQuery({
    queryKey: ["model-report"],
    queryFn: () => api.get<ModelReport>("/model/report"),
    staleTime: Infinity,
  });

export const useMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/sim/meta"), staleTime: Infinity });

export const useParticipants = () =>
  useQuery({ queryKey: ["participants"], queryFn: () => api.get<ParticipantView[]>("/participants") });

export const useNetwork = () =>
  useQuery({ queryKey: ["network"], queryFn: () => api.get<NetworkData>("/network?limit=500") });

/** Invalidate everything that reflects ledger/transaction state. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      predicate: (q) => !["model-report", "meta", "health"].includes(q.queryKey[0] as string),
    });
}

export function useVerify() {
  return useMutation({ mutationFn: () => api.get<VerifyResult>("/chain/verify") });
}

export function useDecision() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject"; note: string }) =>
      api.post<{ tx_id: string; status: string; sealed_blocks: number[] }>(`/quarantine/${v.id}/decision`, {
        action: v.action,
        note: v.note,
      }),
    onSuccess: () => refresh(),
  });
}

export function useScore() {
  return useMutation({ mutationFn: (tx: TxInput) => api.post<Assessment>("/transactions/score", tx) });
}

export const useFeedback = () =>
  useQuery({ queryKey: ["feedback"], queryFn: () => api.get<FeedbackSummary>("/model/feedback") });

export const useModelHistory = () =>
  useQuery({ queryKey: ["model-history"], queryFn: () => api.get<HistoryEntry[]>("/model/history") });

export function useRetrain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RetrainResult>("/model/retrain"),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSubmit() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (tx: TxInput) => api.post<Assessment>("/transactions", tx),
    onSuccess: () => refresh(),
  });
}

// -----------------------------------------------------------------------------
// Admin & Lifecycle Hooks
// -----------------------------------------------------------------------------

export const useAdminMetrics = () =>
  useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => api.get<AdminMetrics>("/admin/metrics"),
    refetchInterval: 3500,
  });

export const useStageOverview = () =>
  useQuery({
    queryKey: ["stage-overview"],
    queryFn: () => api.get<StageOverviewData>("/admin/stage-overview"),
    refetchInterval: 4000,
  });

export const useFraudCenter = () =>
  useQuery({
    queryKey: ["fraud-center"],
    queryFn: () => api.get<FraudCenterData>("/admin/fraud-center"),
    refetchInterval: 4000,
  });

export const useLifecycleBatches = (filters?: { stage?: string; crop?: string; status?: string; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.stage) params.set("stage", filters.stage);
  if (filters?.crop) params.set("crop", filters.crop);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qStr = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["lifecycle-batches", filters],
    queryFn: () => api.get<BatchItem[]>(`/lifecycle/batches${qStr}`),
    refetchInterval: 4000,
  });
};

export const useFullLifecycle = (batchId: string | null | undefined) =>
  useQuery({
    queryKey: ["lifecycle-detail", batchId],
    queryFn: () => (batchId ? api.get<FullLifecycleData>(`/lifecycle/${batchId}`) : null),
    enabled: !!batchId,
    refetchInterval: 3500,
  });

export const useBatchLineage = (batchId: string | null | undefined) =>
  useQuery({
    queryKey: ["batch-lineage", batchId],
    queryFn: () => (batchId ? api.get<{ batch_id: string; nodes: string[]; edges: unknown[] }>(`/lifecycle/${batchId}/lineage`) : null),
    enabled: !!batchId,
  });

// -----------------------------------------------------------------------------
// Participant Portal Hooks
// -----------------------------------------------------------------------------

export const useDemoUsers = () =>
  useQuery({
    queryKey: ["demo-users"],
    queryFn: () => api.get<UserProfile[]>("/participant/users"),
    staleTime: 600_000,
  });

export const useParticipantDashboard = () =>
  useQuery({
    queryKey: ["participant-dashboard"],
    queryFn: () => api.get<ParticipantDashboardData>("/participant/dashboard"),
    refetchInterval: 3500,
  });

export const useParticipantBatches = () =>
  useQuery({
    queryKey: ["participant-batches"],
    queryFn: () => api.get<BatchItem[]>("/participant/batches"),
    refetchInterval: 3500,
  });

export const useIncomingTransfers = () =>
  useQuery({
    queryKey: ["incoming-transfers"],
    queryFn: () => api.get<TransferItem[]>("/participant/transfers/incoming"),
    refetchInterval: 3500,
  });

export const useOutgoingTransfers = () =>
  useQuery({
    queryKey: ["outgoing-transfers"],
    queryFn: () => api.get<TransferItem[]>("/participant/transfers/outgoing"),
    refetchInterval: 3500,
  });

export const useParticipantIdentity = () =>
  useQuery({
    queryKey: ["participant-identity"],
    queryFn: () => api.get<{
      user_id: string;
      username: string;
      name: string;
      role: string;
      participant_id: string | null;
      public_key: string;
      algorithm: string;
      key_status: string;
    }>("/participant/identity"),
  });

// Mutations
export function useHarvestBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      farmer_id: string;
      crop: string;
      quantity_kg: number;
      farm_id?: string;
      farm_location?: string;
      variety?: string;
      quality_grade?: string;
      organic_claimed?: boolean;
      organic_cert_valid?: boolean;
      cert_reference?: string;
    }) => api.post<{ batch_id: string; status: string; is_phantom: boolean }>("/lifecycle/harvest", body),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useTransferDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      batch_id: string;
      sender_id: string;
      receiver_id: string;
      stage: string;
      quantity_kg: number;
      vehicle_number?: string;
      transit_km?: number;
      unit_price?: number;
      notes?: string;
    }) => api.post<{ transfer_id: string; batch_id: string; status: string }>("/lifecycle/transfer", body),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useTransferRespond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      transferId,
      body,
    }: {
      transferId: string;
      body: { receiver_id: string; received_quantity_kg: number; action: string; dispute_reason?: string };
    }) => api.post<{ transfer_id: string; status: string; discrepancy_kg: number }>(`/lifecycle/transfer/${transferId}/respond`, body),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useProcessingOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      processor_id: string;
      operation_name: string;
      input_batch_id: string;
      input_quantity_kg: number;
      outputs: { name: string; variety?: string; quantity_kg: number; quality_grade?: string }[];
      waste_quantity_kg?: number;
      quality_certificate_ref?: string;
    }) => api.post<{ operation_id: string; child_batch_ids: string[]; yield_pct: number }>("/lifecycle/process", body),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useNotifications(
  participantId?: string | null,
  role?: string | null,
  unreadOnly: boolean = false
) {
  const params = new URLSearchParams();
  if (participantId) params.set("participant_id", participantId);
  if (role) params.set("role", role);
  if (unreadOnly) params.set("unread_only", "true");

  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["notifications", participantId, role, unreadOnly],
    queryFn: () =>
      api.get<{
        total: number;
        unread_count: number;
        notifications: ChainNotification[];
      }>(`/notifications${qs}`),
    refetchInterval: 3000,
    staleTime: 2000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.post<{ status: string; id: string; read: boolean }>(`/notifications/${notificationId}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ participantId, role }: { participantId?: string | null; role?: string | null }) => {
      const params = new URLSearchParams();
      if (participantId) params.set("participant_id", participantId);
      if (role) params.set("role", role);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return api.post<{ status: string; updated_count: number }>(`/notifications/mark-all-read${qs}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}


