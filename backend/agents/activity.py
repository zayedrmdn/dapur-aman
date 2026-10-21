"""Records actual ADK agent, tool and model execution as ActivityEvents.

One recorder is shared by every Runner in a run, so nested specialist runs land
in the same ordered list. Only callbacks ADK really fired become events.
"""

from datetime import UTC, datetime
from typing import Any

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from agents.contract import ActivityEvent

AGENT_CALL = "agent_call"
TOOL_CALL = "tool_call"
MODEL_CALL = "model_call"


class ActivityRecorder(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="activity_recorder")
        self.events: list[ActivityEvent] = []
        self.open_steps: list[str] = []
        self.completed_tools: list[tuple[str, dict[str, Any]]] = []

    def record(self, **fields: Any) -> None:
        event = ActivityEvent(
            sequence=len(self.events) + 1,
            timestamp=datetime.now(UTC),
            **fields,
        )
        self.events.append(event)

    def parent_step(self) -> str | None:
        return self.open_steps[-1] if self.open_steps else None

    def tool_was_completed(self, tool_name: str) -> bool:
        return any(name == tool_name for name, _ in self.completed_tools)

    def rule_references_returned(self) -> set[str]:
        references = set()
        for name, result in self.completed_tools:
            if name == "lookup_rules":
                references.update(rule["rule_reference"] for rule in result["rules"])
        return references

    async def before_agent_callback(
        self, *, agent: BaseAgent, callback_context: CallbackContext
    ) -> None:
        self.record(
            step=agent.name,
            parent_step=self.parent_step(),
            agent=agent.name,
            kind=AGENT_CALL,
            status="started",
            summary=f"{agent.name} agent started.",
        )
        self.open_steps.append(agent.name)

    async def after_agent_callback(
        self, *, agent: BaseAgent, callback_context: CallbackContext
    ) -> None:
        self.close_step(agent.name)
        self.record(
            step=agent.name,
            parent_step=self.parent_step(),
            agent=agent.name,
            kind=AGENT_CALL,
            status="completed",
            summary=f"{agent.name} agent finished.",
        )

    async def on_agent_error_callback(
        self, *, agent: BaseAgent, callback_context: CallbackContext, error: Exception
    ) -> None:
        self.close_step(agent.name)
        self.record(
            step=agent.name,
            parent_step=self.parent_step(),
            agent=agent.name,
            kind=AGENT_CALL,
            status="failed",
            summary=f"{agent.name} agent stopped with an error.",
            error=type(error).__name__,
        )

    async def before_tool_callback(
        self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext
    ) -> None:
        self.open_steps.append(tool.name)

    async def after_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        result: dict[str, Any],
    ) -> None:
        self.close_step(tool.name)
        self.completed_tools.append((tool.name, result))
        failed = isinstance(result, dict) and "error" in result
        self.record(
            step=tool.name,
            parent_step=self.parent_step(),
            agent=tool_context.agent_name,
            kind=TOOL_CALL,
            status="failed" if failed else "completed",
            summary=summarize_tool_call(tool.name, tool_args, result),
            references=rule_references_in(result),
            error=str(result["error"]) if failed else None,
        )

    async def on_tool_error_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        error: Exception,
    ) -> None:
        self.close_step(tool.name)
        self.record(
            step=tool.name,
            parent_step=self.parent_step(),
            agent=tool_context.agent_name,
            kind=TOOL_CALL,
            status="failed",
            summary=f"{tool.name} raised an error.",
            error=type(error).__name__,
        )

    async def on_model_error_callback(
        self,
        *,
        callback_context: CallbackContext,
        llm_request: LlmRequest,
        error: Exception,
    ) -> None:
        self.record(
            step=f"{callback_context.agent_name}_model",
            parent_step=self.parent_step(),
            agent=callback_context.agent_name,
            kind=MODEL_CALL,
            status="failed",
            summary="The model call failed.",
            error=type(error).__name__,
        )

    def close_step(self, step: str) -> None:
        if step in self.open_steps:
            index = len(self.open_steps) - 1 - self.open_steps[::-1].index(step)
            del self.open_steps[index:]


def summarize_tool_call(tool_name: str, tool_args: dict[str, Any], result: Any) -> str:
    arguments = ", ".join(f"{key}={value}" for key, value in tool_args.items())
    if isinstance(result, dict) and "summary" in result:
        return f"{tool_name}({arguments}): {result['summary']}"
    if isinstance(result, dict) and "rules" in result:
        return f"{tool_name}({arguments}): {len(result['rules'])} matching rule(s)."
    if isinstance(result, dict) and "evidence_gaps" in result:
        return f"{tool_name}({arguments}): {len(result['evidence_gaps'])} evidence gap(s)."
    if isinstance(result, dict) and "earlier_findings_in_batch" in result:
        return (
            f"{tool_name}({arguments}): "
            f"{result['earlier_findings_in_batch']} earlier finding(s) in this batch."
        )
    return f"{tool_name}({arguments}) finished."


def rule_references_in(result: Any) -> list[str]:
    if isinstance(result, dict) and "rules" in result:
        return [rule["rule_reference"] for rule in result["rules"]]
    return []
