"""The live-demo storyline (app/sim/scenarios.py) and every ledger attack, end to end through the API."""

import pytest
from sqlmodel import col, select

from app.chain import ledger
from app.models import LedgerEntry
from app.sim.scenarios import build_scenarios
from app.sim.state import seed_demo


def reseed(session) -> None:
    seed_demo(session, n=80)


def test_demo_scenarios_are_caught_by_their_named_rule(client):
    for s in build_scenarios("TEST"):
        r = client.post("/api/transactions", json=s.body)
        assert r.status_code == 200, (s.key, r.text)
        out = r.json()
        rules = {h["id"] for h in out["rule_hits"]}
        if s.expect_fraud:
            assert out["decision"] == "QUARANTINED", (s.key, out["risk"])
            assert s.expect_rule in rules, (s.key, rules)
        else:
            assert out["decision"] == "CLEAR", (s.key, out["risk"], rules)
    assert client.get("/api/chain/verify").json()["valid"] is True


@pytest.mark.parametrize("mode", ["quantity", "verdict", "header", "rewrite"])
def test_every_tamper_mode_is_detected_and_located(client, session, mode):
    assert client.get("/api/chain/verify").json()["valid"] is True
    t = client.post("/api/dev/tamper", json={"mode": mode})
    assert t.status_code == 200, t.text
    v = client.get("/api/chain/verify").json()
    assert v["valid"] is False
    assert v["first_broken_index"] == t.json()["block_index"]
    reseed(session)
    assert client.get("/api/chain/verify").json()["valid"] is True


@pytest.mark.xfail(
    strict=True,
    reason="Known limitation: seller signatures cover transaction data, not the ledger status, so a "
    "verdict flip followed by a full re-mine is not detected. Fix = a validator signature per block.",
)
def test_flipped_verdict_then_remined_is_detected(client, session):
    entry = session.exec(
        select(LedgerEntry).where(LedgerEntry.status == "REJECTED", col(LedgerEntry.block_index).is_not(None))
    ).first()
    entry.status = "COMMITTED"
    session.commit()
    ledger.remine_from(session, entry.block_index)
    try:
        assert ledger.verify_chain(session)["valid"] is False
    finally:
        reseed(session)
