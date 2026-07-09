"""Sanity checks for rule-based categorization (normalize_description, HistoryIndex, exemptions)."""
from collections import Counter
from app.services.rule_categorizer import normalize_description, is_exempt, HistoryIndex


def test_normalize_groups_same_merchant_across_noisy_descriptions():
    a = normalize_description("Withdrawal Debit Card/CHEWY.COM 800-672-4399 FL Date 05/02/26 1 6123456789 9 5411 Card 0329Merchant Category Code: 5411/Previous Balance 100")
    b = normalize_description("CHEWY.COM #4821 FL")
    assert a == b == "chewy com fl"


def test_history_index_auto_matches_consistent_history():
    counts = {"chewy com fl": Counter({59: 5})}
    index = HistoryIndex(counts)
    match = index.match("CHEWY.COM #4821 FL")
    assert match == (59, 1.0)


def test_history_index_abstains_on_inconsistent_history():
    # mirrors a real "catch-all payment processor" account: no reliable majority
    counts = {"pwp privacy ny": Counter({61: 3, 65: 1, 67: 1, 41: 1, 63: 1})}
    index = HistoryIndex(counts)
    assert index.match("PWP*Privacy 2026-05-14 NY") is None


def test_history_index_abstains_below_min_samples():
    counts = {"new merchant": Counter({1: 2})}
    index = HistoryIndex(counts)
    assert index.match("New Merchant") is None


def test_is_exempt_matches_case_insensitive_substring():
    assert is_exempt("Withdrawal Debit Card/PWP*Privacy 2026-05-14 NY", ["pwp*privacy"])
    assert not is_exempt("CHEWY.COM #4821 FL", ["pwp*privacy"])


def test_is_exempt_ignores_blank_entries():
    assert not is_exempt("CHEWY.COM #4821 FL", ["", "   "])
