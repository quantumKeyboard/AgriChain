"""Generate the synthetic agri supply-chain dataset (train + shifted robustness test set)."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import ARTIFACTS_DIR  # noqa: E402
from app.ml.dataset import simulate_dataset  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--fraud-rate", type=float, default=0.07)
    args = ap.parse_args()

    out = ARTIFACTS_DIR / "data"
    out.mkdir(parents=True, exist_ok=True)
    df = simulate_dataset(args.n, seed=args.seed, fraud_rate=args.fraud_rate)
    df.to_csv(out / "transactions.csv", index=False)
    shifted = simulate_dataset(
        max(args.n // 4, 1000), seed=args.seed + 1000, fraud_rate=args.fraud_rate, shift=1.0
    )
    shifted.to_csv(out / "transactions_shifted.csv", index=False)
    print(f"wrote {len(df)} rows -> {out / 'transactions.csv'}")
    print(f"wrote {len(shifted)} rows -> {out / 'transactions_shifted.csv'}")
    print(df["label"].value_counts().to_string())


if __name__ == "__main__":
    main()
