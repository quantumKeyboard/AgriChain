export type Decision = "CLEAR" | "FLAGGED" | "QUARANTINED";
export type LedgerStatus = "COMMITTED" | "FLAGGED" | "APPROVED" | "REJECTED" | "PENDING" | "PENDING_REVIEW";

export interface RuleHit {
  id: string;
  severity: number;
  reason: string;
}

export interface ShapItem {
  feature: string;
  label: string;
  value: number;
  contribution: number;
}

export interface TxView {
  id: string;
  batch_id: string;
  crop: string;
  stage: string;
  seller_id: string;
  buyer_id: string;
  seller_name: string;
  buyer_name: string;
  seller_role: string | null;
  buyer_role: string | null;
  region: string | null;
  timestamp: string;
  quantity_kg: number;
  unit_price: number;
  total_value: number;
  ref_price: number;
  quality_grade: string;
  moisture_pct: number;
  organic_claimed: boolean;
  organic_cert_valid: boolean;
  transit_km: number;
  transit_hours: number;
  temp_avg_c: number;
  temp_max_c: number;
  cold_chain_ok_claimed: boolean;
  payment_mode: string;
  sim_label: string | null;
  sim_label_display: string | null;
  risk: number;
  p_fraud: number;
  rule_score: number;
  anomaly_score: number;
  pred_type: string;
  pred_label: string;
  decision: Decision;
  rule_hits: RuleHit[];
  model_version: string;
  shap_top?: ShapItem[] | null;
  type_probs?: Record<string, number>;
  ledger_status: LedgerStatus;
  block_index: number | null;
  tx_hash: string | null;
  review: { action: string; note: string; reviewed_at: string } | null;
  signature: string;
  signature_valid: boolean;
  seller_public_key: string | null;
}

export interface Assessment {
  tx_id: string;
  risk: number;
  p_fraud: number;
  rule_score: number;
  anomaly_score: number;
  pred_type: string;
  pred_label: string;
  type_probs: Record<string, number>;
  decision: Decision;
  rule_hits: RuleHit[];
  shap_top: ShapItem[] | null;
  model_version: string;
  sealed_blocks?: number[];
  total_value?: number;
  ref_price?: number;
}

export interface Summary {
  transactions: number;
  clear: number;
  flagged: number;
  quarantined: number;
  open_quarantine: number;
  rejected: number;
  approved: number;
  value_screened: number;
  value_blocked: number;
  avg_risk: number;
  chain_height: number;
  pending_pool: number;
  ground_truth: { injected: number; caught: number; legit: number; false_alarms: number };
}

export interface TimePoint {
  t: string;
  clear: number;
  flagged: number;
  quarantined: number;
  n: number;
  avg_risk: number | null;
}

export interface Heatmap {
  regions: string[];
  crops: string[];
  cells: { region: string; crop: string; count: number; avg_risk: number | null; flagged: number }[];
}

export interface BlockSummary {
  index: number;
  timestamp: string;
  prev_hash: string;
  merkle_root: string;
  nonce: number;
  difficulty: number;
  hash: string;
  tx_count: number;
  status_counts: Record<string, number>;
}

export interface BlockDetail extends Omit<BlockSummary, "status_counts"> {
  valid: boolean;
  reason: string | null;
  entries: {
    position: number;
    status: string;
    tx_hash: string;
    recomputed_hash: string | null;
    tampered: boolean;
    merkle_proof: { hash: string; position: string }[];
    tx: TxView | undefined;
  }[];
}

export interface VerifyResult {
  valid: boolean;
  first_broken_index: number | null;
  reason: string | null;
  blocks_checked: number;
  blocks: { index: number; ok: boolean; reason: string | null; tampered_tx: string[] }[];
  checked_at: string;
}

export interface BatchSummary {
  id: string;
  crop: string | null;
  region: string | null;
  organic_claimed: boolean;
  hops: number;
  max_risk: number;
  flags: number;
  last_activity: string;
  fraud_types: string[];
}

