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

// -----------------------------------------------------------------------------
// Batch Lifecycle & Portal Types
// -----------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "ADMIN" | "AUDITOR" | "FARMER" | "COOP" | "PROCESSOR" | "DISTRIBUTOR" | "RETAILER";
  participant_id: string | null;
}

export interface BatchItem {
  id: string;
  crop: string;
  variety: string;
  origin_farmer_id: string;
  farm_id: string;
  farm_location: string;
  harvest_date: string;
  organic_claimed: boolean;
  is_organic?: boolean;
  organic_cert_valid: boolean;
  cert_reference: string;
  region: string;
  initial_quantity_kg: number;
  current_quantity_kg: number;
  current_quantity?: number;
  unit: string;
  quality_grade: string;
  moisture_pct?: number | null;
  current_stage: string;
  current_holder_id: string;
  parent_batch_ids: string[];
  status: "ACTIVE" | "IN_TRANSIT" | "PROCESSED" | "COMPLETED" | "QUARANTINED" | "DISPUTED";
  created_at: string;
  updated_at: string;
  origin_farmer_name?: string;
  current_holder_name?: string;
}

export type BatchResponse = BatchItem;
export type TransferResponse = TransferItem & {
  dispatched_quantity?: number;
  received_quantity?: number | null;
  discrepancy_pct?: number;
  vehicle_no?: string;
};
export type BatchDetail = FullLifecycleData;


export interface LifecycleEventItem {
  id: string;
  batch_id: string;
  event_type: string;
  stage: string;
  actor_id: string;
  actor_name?: string;
  recipient_id?: string | null;
  recipient_name?: string | null;
  tx_id?: string | null;
  quantity_before_kg?: number | null;
  quantity_after_kg?: number | null;
  quantity_diff_kg?: number | null;
  quality_grade?: string | null;
  temperature_c?: number | null;
  risk_score?: number | null;
  status: string;
  signature?: string;
  signature_valid: boolean;
  details: Record<string, unknown>;
  block_index?: number | null;
  timestamp: string;
}

export interface TransferItem {
  id: string;
  batch_id: string;
  sender_id: string;
  sender_name?: string;
  receiver_id: string;
  receiver_name?: string;
  stage: string;
  dispatched_quantity_kg: number;
  received_quantity_kg?: number | null;
  discrepancy_kg: number;
  tolerance_kg: number;
  discrepancy_flagged: boolean;
  status: "INITIATED" | "IN_TRANSIT" | "ACCEPTED" | "DISPUTED";
  sender_signature: string;
  receiver_signature: string;
  sender_tx_id?: string | null;
  shipment_id: string;
  vehicle_number: string;
  transit_hours: number;
  transit_km: number;
  temp_avg_c?: number | null;
  temp_max_c?: number | null;
  cold_chain_breached: boolean;
  dispute_reason: string;
  notes: string;
  dispatched_at: string;
  accepted_at?: string | null;
}

export interface ProcessingOperationItem {
  id: string;
  processor_id: string;
  operation_name: string;
  input_batch_id: string;
  input_quantity_kg: number;
  output_batch_ids: string[];
  output_quantity_kg: number;
  waste_quantity_kg: number;
  byproducts_quantity_kg: number;
  yield_percentage: number;
  quality_certificate_ref: string;
  notes: string;
  started_at: string;
  completed_at: string;
}

export interface EnvironmentalReadingItem {
  id: string;
  batch_id: string;
  shipment_id: string;
  carrier_id: string;
  temp_c: number;
  temp_limit_c: number;
  humidity_pct?: number | null;
  breach_detected: boolean;
  sensor_id: string;
  recorded_at: string;
}

export interface FullLifecycleData {
  batch: BatchItem;
  events: LifecycleEventItem[];
  transfers: TransferItem[];
  processing_operations: ProcessingOperationItem[];
  lineage: {
    parents: string[];
    children: string[];
    links: {
      parent_id: string;
      child_id: string;
      type: string;
      input_kg: number;
      output_kg: number;
    }[];
  };
  telemetry: EnvironmentalReadingItem[];
  transactions: (TxView & { risk: number; decision: string; pred_type: string })[];
}

export interface AdminMetrics {
  total_batches: number;
  active_batches: number;
  in_transit_batches: number;
  completed_lifecycles: number;
  disputed_transfers: number;
  total_transactions: number;
  flagged_transactions: number;
  quarantined_transactions: number;
  cold_chain_breaches: number;
  total_blocks: number;
  chain_valid: boolean;
  total_participants: number;
}

export interface StageOverviewItem {
  stage: string;
  batch_count: number;
  total_quantity_kg: number;
  in_transit_count: number;
  disputed_count: number;
  quarantined_count: number;
  batches: {
    id: string;
    crop: string;
    variety: string;
    quantity_kg: number;
    status: string;
    region: string;
  }[];
}

export interface StageOverviewData {
  stages: StageOverviewItem[];
  total_active_produce_kg: number;
}

export interface FraudCategoryIncident {
  category: string;
  label: string;
  total_detected: number;
  description: string;
  severity_level: "CRITICAL" | "HIGH";
}

export interface FraudCenterData {
  categories: FraudCategoryIncident[];
  recent_high_risk_cases: {
    tx_id: string;
    batch_id: string;
    crop: string;
    seller_id: string;
    buyer_id: string;
    quantity_kg: number;
    unit_price: number;
    risk: number;
    pred_type: string;
    pred_label: string;
    decision: string;
    rule_hits: RuleHit[];
    timestamp: string;
  }[];
  total_quarantined: number;
  total_flagged: number;
}

export interface ParticipantDashboardData {
  participant: ParticipantView | null;
  role: string;
  active_batches_count: number;
  pending_inward_transfers: number;
  total_dispatches: number;
  disputed_transfers_count: number;
  completed_transactions: number;
  recent_incoming: TransferItem[];
  recent_outgoing: TransferItem[];
}

export interface ChainNotification {
  id: string;
  recipient_id: string;
  role: string | null;
  batch_id: string | null;
  tx_id: string | null;
  title: string;
  message: string;
  category: "LIFECYCLE" | "TRANSFER" | "DISPUTE" | "COLD_CHAIN" | "QUARANTINE" | "AUDIT" | "LEDGER";
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  read: boolean;
  created_at: string | null;
}

export interface NotificationListResponse {
  total: number;
  unread_count: number;
  notifications: ChainNotification[];
}


