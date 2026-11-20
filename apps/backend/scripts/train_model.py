"""Train the hybrid fraud model and write artifacts/model.joblib + metrics.json (+ history.json).

The training code lives in app/ml/training.py so the API's learning loop uses exactly the same steps.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ml.training import train  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    train(seed=ap.parse_args().seed, verbose=True)
