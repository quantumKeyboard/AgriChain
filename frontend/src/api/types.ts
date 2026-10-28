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
  /** false = never recorded on Ethereum (its seller signature would be rejected by the contract). */
  on_chain: boolean;
  block_number: number | null;
  eth_tx_hash: string | null;
  verdict_block: number | null;
  verdict_tx_hash: string | null;
  data_hash: string;
  review: { action: string; note: string; reviewed_at: string } | null;
  signature: string;
  signature_valid: boolean;
  seller_address: string | null;
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
  on_chain?: OnChainReceipt | null;
  signature_valid?: boolean;
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
  chain_height: number | null;
  on_chain_records: number;
  off_chain_only: number;
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

export interface OnChainReceipt {
  tx_hash: string;
  block: number;
  gas_used?: number;
}

export interface EthTx {
  hash: string;
  from: string;
  from_label: string;
  to: string | null;
  function: string;
  status: "success" | "reverted";
  gas_used: number;
  tx_ids: string[];
  nonce: number;
  events?: { event: string; args: Record<string, string | number | boolean> }[];
  input_size?: number;
}

export interface EthBlock {
  number: number;
  hash: string;
  parent_hash: string;
  timestamp: number;
  gas_used: number;
  tx_count: number;
  transactions: EthTx[];
}

export interface EthBlockDetail extends Omit<EthBlock, "tx_count"> {
  state_root: string;
  transactions_root: string;
  receipts_root: string;
  gas_limit: number;
  miner: string;
  records: TxView[];
}

export interface ChainInfo {
  network: string;
  rpc_url: string;
  chain_id: number;
  client: string;
  block_number: number;
  contract_address: string | null;
  deploy_tx: string | null;
  deploy_block: number;
  record_count: number;
  accounts: { role: string; address: string; balance_eth: number }[];
  solidity: string;
}

export type VerifyProblem =
  "DATA_MISMATCH" | "BAD_SIGNATURE" | "STATUS_MISMATCH" | "MISSING_OFF_CHAIN" | "NOT_ON_CHAIN";

export interface VerifyResult {
  valid: boolean;
  checked: number;
  off_chain_only: number;
  contract_address: string;
  block_number: number;
  issues: { tx_id: string; problem: VerifyProblem; detail: string; block: number | null }[];
}

export type AttackKind =
  | "db_quantity"
  | "db_verdict"
  | "chain_overwrite"
  | "chain_unauthorized"
  | "chain_reverdict"
  | "chain_forged";

export interface AttackResult {
  kind: AttackKind;
  layer: "database" | "blockchain";
  tx_id: string;
  result: "edited" | "reverted";
  change: string;
  explain: string;
  revert?: { error: string; args: Record<string, string>; tx_hash: string; block: number };
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
  on_chain: OnChainReceipt | null;
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
  | "on_chain"
  | "block_number"
  | "eth_tx_hash"
  | "verdict_block"
  | "verdict_tx_hash"
  | "data_hash"
  | "review"
  | "total_value"
  | "id"
  | "timestamp"
  | "signature"
  | "signature_valid"
  | "seller_address"
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
