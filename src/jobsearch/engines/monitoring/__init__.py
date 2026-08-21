"""Exposure monitoring — defensive breach/exposure checks for the user's data."""

from jobsearch.engines.monitoring.engine import MonitoringEngine
from jobsearch.engines.monitoring.providers import (
    ExposureProvider,
    HIBPExposureProvider,
    MockExposureProvider,
    MockPwnedPasswordsProvider,
    PwnedPasswordsProvider,
    RawExposure,
    build_exposure_provider,
    build_pwned_provider,
)

__all__ = [
    "ExposureProvider",
    "HIBPExposureProvider",
    "MockExposureProvider",
    "MockPwnedPasswordsProvider",
    "MonitoringEngine",
    "PwnedPasswordsProvider",
    "RawExposure",
    "build_exposure_provider",
    "build_pwned_provider",
]
