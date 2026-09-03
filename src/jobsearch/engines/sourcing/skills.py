"""Skill extraction from a job's title + description.

Ingested postings often arrive with sparse or generic ``requirements`` (e.g.
"Collaboration", "Communication"). This scans the free text against a curated
lexicon of concrete skills/tools/technologies and returns the ones present, so
downstream features (matching, résumé keyword-gap review, interview questions)
have real signal to work with. Deterministic, offline, no LLM.
"""

from __future__ import annotations

import re

# Canonical lexicon. Multi-word phrases are matched as substrings; single tokens
# on word boundaries. Keep these lowercase; display form comes from _DISPLAY.
_SKILLS = [
    # languages
    "python", "java", "javascript", "typescript", "golang", "go", "rust", "c++",
    "c#", "ruby", "php", "scala", "kotlin", "swift", "sql", "bash",
    # web / frameworks
    "react", "angular", "vue", "node.js", "node", "django", "flask", "fastapi",
    "spring", "rails", ".net", "express", "next.js", "graphql", "rest api", "rest",
    "html", "css",
    # data / ml
    "machine learning", "deep learning", "nlp", "tensorflow", "pytorch", "pandas",
    "numpy", "spark", "hadoop", "kafka", "airflow", "etl", "data pipeline",
    "data warehouse", "tableau", "power bi", "looker", "dbt", "bigquery", "redshift",
    # cloud / devops
    "aws", "azure", "gcp", "google cloud", "kubernetes", "docker", "terraform",
    "ansible", "jenkins", "ci/cd", "linux", "git", "microservices", "serverless",
    # databases
    "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "dynamodb", "snowflake",
    # pm / process
    "agile", "scrum", "kanban", "jira", "project management", "product management",
    "stakeholder management", "roadmap", "budget management",
    # security / IT service
    "cybersecurity", "networking", "itil", "service delivery", "incident management",
    "active directory", "vmware", "office 365", "sccm", "help desk", "sla",
]
# Uppercase/branded display overrides; everything else is title-cased.
_DISPLAY = {
    "sql": "SQL", "nlp": "NLP", "aws": "AWS", "gcp": "GCP", "ci/cd": "CI/CD",
    "html": "HTML", "css": "CSS", "php": "PHP", "itil": "ITIL", "sla": "SLA",
    "rest": "REST", "rest api": "REST API", "etl": "ETL", "c++": "C++", "c#": "C#",
    ".net": ".NET", "node.js": "Node.js", "next.js": "Next.js", "power bi": "Power BI",
    "dbt": "dbt", "sccm": "SCCM", "vmware": "VMware", "golang": "Go",
    "office 365": "Office 365", "bigquery": "BigQuery", "postgresql": "PostgreSQL",
    "mongodb": "MongoDB", "mysql": "MySQL", "dynamodb": "DynamoDB",
    "google cloud": "Google Cloud", "power": "Power BI",
}
# Words we never want surfaced as a "skill" even if they appear.
_GENERIC = {"collaboration", "communication", "teamwork"}


def _display(skill: str) -> str:
    return _DISPLAY.get(skill, skill.title())


def extract_skills(text: str, *, limit: int = 15) -> list[str]:
    """Concrete skills present in ``text``, in lexicon order, de-duplicated."""
    low = f" {(text or '').lower()} "
    found: list[str] = []
    seen: set[str] = set()
    for sk in _SKILLS:
        disp = _display(sk)
        if disp.lower() in seen:
            continue
        if " " in sk or any(c in sk for c in "+#./"):
            hit = sk in low  # phrases / punctuated tokens: substring
        else:
            hit = re.search(rf"(?<![a-z0-9]){re.escape(sk)}(?![a-z0-9])", low) is not None
        if hit:
            found.append(disp)
            seen.add(disp.lower())
    return found[:limit]


def enrich_requirements(existing: list[str], text: str, *, limit: int = 20) -> list[str]:
    """Merge provided requirements with skills mined from ``text`` — keeps the
    source's requirements (minus purely generic ones when we have better), adds
    concrete extracted skills not already covered."""
    kept = [r for r in (existing or []) if r and r.strip()]
    have = {r.lower() for r in kept}
    extracted = extract_skills(text, limit=limit)
    # Drop generic filler requirements only if we found concrete skills to replace them.
    if extracted:
        kept = [r for r in kept if r.lower() not in _GENERIC]
        have = {r.lower() for r in kept}
    for sk in extracted:
        if sk.lower() not in have:
            kept.append(sk)
            have.add(sk.lower())
    return kept[:limit]
