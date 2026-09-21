"""
Typed decision primitives for the local MLX model — inspired by typesafe.ai's
Choice/Score/Noul pattern (atomic decomposition into typed questions with
confidence), but built entirely on our own open local model rather than their
proprietary Jev API, which was already ruled out for this project.

The key idea: don't ask the model to write prose and then regex/split-parse
it (see the pre-fix version of decide_work_assignment in local_llm.py, which
hallucinated work IDs from its own prompt's example text). Instead, constrain
the model to emit exactly one token from a small label set (A, B, C, ... for
choice; Y/N for boolean), and read the ACTUAL token-level logprobs the model
assigned to each candidate — not a self-reported confidence string, which
LLMs are known to be poorly calibrated at producing.

Three primitives:
  - choice(question, options, context)  -> pick one of N options
  - score(question, criteria, context)  -> 0-9 integer, logprob-weighted expectation
  - boolean(question, context)          -> continuous 0-1 truth value

All three return real probabilities derived from top_logprobs, plus a
`hallucinated` flag when the model's raw output didn't match any valid label
at all (mirroring the validation discipline added to decide_work_assignment).
"""

import math
import string
from dataclasses import dataclass, field
from typing import Optional

import requests

from local_llm import LOCAL_LLM_URL, DEFAULT_MODEL, TIMEOUT, LocalLLMError, check_ollama_health


LABELS = string.ascii_uppercase  # A, B, C, ... — single-token for virtually every tokenizer


@dataclass
class ChoiceResult:
    choice: str
    confidence: float
    probabilities: dict[str, float]
    hallucinated: bool = False


@dataclass
class ScoreResult:
    score: float  # logprob-weighted expected value over 0-9
    confidence: float  # probability mass captured by the returned digit distribution
    distribution: dict[int, float] = field(default_factory=dict)
    hallucinated: bool = False


@dataclass
class BooleanResult:
    value: float  # 0.0-1.0 continuous truth value (the "Noul" primitive)
    confidence: float  # max(P(yes), P(no)) — how decisively the model landed
    hallucinated: bool = False


# mlx_lm.server hard-caps top_logprobs at 11 (validated server-side; a
# request above this crashes the connection rather than clamping).
MAX_TOP_LOGPROBS = 11


def _chat_with_logprobs(
    prompt: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1,
    top_logprobs: int = MAX_TOP_LOGPROBS,
    temperature: float = 0.0,
) -> dict:
    if not check_ollama_health():
        raise LocalLLMError("MLX server not running.")

    response = requests.post(
        LOCAL_LLM_URL,
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "logprobs": True,
            "top_logprobs": min(top_logprobs, MAX_TOP_LOGPROBS),
        },
        timeout=TIMEOUT,
    )
    if response.status_code != 200:
        raise LocalLLMError(f"MLX server error {response.status_code}: {response.text}")

    data = response.json()
    choice = data["choices"][0]
    logprobs_content = choice.get("logprobs", {}).get("content", [])
    if not logprobs_content:
        raise LocalLLMError("MLX server returned no logprobs — check server supports logprobs=true")

    first_token = logprobs_content[0]
    return {
        "content": choice["message"]["content"],
        "top_logprobs": first_token.get("top_logprobs", []),
    }


def _normalize_candidates(top_logprobs: list[dict], valid_tokens: dict[str, str]) -> dict[str, float]:
    """
    Filter top_logprobs to only tokens matching a valid label (case/whitespace
    normalized), convert logprob -> probability, and renormalize so the
    returned distribution sums to 1 across the labels that actually appeared.
    """
    matched: dict[str, float] = {}
    for entry in top_logprobs:
        raw = entry["token"].strip()
        key = valid_tokens.get(raw.upper())
        if key is not None:
            prob = math.exp(entry["logprob"])
            matched[key] = matched.get(key, 0.0) + prob

    total = sum(matched.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in matched.items()}


