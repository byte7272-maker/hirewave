"""The five core engines of the platform.

Each engine is constructed with its dependencies (LLM, embedder, stores,
adapters) and exposes a small, framework-free API that a web layer can call.
"""

from jobsearch.engines.automation import AutomationEngine
from jobsearch.engines.generation import GenerationEngine
from jobsearch.engines.integration import IntegrationEngine
from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.verification import VerificationEngine

__all__ = [
    "AutomationEngine",
    "GenerationEngine",
    "IntegrationEngine",
    "MatchingEngine",
    "VerificationEngine",
]
