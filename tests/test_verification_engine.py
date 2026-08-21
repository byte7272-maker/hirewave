from jobsearch.engines.verification import VerificationContext, VerificationEngine
from jobsearch.models.job import VerificationFlag


def test_legit_job_scores_high(matching_job):
    engine = VerificationEngine()
    result = engine.verify(matching_job)
    assert result.authenticity_score >= 70
    assert result.display_action == "show"
    assert matching_job.is_verified is True


def test_scam_job_flagged_and_hidden(scam_job):
    engine = VerificationEngine()
    result = engine.verify(scam_job)
    assert result.authenticity_score <= 39
    assert result.display_action == "hidden"
    assert VerificationFlag.URGENCY_LANGUAGE in result.flags
    assert VerificationFlag.EXCESSIVE_PROMISES in result.flags
    assert VerificationFlag.CONTACT_OFF_PLATFORM in result.flags


def test_known_scam_domain_zeroes_score(matching_job):
    engine = VerificationEngine()
    ctx = VerificationContext(scam_domains=frozenset({"globex.com"}))
    result = engine.verify(matching_job, context=ctx)
    assert result.authenticity_score == 0
    assert VerificationFlag.KNOWN_SCAM_SOURCE in result.flags


def test_high_velocity_flag(matching_job):
    engine = VerificationEngine()
    ctx = VerificationContext(source_posting_count=200, velocity_threshold=50)
    result = engine.verify(matching_job, context=ctx)
    assert VerificationFlag.HIGH_POSTING_VELOCITY in result.flags


def test_young_domain_flag(matching_job):
    engine = VerificationEngine()
    ctx = VerificationContext(domain_age_days=10)
    result = engine.verify(matching_job, context=ctx)
    assert VerificationFlag.YOUNG_DOMAIN in result.flags
