from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.matching.feedback import FeedbackSignal


def test_matching_job_scores_higher_than_unrelated(profile, matching_job, unrelated_job):
    engine = MatchingEngine()
    ranked = engine.rank(profile, [unrelated_job, matching_job])
    assert ranked[0].job.id == matching_job.id
    assert ranked[0].score > ranked[1].score


def test_score_breakdown_and_skills(profile, matching_job):
    engine = MatchingEngine()
    result = engine.score(profile, matching_job)
    assert 0 <= result.score <= 100
    assert "Python" in result.matching_skills
    assert result.breakdown.semantic > 0


def test_rank_stamps_match_score(profile, matching_job):
    engine = MatchingEngine()
    ranked = engine.rank(profile, [matching_job])
    assert matching_job.match_score == ranked[0].score


def test_min_score_filter(profile, unrelated_job):
    engine = MatchingEngine()
    ranked = engine.rank(profile, [unrelated_job], min_score=99.0)
    assert ranked == []


def test_feedback_adjusts_weights(profile, matching_job):
    engine = MatchingEngine()
    result = engine.score(profile, matching_job)
    before = engine.feedback.weights_for(profile.user_id)
    engine.record_feedback(profile, result, FeedbackSignal.APPLY)
    after = engine.feedback.weights_for(profile.user_id)
    # Weights changed and remain normalized.
    assert (before.semantic, before.skills) != (after.semantic, after.skills)
    total = (after.semantic + after.skills + after.location + after.salary
             + after.seniority + after.recency)
    assert abs(total - 1.0) < 1e-6


def test_companyless_posting_is_demoted_and_cannot_top(profile, matching_job):
    # A posting with no company is a strong data-quality red flag (a mis-parsed alert
    # row) — it must score LOWER than the same posting with a company, so it can't
    # surface as the top match, but it's still ranked (not hidden).
    engine = MatchingEngine()
    with_co = engine.score(profile, matching_job)
    nameless = matching_job.model_copy(update={"id": "job_nocompany", "company": ""})
    without_co = engine.score(profile, nameless)
    assert without_co.score < with_co.score
    # and in a ranked list it sorts below its companyful twin
    ranked = engine.rank(profile, [nameless, matching_job])
    assert ranked[0].job.id == matching_job.id
    # still present (demoted, not filtered)
    assert any(r.job.id == "job_nocompany" for r in ranked)


def test_fit_calibration_makes_strong_read_strong():
    from jobsearch.engines.matching.scoring import calibrate_fit, fit_verdict, STRONG_FIT
    # the compressed working band [28,85] stretches to a full 0-100
    assert calibrate_fit(28) == 0.0
    assert calibrate_fit(85) == 100.0
    # a high raw blend now DISPLAYS as a strong fit (>=80) — the user's ask
    assert calibrate_fit(74) >= STRONG_FIT
    # a middling raw blend is explicitly NOT strong (fixes "strong starting at 50-60")
    assert calibrate_fit(55) < STRONG_FIT
    # monotonic → ranking order is preserved
    assert calibrate_fit(40) < calibrate_fit(60) < calibrate_fit(80)


def test_fit_verdict_thresholds_are_consistent_and_upbeat():
    from jobsearch.engines.matching.scoring import fit_verdict
    assert fit_verdict(80)[0] == "strong" and fit_verdict(79)[0] == "solid"
    assert fit_verdict(60)[0] == "solid" and fit_verdict(59)[0] == "moderate"
    assert fit_verdict(40)[0] == "moderate" and fit_verdict(39)[0] == "stretch"
    # only the four allowed, never-harsh words
    assert {fit_verdict(s)[0] for s in (10, 45, 65, 95)} <= {"strong", "solid", "moderate", "stretch"}


def test_dashboard_and_job_verdict_share_one_strong_threshold():
    # the dashboard's strong-match cutoff and the per-job "strong" verdict agree.
    from jobsearch.api.routers.dashboard import _STRONG_MATCH
    from jobsearch.engines.matching.scoring import fit_verdict, STRONG_FIT
    assert _STRONG_MATCH == STRONG_FIT
    assert fit_verdict(_STRONG_MATCH)[0] == "strong"
    assert fit_verdict(_STRONG_MATCH - 0.1)[0] != "strong"
