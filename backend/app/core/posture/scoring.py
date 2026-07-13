"""Turns a list of open SecurityFinding rows into a single 0-100 posture
score plus a per-category breakdown, so the dashboard can show both the
headline number and *why* it's that number.

Deliberately simple and explainable over "clever" -- you should be able
to justify every number in this file in a project defense.
"""

SEVERITY_WEIGHT = {
    "low": 5,
    "medium": 15,
    "high": 30,
    "critical": 50,
}

# Cap how much any single category can drag the score down, so e.g. ten
# "low" credential-age findings across ten integrations don't swamp one
# genuinely critical secret leak elsewhere.
MAX_DEDUCTION_PER_CATEGORY = 40


def compute_score(open_findings: list) -> tuple[int, dict]:
    """`open_findings` is a list of SecurityFinding rows (or any object
    with `.category` and `.severity` attributes).

    Returns (score, breakdown) where breakdown is
    {category: -deduction_applied} for display in the UI.
    """
    raw_deduction_by_category: dict[str, int] = {}

    for f in open_findings:
        weight = SEVERITY_WEIGHT.get(f.severity, SEVERITY_WEIGHT["low"])
        raw_deduction_by_category[f.category] = raw_deduction_by_category.get(f.category, 0) + weight

    breakdown = {}
    total_deduction = 0
    for category, raw in raw_deduction_by_category.items():
        clamped = min(raw, MAX_DEDUCTION_PER_CATEGORY)
        breakdown[category] = -clamped
        total_deduction += clamped

    score = max(0, 100 - total_deduction)
    return score, breakdown
