import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Assessment,
  BatchSummary,
  BlockDetail,
  BlockSummary,
  FeedbackSummary,
  HistoryEntry,
  RetrainResult,
  Heatmap,
  Meta,
  ModelReport,
  NetworkData,
  ParticipantView,
  Summary,
  TimePoint,
  Trail,
  TxInput,
  TxView,
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