def choice(
    question: str,
    options: list[str],
    context: Optional[str] = None,
    model: str = DEFAULT_MODEL,
) -> ChoiceResult:
    """
    Pick exactly one of `options`, grounded in the model's real token
    probabilities rather than parsed free text.

    Raises ValueError if len(options) > 26 (out of single-letter labels) or
    options is empty.
    """
    if not options:
        raise ValueError("choice() requires at least one option")
    if len(options) > len(LABELS):
        raise ValueError(f"choice() supports at most {len(LABELS)} options, got {len(options)}")

    label_for_option = {opt: LABELS[i] for i, opt in enumerate(options)}
    option_for_label = {LABELS[i]: opt for i, opt in enumerate(options)}

    option_lines = "\n".join(f"  {label_for_option[opt]}. {opt}" for opt in options)
    context_block = f"\nContext:\n{context}\n" if context else ""
    prompt = (
        f"{question}\n{context_block}\nOptions:\n{option_lines}\n\n"
        f"Respond with ONLY the letter of your choice, nothing else."
    )

    result = _chat_with_logprobs(prompt, model=model, max_tokens=1)

    probabilities = _normalize_candidates(
        result["top_logprobs"], {label: option_for_label[label] for label in option_for_label}
    )

    if not probabilities:
        # Model's raw output didn't land on any valid label at all — don't
        # guess. Flag it and fall back to the first option with zero confidence
        # so callers can decide how to handle a genuine non-answer.
        return ChoiceResult(choice=options[0], confidence=0.0, probabilities={}, hallucinated=True)

    best = max(probabilities, key=probabilities.get)
    return ChoiceResult(choice=best, confidence=probabilities[best], probabilities=probabilities)


def score(
    question: str,
    criteria: str,
    context: Optional[str] = None,
    model: str = DEFAULT_MODEL,
) -> ScoreResult:
    """
    Score against `criteria` on a 0-9 scale. Returns the logprob-weighted
    expected value across all digits the model assigned meaningful
    probability to (not just the single greedy digit) — e.g. if the model is
    torn between 7 (60%) and 8 (40%), the score is 7.4, not a flat 7.
    """
    context_block = f"\nContext:\n{context}\n" if context else ""
    prompt = (
        f"{question}\n{context_block}\nCriteria: {criteria}\n\n"
        f"Rate this from 0 (worst) to 9 (best). Respond with ONLY a single digit, nothing else."
    )

    result = _chat_with_logprobs(prompt, model=model, max_tokens=1)

    digit_tokens = {str(d): d for d in range(10)}
    matched: dict[int, float] = {}
    for entry in result["top_logprobs"]:
        raw = entry["token"].strip()
        if raw in digit_tokens:
            digit = digit_tokens[raw]
            matched[digit] = matched.get(digit, 0.0) + math.exp(entry["logprob"])

    total = sum(matched.values())
    if total == 0:
        return ScoreResult(score=0.0, confidence=0.0, distribution={}, hallucinated=True)

    distribution = {d: p / total for d, p in matched.items()}
    expected_value = sum(d * p for d, p in distribution.items())
    confidence = max(distribution.values())

    return ScoreResult(score=expected_value, confidence=confidence, distribution=distribution)


def boolean(
    question: str,
    context: Optional[str] = None,
    model: str = DEFAULT_MODEL,
) -> BooleanResult:
    """
    The "Noul" primitive: a continuous 0-1 truth value for `question`,
    computed as P(yes) / (P(yes) + P(no)) from real token logprobs.
    """
    context_block = f"\nContext:\n{context}\n" if context else ""
    prompt = f"{question}{context_block}\n\nRespond with ONLY yes or no."

    result = _chat_with_logprobs(prompt, model=model, max_tokens=1)

    yes_no = {"YES": "yes", "NO": "no"}
    probabilities = _normalize_candidates(result["top_logprobs"], yes_no)

    if not probabilities:
        return BooleanResult(value=0.5, confidence=0.0, hallucinated=True)

    p_yes = probabilities.get("yes", 0.0)
    return BooleanResult(value=p_yes, confidence=max(probabilities.values()))


if __name__ == "__main__":
    import sys

    print("Choice:", choice(
        "Which engineer should claim this Auth work item?",
        ["engineer-auth-001", "engineer-forms-001", "engineer-spine-001"],
        context="Work item: Add TOTP support (lane: Auth, priority: high). "
                "engineer-auth-001 has capacity 2/2 free, others are Forms/Spine specialists.",
    ))
    print("Score:", score(
        "How ready is this PR to merge?",
        "Tests pass, one minor lint warning, no security issues",
    ))
    print("Boolean:", boolean("Is this task complex enough to require Haiku instead of local routing?"))
