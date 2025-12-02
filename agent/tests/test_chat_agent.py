"""
Unit tests for agent/chat_agent.py
"""
import pytest
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chat_agent import ChatAgent, ConversationManager, SYSTEM_PROMPT


# =============================================================================
# Test Data
# =============================================================================

SAMPLE_UNIFIED_JSON = {
    "metadata": {"total_pages": 2},
    "project_info": {"project_name": "Test Building"},
    "pages": {
        "1": {
            "sheet_number": "A1.0",
            "sheet_title": "Floor Plan",
            "page_text": {"raw": "Test content"},
            "sections": [],
        }
    },
}


# =============================================================================
# Test ChatAgent Initialization
# =============================================================================

class TestChatAgentInit:
    """Test ChatAgent initialization."""

    @patch("chat_agent.Anthropic")
    def test_init_creates_navigator(self, mock_anthropic):
        """ChatAgent should create DocumentNavigator."""
        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        assert agent.navigator is not None
        assert len(agent.navigator.pages) == 1

    @patch("chat_agent.Anthropic")
    def test_init_creates_tool_executor(self, mock_anthropic):
        """ChatAgent should create ChatToolExecutor."""
        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        assert agent.tool_executor is not None

    @patch("chat_agent.Anthropic")
    def test_init_uses_default_model(self, mock_anthropic):
        """ChatAgent should use default model."""
        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        assert agent.model == "claude-sonnet-4-20250514"

    @patch("chat_agent.Anthropic")
    def test_init_accepts_custom_model(self, mock_anthropic):
        """ChatAgent should accept custom model."""
        agent = ChatAgent(SAMPLE_UNIFIED_JSON, model="claude-3-opus")
        assert agent.model == "claude-3-opus"

    @patch("chat_agent.Anthropic")
    def test_init_sets_max_iterations(self, mock_anthropic):
        """ChatAgent should set max iterations."""
        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        assert agent.max_iterations == 10


# =============================================================================
# Test ConversationManager
# =============================================================================

class TestConversationManager:
    """Test ConversationManager class."""

    def test_get_or_create_new_conversation(self):
        """get_or_create should create new conversation."""
        with patch("chat_agent.Anthropic"):
            manager = ConversationManager()
            agent, history = manager.get_or_create("conv-1", SAMPLE_UNIFIED_JSON)

            assert agent is not None
            assert history == []
            assert "conv-1" in manager.conversations

    def test_get_or_create_returns_existing(self):
        """get_or_create should return existing conversation."""
        with patch("chat_agent.Anthropic"):
            manager = ConversationManager()

            # Create first conversation
            agent1, history1 = manager.get_or_create("conv-1", SAMPLE_UNIFIED_JSON)
            history1.append({"role": "user", "content": "Hello"})

            # Get same conversation
            agent2, history2 = manager.get_or_create("conv-1", SAMPLE_UNIFIED_JSON)

            assert agent1 is agent2
            assert history1 is history2
            assert len(history2) == 1

    def test_delete_removes_conversation(self):
        """delete should remove conversation."""
        with patch("chat_agent.Anthropic"):
            manager = ConversationManager()
            manager.get_or_create("conv-1", SAMPLE_UNIFIED_JSON)

            assert manager.delete("conv-1") is True
            assert "conv-1" not in manager.conversations

    def test_delete_nonexistent_returns_false(self):
        """delete should return False for nonexistent conversation."""
        manager = ConversationManager()
        assert manager.delete("nonexistent") is False


# =============================================================================
# Test System Prompt
# =============================================================================

class TestSystemPrompt:
    """Test system prompt content."""

    def test_system_prompt_mentions_tools(self):
        """System prompt should mention available tools."""
        assert "find_schedules" in SYSTEM_PROMPT
        assert "search_drawings" in SYSTEM_PROMPT
        assert "get_room_list" in SYSTEM_PROMPT
        assert "view_sheet_image" in SYSTEM_PROMPT

    def test_system_prompt_has_guidelines(self):
        """System prompt should have usage guidelines."""
        assert "Guidelines" in SYSTEM_PROMPT or "guidelines" in SYSTEM_PROMPT.lower()


# =============================================================================
# Test ChatAgent Streaming (with mocks)
# =============================================================================

