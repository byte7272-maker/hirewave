"""Backend reasoning for the assistant's narration.

Given an action (or a multi-step plan) the assistant is about to suggest, this
produces a **plain-language walk-through** — what it found, why it's suggesting the
action, and how that benefits the user's goal — and it **anticipates the permissions**
the action/plan needs and **bundles** them into a single ask, so the user grants once
and feels the benefit of automation instead of being nagged at every step.

Deterministic (no LLM needed, so it's testable offline); an LLM can enrich the phrasing
later without changing the contract. Permission scopes are the real
``AUTOMATION_SCOPES`` — reasoning never invents a capability the app can't gate.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from jobsearch.models.automation_assist import AUTOMATION_SCOPES

#: One row per thing the assistant can suggest/do. ``what`` describes what it found or
#: is about to do, ``why`` is the plain reason, ``benefit`` ties it to the user's goal,
#: and ``scopes`` are the consent scopes the action needs (anticipated up front so a
#: plan can bulk them). ``{subject}`` / ``{goal}`` are filled from the request.
ACTIONS: dict[str, dict[str, Any]] = {
    "research_company": {
        "label": "Research the company",
        "what": "I looked up {subject} on the open web.",
        "why": "Knowing their size, what they value, and recent news lets us tailor your "
               "application and answer “why us” with specifics.",
        "benefit": "You apply already knowing what they care about{goal_tail}.",
        "scopes": ["web_research"],
    },
    "update_bullet": {
        "label": "Update a bullet from the web",
        "what": "I can pull current figures and dates for “{subject}”.",
        "why": "Fresh, specific numbers make a bullet land harder than stale or vague ones.",
        "benefit": "Your résumé reads as current and quantified{goal_tail}.",
        "scopes": ["web_research"],
    },
    "prepare_drafts": {
        "label": "Prepare tailored drafts",
        "what": "I can draft a tailored résumé and cover letter for {subject}.",
        "why": "A version aimed at this role beats a generic one on both ATS keywords and fit.",
        "benefit": "You start from a strong, role-specific draft instead of a blank page{goal_tail}.",
        "scopes": ["draft_prep"],
    },
    "autofill": {
        "label": "Fill the application",
        "what": "I can fill {subject}'s application form from your profile.",
        "why": "The same details get retyped on every site; filling them saves the tedious part.",
        "benefit": "You skip the data-entry and go straight to reviewing{goal_tail}.",
        "scopes": ["form_autofill"],
    },
    "submit": {
        "label": "Submit after your review",
        "what": "Once you've approved it, I can submit the application to {subject}.",
        "why": "Submitting right after review keeps momentum so strong matches don't sit idle.",
        "benefit": "Applications go out on time without you babysitting each click{goal_tail}.",
        "scopes": ["submit_after_review"],
    },
    # Multi-step PLANS — the reason these exist is to bulk the consent. "Apply to this
    # job" needs three scopes; asking once (not three times) is the whole point.
    "apply_job": {
        "label": "Apply to this job end-to-end",
        "what": "I can take {subject} from draft to submitted: tailor the documents, fill "
                "the form, and submit after you approve.",
        "why": "These steps always run together, so lining them up once removes the stop-start.",
        "benefit": "One approval and the application is handled, with you reviewing before it "
                   "sends{goal_tail}.",
        "scopes": ["draft_prep", "form_autofill", "submit_after_review"],
    },
    "research_and_apply": {
        "label": "Research, tailor, and apply",
        "what": "I can research {subject}, tailor your documents to what they value, fill the "
                "form, and submit after your review.",
        "why": "Research sharpens the tailoring, and the apply steps follow from it — one flow.",
        "benefit": "The whole application, from homework to submitted, done once you say go{goal_tail}.",
        "scopes": ["web_research", "draft_prep", "form_autofill", "submit_after_review"],
    },
}

#: Intents (from the NLU) that map onto a reasoning action, so the same explanation can
#: be requested by intent or by action key.
_INTENT_TO_ACTION = {
    "research_company": "research_company",
    "web_search": "research_company",
    "apply_job": "apply_job",
    "auto_apply": "apply_job",
    "prepare_drafts": "prepare_drafts",
    "autofill": "autofill",
}


def resolve_action(action_or_intent: str) -> Optional[str]:
    """Map an action key or an NLU intent to a reasoning action; None if unknown."""
    key = (action_or_intent or "").strip()
    if key in ACTIONS:
        return key
    return _INTENT_TO_ACTION.get(key)


def _fill(text: str, *, subject: str, goal: str) -> str:
    subject = subject.strip() or "this role"
    goal_tail = f", so you move toward {goal.strip()}" if goal.strip() else ""
    return text.replace("{subject}", subject).replace("{goal_tail}", goal_tail).replace("{goal}", goal.strip())


def scopes_for(actions: Iterable[str]) -> list[str]:
    """The union of consent scopes a set of actions/intents needs, in a stable order."""
    seen: list[str] = []
    for a in actions:
        key = resolve_action(a)
        if not key:
            continue
        for s in ACTIONS[key]["scopes"]:
            if s not in seen:
                seen.append(s)
    return seen


def bundle_permissions(scopes: Iterable[str], granted: Iterable[str] = ()) -> dict[str, Any]:
    """Anticipate + BULK the permissions a plan needs into a single ask.

    Returns the scopes needed, which are already granted, which still need granting
    (``to_request``), and one combined ``prompt`` + ``ask`` line so the user approves
    once. ``single_grant`` is the scope list the client sends to ``PUT /assistant/consent``
    (existing grants + the new ones) to turn them all on together."""
    granted_set = set(granted)
    needed = [s for s in scopes if s in AUTOMATION_SCOPES]
    to_request = [s for s in needed if s not in granted_set]
    descriptions = [AUTOMATION_SCOPES[s] for s in to_request]
    if not to_request:
        prompt, ask = "", ""
    else:
        prompt = "To do this I'll need your OK to: " + "; ".join(descriptions) + "."
        n = len(to_request)
        ask = (
            "Want me to turn that on? You approve once and I'll handle the rest."
            if n == 1
            else f"Want me to turn those {n} on together? One approval and I'll handle the rest."
        )
    return {
        "needed": needed,
        "already_granted": [s for s in needed if s in granted_set],
        "to_request": to_request,
        "prompt": prompt,
        "ask": ask,
        # what to POST to PUT /assistant/consent to grant them all at once (keeps existing)
        "single_grant": sorted(granted_set | set(to_request)),
    }


def explain(action_or_intent: str, *, subject: str = "", goal: str = "",
            granted: Iterable[str] = ()) -> Optional[dict[str, Any]]:
    """A plain-language walk-through of one action + its bulked permissions. Returns
    None when the action is unknown (the caller can fall back to a generic reply)."""
    key = resolve_action(action_or_intent)
    if key is None:
        return None
    spec = ACTIONS[key]
    what = _fill(spec["what"], subject=subject, goal=goal)
    why = _fill(spec["why"], subject=subject, goal=goal)
    benefit = _fill(spec["benefit"], subject=subject, goal=goal)
    perms = bundle_permissions(spec["scopes"], granted)
    # the spoken walk-through: what I found/do -> why -> how it helps you -> (one) ask
    narration = " ".join(p for p in (what, why, benefit, perms["prompt"], perms["ask"]) if p)
    return {
        "action": key,
        "label": spec["label"],
        "what": what,
        "why": why,
        "benefit": benefit,
        "narration": narration,
        "permissions": perms,
    }


def explain_plan(actions: list[str], *, subject: str = "", goal: str = "",
                 granted: Iterable[str] = ()) -> dict[str, Any]:
    """Walk through a multi-step plan as ONE narration with ONE bulked permission ask —
    so a plan that needs several scopes is approved in a single interaction."""
    steps: list[dict[str, Any]] = []
    for a in actions:
        one = explain(a, subject=subject, goal=goal, granted=granted)
        if one:
            steps.append({"action": one["action"], "label": one["label"],
                          "what": one["what"], "why": one["why"], "benefit": one["benefit"]})
    all_scopes = scopes_for(actions)
    perms = bundle_permissions(all_scopes, granted)
    what = " ".join(s["what"] for s in steps)
    why = " ".join(dict.fromkeys(s["why"] for s in steps))  # de-duped reasons
    benefit = steps[-1]["benefit"] if steps else ""
    narration = " ".join(p for p in (what, benefit, perms["prompt"], perms["ask"]) if p)
    return {
        "steps": steps,
        "what": what,
        "why": why,
        "benefit": benefit,
        "narration": narration,
        "permissions": perms,
    }
