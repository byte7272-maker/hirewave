"""A convenience facade wiring the five engines with shared dependencies.

A web/API layer can either use this facade directly or construct engines
individually with its own repositories and providers. Nothing here is required
by the engines — it just saves boilerplate for scripts, tests, and a first API.
"""

from __future__ import annotations

from typing import Callable, Optional

from jobsearch.config import Settings, get_settings
from jobsearch.engines.automation import AutomationEngine
from jobsearch.engines.generation import GenerationEngine
from jobsearch.engines.integration import IntegrationEngine, TokenExchanger
from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.verification import VerificationEngine
from jobsearch.llm import build_embedder, build_llm
from jobsearch.models import Notification
from jobsearch.security.crypto import FieldCipher
from jobsearch.store import TokenStore


class JobSearchPlatform:
    def __init__(
        self,
        *,
        settings: Optional[Settings] = None,
        exchanger: Optional[TokenExchanger] = None,
        notifier: Optional[Callable[[Notification], None]] = None,
    ) -> None:
        self.settings = settings or get_settings()
        cipher = FieldCipher(self.settings.encryption_key or None)

        llm = build_llm(self.settings)
        embedder = build_embedder(self.settings)

        self.integration = IntegrationEngine(
            token_store=TokenStore(cipher),
            exchanger=exchanger,
            settings=self.settings,
        )
        self.generation = GenerationEngine(llm=llm)
        self.matching = MatchingEngine(embedder=embedder)
        self.verification = VerificationEngine()
        self.automation = AutomationEngine(settings=self.settings, notifier=notifier)

    def health(self) -> dict:
        """Quick introspection of the wired providers/modes."""
        return {
            "llm_provider": self.generation.llm.name,
            "embedding_provider": self.matching.embedder.name,
            "automation_mode": self.settings.automation_mode,
            "encryption": "ephemeral" if FieldCipher(
                self.settings.encryption_key or None
            ).is_ephemeral else "configured",
        }