export interface Trail {
  batch: {
    id: string;
    crop: string;
    origin_farmer_id: string;
    origin_name: string;
    harvest_date: string;
    organic_claimed: boolean;
    organic_cert_valid: boolean;
    region: string;
  };
  hops: TxView[];
}

export interface ModelReport {
  model_version: string;
  trained_at: string;
  thresholds: { flag: number; quarantine: number };
  weights: { ml: number; rules: number; anomaly: number };
  dataset: {
    rows: number;
    train_rows: number;
    test_rows: number;
    shifted_rows: number;
    fraud_rate: number;
    class_counts: Record<string, number>;
  };
  headline: Metrics & { shifted: Metrics };
  ablation: (Metrics & { model: string })[];
  ablation_shifted: (Metrics & { model: string })[];
  per_type: {
    type: string;
    label: string;
    support: number;
    recall: number;
    type_accuracy: number;
    recall_shifted: number | null;
  }[];
  confusion_matrix: { labels: string[]; display: string[]; matrix: number[][] };
  roc: { hybrid: XY[]; rules: XY[] };
  pr: XY[];
  threshold_sweep: {
    threshold: number;
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number;
    recall: number;
  }[];
  score_hist: { bin: number; legit: number; fraud: number }[];
  feature_importance: { feature: string; label: string; importance: number }[];
  feedback?: { rows: number; approved: number; rejected: number; weight: number };
}

export interface Metrics {
  roc_auc: number;
  pr_auc: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface XY {
  x: number;
  y: number;
}

export interface Meta {
  crops: {
    name: string;
    base_price: number;
    yield_per_acre: number;
    perishable: boolean;
    temp_limit: number | null;
  }[];
  stages: { name: string; seller_role: string; buyer_role: string }[];
  regions: string[];
  fraud_types: { type: string; label: string }[];
  participants: { id: string; name: string; role: string; region: string }[];
}

export interface SimResult {
  tx_id: string;
  decision: Decision;
  risk: number;
  pred_label: string;
  injected: boolean;
  sim_label: string;
  sealed_blocks: number[];
  crop: string;
  total_value: number;
}

export interface ParticipantView {
  id: string;
  name: string;
  role: string;
  region: string;
  registered_on: string;
  trust: number;
  sold: number;
  bought: number;
  flagged: number;
  rejected: number;
  value: number;
  account_age_days: number;
  dims: Record<string, number>;
}

export interface NetworkData {
  nodes: { id: string; name: string; role: string; region: string; trust: number; in_cycle: boolean }[];
  edges: {
    source: string;
    target: string;
    count: number;
    value: number;
    max_risk: number;
    circular: boolean;
    flagged: number;
  }[];
  cycles: string[][];
}

export type TxInput = Omit<
  TxView,
  | "seller_name"
  | "buyer_name"
  | "seller_role"
  | "buyer_role"
  | "region"
  | "sim_label"
  | "sim_label_display"
  | "risk"
  | "p_fraud"
  | "rule_score"
  | "anomaly_score"
  | "pred_type"
  | "pred_label"
  | "decision"
  | "rule_hits"
  | "model_version"
  | "ledger_status"
  | "block_index"
  | "tx_hash"
  | "review"
  | "total_value"
  | "id"
  | "timestamp"
  | "signature"
  | "signature_valid"
  | "seller_public_key"
> & { batch?: Record<string, unknown> | null; forge_signature?: boolean };

export interface FeedbackSummary {
  reviews: number;
  approved: number;
  rejected: number;
  usable_labels: number;
  label_counts: Record<string, number>;
}

export interface Headline {
  pr_auc: number;
  roc_auc: number;
  precision: number;
  recall: number;
  f1: number;
  shifted_f1: number;
}

export interface RetrainResult {
  previous_version: string;
  model_version: string;
  feedback: { rows: number; approved: number; rejected: number; weight: number };
  before: Headline;
  after: Headline;
  note: string;
}

export interface HistoryEntry extends Headline {
  model_version: string;
  trained_at: string;
  feedback_rows: number;
}