class TestChatAgentStreaming:
    """Test ChatAgent chat_stream method."""

    @pytest.fixture
    def mock_anthropic(self):
        """Create mock Anthropic client."""
        with patch("chat_agent.Anthropic") as mock:
            yield mock

    @pytest.mark.asyncio
    async def test_chat_stream_yields_text(self, mock_anthropic):
        """chat_stream should yield text chunks."""
        # Setup mock response
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client

        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(type="text", text="Hello, I can help you explore the drawings.")
        ]
        mock_response.stop_reason = "end_turn"
        mock_client.messages.create.return_value = mock_response

        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        history = []
        chunks = []

        async for chunk in agent.chat_stream("What drawings are there?", history):
            chunks.append(chunk)

        # Should have text chunk and done chunk
        text_chunks = [c for c in chunks if c.get("type") == "text"]
        done_chunks = [c for c in chunks if c.get("type") == "done"]

        assert len(text_chunks) == 1
        assert "Hello" in text_chunks[0]["content"]
        assert len(done_chunks) == 1

    @pytest.mark.asyncio
    async def test_chat_stream_handles_tool_use(self, mock_anthropic):
        """chat_stream should handle tool use and results."""
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client

        # First response: tool use
        tool_use_response = MagicMock()
        tool_use_block = MagicMock()
        tool_use_block.type = "tool_use"
        tool_use_block.id = "tool-123"
        tool_use_block.name = "get_sheet_list"
        tool_use_block.input = {}
        tool_use_response.content = [tool_use_block]
        tool_use_response.stop_reason = "tool_use"

        # Second response: final text
        final_response = MagicMock()
        final_response.content = [MagicMock(type="text", text="Found 1 sheet.")]
        final_response.stop_reason = "end_turn"

        mock_client.messages.create.side_effect = [tool_use_response, final_response]

        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        history = []
        chunks = []

        async for chunk in agent.chat_stream("List all sheets", history):
            chunks.append(chunk)

        # Should have tool_use, tool_result, text, and done chunks
        tool_use_chunks = [c for c in chunks if c.get("type") == "tool_use"]
        tool_result_chunks = [c for c in chunks if c.get("type") == "tool_result"]
        text_chunks = [c for c in chunks if c.get("type") == "text"]

        assert len(tool_use_chunks) == 1
        assert tool_use_chunks[0]["tool"] == "get_sheet_list"
        assert len(tool_result_chunks) == 1
        assert len(text_chunks) == 1

    @pytest.mark.asyncio
    async def test_chat_stream_updates_history(self, mock_anthropic):
        """chat_stream should update conversation history."""
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client

        mock_response = MagicMock()
        mock_response.content = [MagicMock(type="text", text="Response")]
        mock_response.stop_reason = "end_turn"
        mock_client.messages.create.return_value = mock_response

        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        history = []

        async for _ in agent.chat_stream("User message", history):
            pass

        # History should have user message and assistant message
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[0]["content"] == "User message"
        assert history[1]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_chat_stream_handles_api_error(self, mock_anthropic):
        """chat_stream should yield error on API failure."""
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.side_effect = Exception("API Error")

        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        history = []
        chunks = []

        async for chunk in agent.chat_stream("Test", history):
            chunks.append(chunk)

        error_chunks = [c for c in chunks if c.get("type") == "error"]
        assert len(error_chunks) == 1
        assert "API Error" in error_chunks[0]["message"]

    @pytest.mark.asyncio
    async def test_chat_stream_max_iterations(self, mock_anthropic):
        """chat_stream should stop after max iterations."""
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client

        # Always return tool use (never end_turn)
        tool_use_response = MagicMock()
        tool_use_block = MagicMock()
        tool_use_block.type = "tool_use"
        tool_use_block.id = "tool-123"
        tool_use_block.name = "get_sheet_list"
        tool_use_block.input = {}
        tool_use_response.content = [tool_use_block]
        tool_use_response.stop_reason = "tool_use"

        mock_client.messages.create.return_value = tool_use_response

        agent = ChatAgent(SAMPLE_UNIFIED_JSON)
        agent.max_iterations = 3  # Limit for test
        history = []
        chunks = []

        async for chunk in agent.chat_stream("Test", history):
            chunks.append(chunk)

        # Should have error about max iterations
        error_chunks = [c for c in chunks if c.get("type") == "error"]
        assert len(error_chunks) == 1
        assert "Max iterations" in error_chunks[0]["message"]
