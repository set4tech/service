"""
Unit tests for agent/llm.py

These tests verify the behavior of the LLM client functions using mocks.
"""
import pytest
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestGetGemini:
    """Test get_gemini function."""

    def test_raises_without_api_key(self):
        """Raises ValueError when no API key is set."""
        # Mock genai module
        mock_genai = MagicMock()
        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {}, clear=True):
                # Force fresh import
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None

                with pytest.raises(ValueError, match="GEMINI_API_KEY or GOOGLE_API_KEY"):
                    llm.get_gemini()

    def test_uses_gemini_api_key(self):
        """Uses GEMINI_API_KEY environment variable."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}, clear=True):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.get_gemini()

                mock_genai.configure.assert_called_with(api_key='test-key')
                mock_genai.GenerativeModel.assert_called_with("gemini-2.0-flash")
                assert result is mock_model

    def test_uses_google_api_key_fallback(self):
        """Falls back to GOOGLE_API_KEY if GEMINI_API_KEY is not set."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GOOGLE_API_KEY': 'google-key'}, clear=True):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                llm.get_gemini()

                mock_genai.configure.assert_called_with(api_key='google-key')

    def test_returns_singleton(self):
        """Returns the same model instance on subsequent calls."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result1 = llm.get_gemini()
                result2 = llm.get_gemini()

                assert result1 is result2
                # GenerativeModel should only be called once
                assert mock_genai.GenerativeModel.call_count == 1


class TestCallGemini:
    """Test call_gemini function."""

    def test_success_response(self):
        """Returns success response with generated text."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "  Generated response  "
        mock_response.candidates = [MagicMock(finish_reason=1)]  # STOP = 1

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_gemini("Test prompt")

                assert result["status"] == "success"
                assert result["text"] == "Generated response"  # Stripped
                assert result["error"] is None
                assert result["finish_reason"] == 1

    def test_token_limit_response(self):
        """Returns token_limit status when max tokens is reached."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Partial..."
        mock_response.candidates = [MagicMock(finish_reason=2)]  # MAX_TOKENS = 2

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_gemini("Test prompt")

                assert result["status"] == "token_limit"
                assert result["finish_reason"] == 2

    def test_error_response(self):
        """Returns error response when API call fails."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("API error occurred")
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_gemini("Test prompt")

                assert result["status"] == "error"
                assert result["text"] == ""
                assert "API error occurred" in result["error"]

    def test_with_image(self):
        """Passes image to generate_content when provided."""
        from PIL import Image

        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Image description"
        mock_response.candidates = [MagicMock(finish_reason=1)]

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        test_image = Image.new('RGB', (100, 100), color='red')

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                llm.call_gemini("Describe this", image=test_image)

                # Verify generate_content was called with prompt and image
                call_args = mock_model.generate_content.call_args
                content = call_args[0][0]
                assert len(content) == 2
                assert content[0] == "Describe this"
                assert content[1] is test_image

    def test_json_mode_sets_mime_type(self):
        """Sets response_mime_type when json_mode is True."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"key": "value"}'
        mock_response.candidates = [MagicMock(finish_reason=1)]

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                llm.call_gemini("Return JSON", json_mode=True)

                # Verify GenerationConfig was called with mime type
                mock_genai.GenerationConfig.assert_called_with(
                    max_output_tokens=8000,
                    response_mime_type="application/json"
                )

    def test_empty_candidates_list(self):
        """Handles empty candidates list gracefully."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Response"
        mock_response.candidates = []

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_gemini("Test")

                assert result["status"] == "success"
                assert result["finish_reason"] is None

    def test_token_limit_in_exception_message(self):
        """Detects token limit from exception message containing finish_reason: 2."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("Error with finish_reason: 2")
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_gemini("Test")

                assert result["status"] == "token_limit"
                assert result["finish_reason"] == 2


class TestCallVLM:
    """Test call_vlm convenience wrapper."""

    def test_calls_gemini_with_image_parameter(self):
        """call_vlm passes image to call_gemini."""
        from PIL import Image

        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Vision response"
        mock_response.candidates = [MagicMock(finish_reason=1)]

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        test_image = Image.new('RGB', (50, 50), color='blue')

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_vlm("Describe", test_image)

                assert result["status"] == "success"
                # Verify image was in the call
                call_args = mock_model.generate_content.call_args[0][0]
                assert call_args[1] is test_image


class TestCallTextLLM:
    """Test call_text_llm convenience wrapper."""

    def test_calls_gemini_without_image(self):
        """call_text_llm calls gemini without an image."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Text response"
        mock_response.candidates = [MagicMock(finish_reason=1)]

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                result = llm.call_text_llm("Test prompt")

                assert result["status"] == "success"
                # Verify only prompt was passed (no image)
                call_args = mock_model.generate_content.call_args[0][0]
                assert len(call_args) == 1
                assert call_args[0] == "Test prompt"

    def test_uses_default_max_tokens_of_4000(self):
        """call_text_llm uses 4000 max_tokens by default."""
        mock_genai = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Response"
        mock_response.candidates = [MagicMock(finish_reason=1)]

        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        with patch.dict(sys.modules, {'google.generativeai': mock_genai, 'google': MagicMock()}):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._gemini_model = None
                llm.genai = mock_genai

                llm.call_text_llm("Test")

                # Verify GenerationConfig was called with 4000 tokens
                mock_genai.GenerationConfig.assert_called_with(max_output_tokens=4000)
