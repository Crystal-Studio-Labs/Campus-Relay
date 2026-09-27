"""Outbound delivery worker for the notification outbox.

Runs as a daemon thread beside the API. Each pass takes the due rows from
``notification_deliveries``, calls the provider, records the true outcome as an
append-only ``NotificationEvent``, and backoff-retries a transient failure.

Kept deliberately simple: no broker, no Celery. The product is a modular
monolith, and "one process, one database" is the reason a case write and its
audit row are atomic. A single polling worker is the smallest thing that keeps
provider calls off the request path.

Run it once, or by hand, from the shell:

    python -m app.services.delivery --once     # drain the queue and exit
"""

from __future__ import annotations

import argparse
import logging
import threading

from app.core.config import settings
from app.core.db import session_scope
from app.services import notifications

logger = logging.getLogger("campus_relay.delivery")


def run_once(batch_size: int | None = None) -> dict:
    """Drain one batch of due deliveries. Safe to call from tests."""
    with session_scope() as db:
        return notifications.process_due_deliveries(
            db, limit=batch_size or settings.delivery_batch_size
        )


def run_forever(stop_event: threading.Event, poll_seconds: float, batch_size: int) -> None:
    logger.info("delivery worker started (poll=%.1fs, batch=%d)", poll_seconds, batch_size)
    while not stop_event.wait(poll_seconds):
        try:
            summary = run_once(batch_size)
            if summary.get("processed"):
                logger.info("delivery worker pass: %s", summary)
        except Exception:  # noqa: BLE001 - the worker must survive a bad row
            logger.exception("delivery worker iteration failed; continuing")
    logger.info("delivery worker stopped")


def start_worker() -> threading.Event | None:
    """Start the daemon thread unless it is disabled or the env is a test run."""
    if not settings.delivery_worker_enabled or settings.app_env == "test":
        return None
    stop = threading.Event()
    thread = threading.Thread(
        target=run_forever,
        args=(stop, settings.delivery_poll_seconds, settings.delivery_batch_size),
        name="delivery-worker",
        daemon=True,
    )
    thread.start()
    return stop


def stop_worker(stop: threading.Event | None) -> None:
    if stop is not None:
        stop.set()


def _cli() -> None:
    parser = argparse.ArgumentParser(description="Campus Relay notification delivery worker")
    parser.add_argument("--once", action="store_true", help="drain the queue once and exit")
    parser.add_argument("--batch-size", type=int, default=None)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if args.once:
        print(run_once(args.batch_size))
        return
    stop = threading.Event()
    run_forever(stop, settings.delivery_poll_seconds, args.batch_size or settings.delivery_batch_size)


if __name__ == "__main__":
    _cli()
