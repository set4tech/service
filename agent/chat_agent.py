"""
Chat Agent for Architectural Drawing Q&A

Provides an agentic chat interface for asking questions about architectural
drawings using the same tools as the compliance_agent.
"""

import json
import logging
from pathlib import Path
from typing import AsyncGenerator, Optional

from anthropic import Anthropic

from chat_tools import DocumentNavigator, ChatToolExecutor, CHAT_TOOLS

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an assistant helping users explore architectural drawings.

You have access to parsed architectural drawing data in JSON format. Use the available tools to find information and answer questions.

Tools available:
- find_schedules: Find door/window/finish/equipment schedules
- search_drawings: Search pages for keywords
- get_room_list: Get rooms with areas and occupancy
- get_project_info: Get project metadata
- get_sheet_list: List all sheets
- read_sheet_details: Read specific sheet content
- get_keynotes: Get keynotes and notes
- view_sheet_image: View a sheet image directly (you will see the image)

Guidelines:
- Use tools to find information before answering
- Cite sheet/page numbers when referencing information
- Use view_sheet_image when you need to visually inspect details that aren't in the text data
- Be concise but thorough
- If you can't find information, say so clearly
"""


class ChatAgent:
    """Streaming chat agent for architectural drawing Q&A."""

    def __init__(
        self,
        unified_json: dict,
        images_dir: Optional[Path] = None,
        model: str = "claude-sonnet-4-20250514",
    ):
        """
        Initialize the chat agent.

        Args:
            unified_json: The unified document JSON (already loaded)
            images_dir: Path to directory containing page images
            model: Claude model to use
        """
        self.client = Anthropic()
        self.navigator = DocumentNavigator(unified_json)
        self.tool_executor = ChatToolExecutor(self.navigator, images_dir)
        self.model = model
        self.max_iterations = 10

        logger.info(f"[ChatAgent] Initialized with model={model}, images_dir={images_dir}")

    async def chat_stream(
        self,
        message: str,
        history: list[dict],
    ) -> AsyncGenerator[dict, None]:
        """
        Process a chat message and yield streaming chunks.

        Args:
            message: The user's message
            history: Conversation history (will be mutated to add new messages)

        Yields:
            Chunks with types: "text", "tool_use", "tool_result", "image", "done", "error"
        """
        # Add user message to history
        history.append({"role": "user", "content": message})
        messages = list(history)

        for iteration in range(self.max_iterations):
            logger.info(f"[ChatAgent] Iteration {iteration + 1}/{self.max_iterations}")

            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=CHAT_TOOLS,
                    messages=messages,
                )
            except Exception as e:
                logger.error(f"[ChatAgent] API error: {e}")
                yield {"type": "error", "message": str(e)}
                return

            # Process response blocks
            assistant_content = []
            tool_calls = []

            for block in response.content:
                if block.type == "text":
                    yield {"type": "text", "content": block.text}
                    assistant_content.append({"type": "text", "text": block.text})

                elif block.type == "tool_use":
                    yield {
                        "type": "tool_use",
                        "tool": block.name,
                        "tool_use_id": block.id,
                        "input": block.input,
                    }
                    tool_calls.append(block)
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            # Add assistant message to conversation
            messages.append({"role": "assistant", "content": assistant_content})

            # If done (no tool calls), finalize and return
            if response.stop_reason == "end_turn" and not tool_calls:
                # Update history with final assistant response
                history.append({"role": "assistant", "content": assistant_content})
                yield {"type": "done"}
                return

            # Execute tool calls and add results
            if tool_calls:
                tool_results = []

                for tc in tool_calls:
                    logger.info(f"[ChatAgent] Executing tool: {tc.name}")
                    exec_result = self.tool_executor.execute(tc.name, tc.input)

                    # Check if result includes an image
                    if "image" in exec_result:
                        # Yield the image to the frontend for display
                        yield {
                            "type": "image",
                            "tool": tc.name,
                            "tool_use_id": tc.id,
                            "image": exec_result["image"],
                            "metadata": exec_result.get("result", {}),
                        }

                        # Build tool result content with image for Claude to see
                        tool_result_content = [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": exec_result["image"]["media_type"],
                                    "data": exec_result["image"]["data"],
                                },
                            },
                            {
                                "type": "text",
                                "text": f"Here is the image for sheet {exec_result.get('result', {}).get('sheet', 'unknown')}. Please analyze it to answer the user's question.",
                            },
                        ]
                    else:
                        # Regular text result
                        result_json = json.dumps(exec_result.get("result", exec_result), indent=2, default=str)
                        yield {
                            "type": "tool_result",
                            "tool": tc.name,
                            "tool_use_id": tc.id,
                            "result": exec_result.get("result", exec_result),
                        }
                        tool_result_content = result_json

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": tool_result_content,
                    })

                messages.append({"role": "user", "content": tool_results})

            # Safety check for end_turn with tool calls (shouldn't happen)
            if response.stop_reason == "end_turn":
                break

        # Max iterations reached
        yield {"type": "error", "message": "Max iterations reached"}


class ConversationManager:
    """Manages chat conversations with in-memory storage."""

    def __init__(self):
        self.conversations: dict[str, dict] = {}

    def get_or_create(
        self,
        conversation_id: str,
        unified_json: dict,
        images_dir: Optional[Path] = None,
    ) -> tuple[ChatAgent, list[dict]]:
        """
        Get existing conversation or create new one.

        Returns:
            Tuple of (ChatAgent, history list)
        """
        if conversation_id not in self.conversations:
            logger.info(f"[ConversationManager] Creating new conversation: {conversation_id}")
            self.conversations[conversation_id] = {
                "agent": ChatAgent(unified_json, images_dir),
                "history": [],
            }

        conv = self.conversations[conversation_id]
        return conv["agent"], conv["history"]

    def delete(self, conversation_id: str) -> bool:
        """Delete a conversation."""
        if conversation_id in self.conversations:
            del self.conversations[conversation_id]
            logger.info(f"[ConversationManager] Deleted conversation: {conversation_id}")
            return True
        return False


# Global conversation manager
conversation_manager = ConversationManager()
