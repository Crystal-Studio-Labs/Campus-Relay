"""LLM provider abstraction.

Default (`AGENT_PROVIDER=rules`): no model, no network, no API key. The
deterministic engines in app/services/routing.py answer directly. This is the
path that keeps the product working when the model is unavailable.

Optional (`AGENT_PROVIDER=openai_compatible`): a real chat-completions endpoint
is called with structured tool definitions. If the call fails for ANY reason the
caller falls back to the deterministic path and records why - the feature never
appears to have worked when it did not.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import settings


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass
class ModelResponse:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    engine: str = "rules"
    model: str | None = None
    error: str | None = None


class LLMProvider(Protocol):
    name: str
    is_remote: bool

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        tools: list[dict] | None = None,
    ) -> ModelResponse: ...


class RulesProvider:
    """Deterministic placeholder: the caller implements the logic itself."""

    name = "rules"
    is_remote = False

    def complete(self, *, system, messages, tools=None) -> ModelResponse:  # noqa: ARG002
        return ModelResponse(text="", engine="rules", error=None)


class OpenAICompatibleProvider:
    """Minimal chat-completions client with tool support."""

    is_remote = True

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout: float = 20.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.name = f"openai_compatible:{model}"

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        tools: list[dict] | None = None,
    ) -> ModelResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "temperature": 0.1,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as exc:
            return ModelResponse(engine="rules_fallback", error=f"provider_unreachable: {exc.__class__.__name__}")
        except ValueError as exc:
            return ModelResponse(engine="rules_fallback", error=f"provider_bad_json: {exc.__class__.__name__}")

        try:
            message = body["choices"][0]["message"]
        except (KeyError, IndexError, TypeError):
            return ModelResponse(engine="rules_fallback", error="provider_unexpected_shape")

        calls: list[ToolCall] = []
        for call in message.get("tool_calls") or []:
            function = call.get("function") or {}
            raw_arguments = function.get("arguments") or "{}"
            try:
                import json

                arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) else raw_arguments
            except ValueError:
                arguments = {}
            calls.append(ToolCall(name=function.get("name", ""), arguments=arguments))

        return ModelResponse(
            text=message.get("content") or "",
            tool_calls=calls,
            engine="llm",
            model=self.model,
        )


def get_provider() -> LLMProvider:
    if settings.agent_provider == "openai_compatible" and settings.agent_llm_base_url and settings.agent_llm_api_key:
        return OpenAICompatibleProvider(
            base_url=settings.agent_llm_base_url,
            api_key=settings.agent_llm_api_key,
            model=settings.agent_llm_model or "gpt-4o-mini",
            timeout=settings.agent_timeout_seconds,
        )
    return RulesProvider()


def provider_status() -> dict:
    provider = get_provider()
    return {
        "provider": provider.name,
        "remote": provider.is_remote,
        "configured": not isinstance(provider, RulesProvider) or settings.agent_provider == "rules",
        "mode": "llm" if provider.is_remote else "deterministic_rules",
        "note": (
            "Deterministic engines are active: no external model is called, and every "
            "workflow works without one."
            if not provider.is_remote
            else "Remote model configured; deterministic fallback still applies if the call fails."
        ),
    }
