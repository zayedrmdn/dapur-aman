"""Test double: a model that replays prepared replies in order.

ADK, the runners and the Python tools run for real; only the model's replies
are scripted. Never use this outside tests.
"""

import json
from collections.abc import AsyncGenerator

from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types


class ScriptedLlm(BaseLlm):
    replies: list[LlmResponse] = []
    requests: list[LlmRequest] = []

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.requests.append(llm_request)
        if not self.replies:
            raise RuntimeError("ScriptedLlm has no reply left")
        yield self.replies.pop(0)


def tool_calls(*calls: tuple[str, dict]) -> LlmResponse:
    parts = [
        types.Part.from_function_call(name=name, args=args) for name, args in calls
    ]
    return LlmResponse(content=types.Content(role="model", parts=parts))


def json_reply(value: dict) -> LlmResponse:
    text = json.dumps(value)
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part.from_text(text=text)])
    )


def build_test_vision_agent(model: str | BaseLlm) -> LlmAgent:
    return LlmAgent(name="vision", model=model, instruction="Test stand-in for Vision.")
