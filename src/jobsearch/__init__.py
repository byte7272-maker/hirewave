"""Job-Search Automation Platform — core engine library.

Five independently usable engines sit under :mod:`jobsearch.engines`:

* ``integration``   — user-authorized OAuth 2.0 connections + encrypted token store
* ``generation``    — ATS-optimized resume & cover-letter generation (human-in-the-loop)
* ``matching``      — semantic + weighted job-to-profile ranking with feedback learning
* ``verification``  — authenticity / fraud scoring for job postings
* ``automation``    — platform adapters for reviewed-and-approved application submission

All engines are pure Python and depend only on the shared :mod:`jobsearch.models`
domain objects and pluggable ports (LLM, embeddings, HTTP, repositories), so they
can later be wired behind any web/API layer without modification.
"""

from jobsearch.config import Settings, get_settings

__all__ = ["Settings", "get_settings", "__version__"]

__version__ = "0.1.0"
