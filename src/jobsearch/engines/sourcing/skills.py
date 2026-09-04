"""Skill extraction from a job's title + description.

Ingested postings often arrive with sparse or generic ``requirements`` (e.g.
"Collaboration", "Communication"). This scans the free text against a curated
lexicon of concrete skills/tools/technologies and returns the ones present, so
downstream features (matching, résumé keyword-gap review, interview questions)
have real signal to work with. Deterministic, offline, no LLM.
"""

from __future__ import annotations

import re
from typing import Optional

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


_SENIORITY_HINTS = [
    ("director", ["director", "head of", "vp", "vice president"]),
    ("principal", ["principal"]),
    ("staff", ["staff"]),
    ("lead", ["lead", "team lead"]),
    ("senior", ["senior", "sr.", "sr "]),
    ("mid", ["mid-level", "mid level", "intermediate"]),
    ("junior", ["junior", "jr.", "entry level", "entry-level", "graduate"]),
    ("intern", ["intern", "internship"]),
]
_EMPLOYMENT = [
    ("internship", ["internship", "intern "]),
    ("part-time", ["part-time", "part time"]),
    ("contract", ["contract", "contractor", "c2c", "1099"]),
    ("temporary", ["temporary", "temp ", "seasonal"]),
    ("full-time", ["full-time", "full time", "permanent"]),
]
_BENEFITS = {
    "401(k)": ["401k", "401(k)", "retirement"],
    "Medical": ["medical", "health insurance", "healthcare"],
    "Dental": ["dental"],
    "Vision": ["vision"],
    "PTO": ["pto", "paid time off", "paid vacation", "unlimited vacation"],
    "Remote": ["remote", "work from home", "wfh"],
    "Equity": ["equity", "stock options", "rsu", "stock grant"],
    "Bonus": ["bonus", "commission"],
    "Parental leave": ["parental leave", "maternity", "paternity"],
    "Tuition": ["tuition", "learning stipend", "professional development"],
}
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years|yrs)\b", re.IGNORECASE)


# Broad job categories the user can filter by. Order = specificity (a "data
# engineer" should land in Data, not Engineering), then display order.
_CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("Data & Analytics", ["data scientist", "data analyst", "data engineer", "analytics",
                          "machine learning", "ml engineer", "data science", "business intelligence", "bi developer"]),
    ("Product", ["product manager", "product owner", "product lead", "technical product", "program manager"]),
    ("Design", ["designer", "ux", "ui/ux", "user experience", "user interface", "graphic", "creative director"]),
    ("Engineering", ["software engineer", "developer", "programmer", "backend", "frontend", "full stack",
                    "full-stack", "devops", "sre", "site reliability", "software architect", "platform engineer", "qa engineer"]),
    ("IT & Systems", ["service delivery", "systems administrator", "sysadmin", "network engineer",
                     "help desk", "service desk", "desktop support", "it support", "it manager", "information technology", "technician"]),
    ("Customer Success & Support", ["customer success", "customer support", "support engineer",
                                   "technical support", "customer service", "account support"]),
    ("Marketing", ["marketing", "seo", "content strategist", "brand manager", "growth", "social media",
                  "communications", "copywriter", "demand generation"]),
    ("Sales", ["sales", "account executive", "account manager", "business development", "sdr", "bdr", "partnerships"]),
    ("Finance & Accounting", ["accountant", "accounting", "controller", "fp&a", "auditor", "treasury",
                             "bookkeeper", "financial analyst", "finance manager"]),
    ("People & HR", ["human resources", "recruiter", "talent acquisition", "people ops", "hris", "compensation"]),
    ("Operations", ["operations", "logistics", "supply chain", "procurement", "office manager", "project coordinator"]),
    ("Legal", ["attorney", "lawyer", "paralegal", "legal counsel", "compliance officer"]),
    ("Healthcare", ["nurse", "physician", "clinical", "healthcare", "therapist", "pharmacist", "medical assistant"]),
]
#: The catalog shown to users (broad categories they can select), plus "Other".
CATEGORIES = [name for name, _ in _CATEGORY_RULES] + ["Other"]


def detect_category(text: str) -> str:
    """Classify a posting into one broad category (from CATEGORIES)."""
    low = (text or "").lower()
    for cat, hints in _CATEGORY_RULES:
        if any(h in low for h in hints):
            return cat
    return "Other"


def detect_seniority(text: str) -> str:
    low = (text or "").lower()
    for level, hints in _SENIORITY_HINTS:
        if any(h in low for h in hints):
            return level
    return ""


def detect_employment_type(text: str) -> str:
    low = f" {(text or '').lower()} "
    for etype, hints in _EMPLOYMENT:
        if any(h in low for h in hints):
            return etype
    return ""


def detect_years_experience(text: str) -> "Optional[int]":
    nums = [int(m) for m in _YEARS_RE.findall(text or "")]
    return min(nums) if nums else None  # the minimum stated requirement


def detect_benefits(text: str, *, limit: int = 8) -> list[str]:
    low = (text or "").lower()
    out = [label for label, hints in _BENEFITS.items() if any(h in low for h in hints)]
    return out[:limit]


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
