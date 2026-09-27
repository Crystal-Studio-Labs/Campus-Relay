"""Controlled operational agents.

Four agents, all constrained by the same rules:
  * they may not execute SQL
  * they may only call tools in app/services/agents/tools.py
  * every tool re-checks permission, policy and state server-side
  * every tool call is audited
  * if a model is unavailable, deterministic logic answers instead
"""

from app.services.agents.assistant import AssistantAnswer, StudentAssistant, confirm_action, detect_intent
from app.services.agents.intake import IntakeAgent, IntakeAnalysis
from app.services.agents.ops import Briefing, Finding, OperationsAgent, recurring_summary
from app.services.agents.provider import get_provider, provider_status
from app.services.agents.routing_agent import RoutingAgent, RoutingExplanation

__all__ = [
    "StudentAssistant",
    "AssistantAnswer",
    "confirm_action",
    "detect_intent",
    "IntakeAgent",
    "IntakeAnalysis",
    "OperationsAgent",
    "Briefing",
    "Finding",
    "recurring_summary",
    "RoutingAgent",
    "RoutingExplanation",
    "get_provider",
    "provider_status",
]
