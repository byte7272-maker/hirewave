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
