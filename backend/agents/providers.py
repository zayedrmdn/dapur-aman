"""Provider and model configuration for all three agents (DEVELOPMENT.md §2).

The provider is chosen by hand through AI_PROVIDER and AI_MODEL. A missing or
unknown setting raises ProviderConfigError; nothing switches automatically.
"""

import os
from dataclasses import dataclass

from google.adk.models.base_llm import BaseLlm
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

VERTEX = "vertex"
OPENROUTER = "openrouter"
FIXTURE = "fixture"
SUPPORTED_PROVIDERS = (VERTEX, OPENROUTER, FIXTURE)

MODEL_CALL_TIMEOUT_SECONDS = 45


class ProviderConfigError(Exception):
    pass


@dataclass(frozen=True)
class ProviderSettings:
    provider: str
    model_id: str


def read_provider_settings() -> ProviderSettings:
    provider = os.environ.get("AI_PROVIDER", "").strip().lower()
    model_id = os.environ.get("AI_MODEL", "").strip()

    if provider not in SUPPORTED_PROVIDERS:
        raise ProviderConfigError(
            f"AI_PROVIDER must be one of {', '.join(SUPPORTED_PROVIDERS)}"
        )
    if provider == FIXTURE:
        return ProviderSettings(provider=FIXTURE, model_id=FIXTURE)
    if not model_id:
        raise ProviderConfigError("AI_MODEL is empty")
    if provider == VERTEX and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        raise ProviderConfigError("GOOGLE_CLOUD_PROJECT is empty")
    if provider == OPENROUTER and not os.environ.get("OPENROUTER_API_KEY"):
        raise ProviderConfigError("OPENROUTER_API_KEY is empty")
    return ProviderSettings(provider=provider, model_id=model_id)


def build_model(settings: ProviderSettings) -> str | BaseLlm:
    if settings.provider == VERTEX:
        return settings.model_id
    if settings.provider == OPENROUTER:
        return LiteLlm(
            model=f"openrouter/{settings.model_id}",
            timeout=MODEL_CALL_TIMEOUT_SECONDS,
            extra_body={"provider": {"allow_fallbacks": False}},
        )
    raise ProviderConfigError(f"{settings.provider} has no model to build")


def model_call_config() -> types.GenerateContentConfig:
    timeout_milliseconds = MODEL_CALL_TIMEOUT_SECONDS * 1000
    return types.GenerateContentConfig(
        temperature=0,
        http_options=types.HttpOptions(timeout=timeout_milliseconds),
    )
