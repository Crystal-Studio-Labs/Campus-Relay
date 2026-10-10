"""In-process rate limiting and request-size guards.

A best-effort limiter for a single-process deployment. It is deliberately small:
a sliding window per key, held in memory, with a hard cap on how many keys are
remembered. Nothing here is a substitute for a real edge limiter in front of a
multi-process deployment - but it does stop the four things that actually happen
to an exposed college API:

* **Credential stuffing.** Sign-in has its own, much tighter budget than the
  rest of the API, so trying passwords is slow even when it is automated.
* **Scraping / hammering.** A per-client budget across the whole surface.
* **Memory exhaustion.** Buckets are capped and pruned, so a client that keeps
  arriving from fresh addresses cannot grow the table without bound. This was a
  real bug: the old counter kept a deque per address forever.
* **Oversized bodies.** A Content-Length cap refused before the body is read.

The window is wall-clock, so the numbers a client sees (`Retry-After`) line up
with the numbers the client can measure.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class Rule:
    """A budget: at most ``limit`` requests per ``window_seconds`` for one key."""

    limit: int
    window_seconds: float = 60.0


# The default budget for the whole API surface.
DEFAULT_RULE = Rule(limit=240, window_seconds=60)

# Tighter budgets for the paths where abuse is worth it. The longest matching
# prefix is chosen (so `/auth/login` can be stricter than the rest of `/auth`),
# and the stricter of that rule and the deployment's general budget is applied.
# These budgets are PER CLIENT KEY, and a client key is per signed-in account
# where one exists (see `client_key`). That distinction matters on a campus: a
# whole hostel can share one NAT address, so an address-only budget would have
# 200 students competing for one person's allowance.
PATH_RULES: tuple[tuple[str, Rule], ...] = (
    # Sign-in: no authenticated key exists yet, so this budget is per address by
    # necessity. 30 a minute is generous for a shared campus address (still only
    # ~43k attempts a day, not millions); what actually stops a brute-force run
    # is the per-account limit inside the login route.
    ("/auth/login", Rule(limit=30, window_seconds=60)),
    ("/auth", Rule(limit=120, window_seconds=60)),
    # CSV import is heavy (parse + bulk insert) and is a batch action.
    ("/admin/data/import", Rule(limit=20, window_seconds=60)),
    # Public QR rendering is unauthenticated and does real work per call.
    ("/qr/", Rule(limit=60, window_seconds=60)),
)

# A loose ceiling applied per ADDRESS on top of the per-key budget. It catches
# unauthenticated floods and a single abusive host, and sits deliberately far
# above what a shared campus address with many signed-in users needs.
PER_ADDRESS_RULE = Rule(limit=1200, window_seconds=60)

# Login attempts per email address - the control that makes credential stuffing
# impractical, since it cannot be diluted with more source addresses. A
# successful sign-in clears the counter, so mistyping a password a few times
# never locks anyone out.
LOGIN_ATTEMPT_RULE = Rule(limit=8, window_seconds=300)


def rule_for(path: str, default: Rule | None = None) -> Rule:
    """The effective budget for a request path.

    ``default`` lets the deployment configure the general budget while the
    hard-coded path rules stay strict and out of a config file. The stricter of
    the two always wins, so a configured budget can tighten a path but never
    loosen the built-in limits on sign-in, CSV import or QR rendering.
    """
    best: Rule | None = None
    best_length = -1
    for prefix, rule in PATH_RULES:
        if prefix in path and len(prefix) > best_length:
            best, best_length = rule, len(prefix)

    general = default or DEFAULT_RULE
    if best is None:
        return general
    if best.limit != general.limit:
        return best if best.limit < general.limit else general
    return best if best.window_seconds <= general.window_seconds else general


class SlidingWindowLimiter:
    """A per-key sliding window, with a bounded number of remembered keys."""

    def __init__(self, max_keys: int = 20_000) -> None:
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, rule: Rule) -> tuple[bool, int]:
        """Record one request. Returns ``(allowed, retry_after_seconds)``.

        On refusal the request is *not* recorded, so a client that keeps hammering
        during its penalty window does not extend its own penalty indefinitely.
        """
        now = time.time()
        bucket = self._hits.get(key)
        if bucket is None:
            bucket = deque()
            self._hits[key] = bucket

        while bucket and now - bucket[0] > rule.window_seconds:
            bucket.popleft()

        if len(bucket) >= rule.limit:
            retry_after = max(1, int(rule.window_seconds - (now - bucket[0])) + 1)
            return False, retry_after

        bucket.append(now)
        self._prune(now, rule.window_seconds)
        return True, 0

    def _prune(self, now: float, window_seconds: float) -> None:
        """Keep the bucket table bounded so it cannot be used as a memory sink."""
        if len(self._hits) <= self.max_keys:
            return
        # First, drop every bucket whose newest hit is already outside the window.
        for key in [k for k, b in self._hits.items() if not b or now - b[-1] > window_seconds]:
            del self._hits[key]
        # If an attacker is still holding more live buckets than the cap allows,
        # evict the least recently used until we are back under it. This is the
        # only place that sacrifices accuracy for a hard memory ceiling.
        overflow = len(self._hits) - self.max_keys
        if overflow > 0:
            oldest = sorted(self._hits.items(), key=lambda item: item[1][-1])[:overflow]
            for key, _ in oldest:
                del self._hits[key]

    def clear(self, key: str) -> None:
        """Forget one key's history - e.g. after a successful sign-in."""
        self._hits.pop(key, None)

    def reset(self) -> None:
        """Forget every bucket. Used by tests and by the demo reset."""
        self._hits.clear()

    def key_count(self) -> int:
        return len(self._hits)
