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


class TestGetClient:
    """Test _get_client function."""

    def test_raises_without_api_key(self):
        """Raises ValueError when no API key is set."""
        with patch.dict('os.environ', {}, clear=True):
            # Force fresh import
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = None

            with pytest.raises(ValueError, match="GEMINI_API_KEY or GOOGLE_API_KEY"):
                llm._get_client()

    def test_uses_gemini_api_key(self):
        """Uses GEMINI_API_KEY environment variable."""
        mock_openai = MagicMock()
        mock_client = MagicMock()
        mock_openai.return_value = mock_client

        with patch('llm.OpenAI', mock_openai):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}, clear=True):
                with patch('llm.cfg') as mock_cfg:
                    # Disable Helicone to test direct Gemini connection
                    mock_cfg.HELICONE_ENABLED = False
                    mock_cfg.HELICONE_API_KEY = None

                    if 'llm' in sys.modules:
                        del sys.modules['llm']
                    import llm
                    llm._openai_client = None
                    llm.OpenAI = mock_openai
                    llm.cfg = mock_cfg

                    result = llm._get_client()

                    mock_openai.assert_called_once()
                    call_kwargs = mock_openai.call_args[1]
                    assert call_kwargs['api_key'] == 'test-key'
                    assert 'generativelanguage.googleapis.com' in call_kwargs['base_url']
                    assert result is mock_client

    def test_uses_google_api_key_fallback(self):
        """Falls back to GOOGLE_API_KEY if GEMINI_API_KEY is not set."""
        mock_openai = MagicMock()
        mock_client = MagicMock()
        mock_openai.return_value = mock_client

        with patch('llm.OpenAI', mock_openai):
            with patch.dict('os.environ', {'GOOGLE_API_KEY': 'google-key'}, clear=True):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._openai_client = None
                llm.OpenAI = mock_openai

                llm._get_client()

                call_kwargs = mock_openai.call_args[1]
                assert call_kwargs['api_key'] == 'google-key'

    def test_returns_singleton(self):
        """Returns the same client instance on subsequent calls."""
        mock_openai = MagicMock()
        mock_client = MagicMock()
        mock_openai.return_value = mock_client

        with patch('llm.OpenAI', mock_openai):
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                import llm
                llm._openai_client = None
                llm.OpenAI = mock_openai

                result1 = llm._get_client()
                result2 = llm._get_client()

                assert result1 is result2
                # OpenAI constructor should only be called once
                assert mock_openai.call_count == 1

    def test_helicone_enabled_adds_headers(self):
        """When Helicone is enabled, adds Helicone headers."""
        mock_openai = MagicMock()
        mock_client = MagicMock()
        mock_openai.return_value = mock_client

        with patch('llm.OpenAI', mock_openai):
            with patch.dict('os.environ', {
                'GEMINI_API_KEY': 'test-key',
                'HELICONE_API_KEY': 'helicone-key',
                'HELICONE_ENABLED': 'true'
            }, clear=True):
                if 'llm' in sys.modules:
                    del sys.modules['llm']
                if 'config' in sys.modules:
                    del sys.modules['config']
                import llm
                llm._openai_client = None
                llm.OpenAI = mock_openai

                llm._get_client()

                call_kwargs = mock_openai.call_args[1]
                assert 'gateway.helicone.ai' in call_kwargs['base_url']
                assert 'Helicone-Auth' in call_kwargs['default_headers']
                assert call_kwargs['default_headers']['Helicone-Auth'] == 'Bearer helicone-key'


class TestCallGemini:
    """Test call_gemini function."""

    def _create_mock_response(self, content="Generated response", finish_reason="stop"):
        """Helper to create mock OpenAI response."""
        mock_message = MagicMock()
        mock_message.content = content

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = finish_reason

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        return mock_response

    def test_success_response(self):
        """Returns success response with generated text."""
        mock_client = MagicMock()
        mock_response = self._create_mock_response("  Generated response  ", "stop")
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_gemini("Test prompt")

            assert result["status"] == "success"
            assert result["text"] == "Generated response"  # Stripped
            assert result["error"] is None
            assert result["finish_reason"] == "stop"

    def test_token_limit_response(self):
        """Returns token_limit status when max tokens is reached."""
        mock_client = MagicMock()
        mock_response = self._create_mock_response("Partial...", "length")
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_gemini("Test prompt")

            assert result["status"] == "token_limit"
            assert result["finish_reason"] == "length"

    def test_error_response(self):
        """Returns error response when API call fails."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("API error occurred")

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_gemini("Test prompt")

            assert result["status"] == "error"
            assert result["text"] == ""
            assert "API error occurred" in result["error"]

    def test_with_image(self):
        """Passes image as base64 data URL when provided."""
        from PIL import Image

        mock_client = MagicMock()
        mock_response = self._create_mock_response("Image description", "stop")
        mock_client.chat.completions.create.return_value = mock_response

        test_image = Image.new('RGB', (100, 100), color='red')

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            llm.call_gemini("Describe this", image=test_image)

            # Verify create was called with image content
            call_kwargs = mock_client.chat.completions.create.call_args[1]
            messages = call_kwargs['messages']
            assert len(messages) == 1
            content = messages[0]['content']
            assert len(content) == 2
            assert content[0]['type'] == 'text'
            assert content[0]['text'] == 'Describe this'
            assert content[1]['type'] == 'image_url'
            assert content[1]['image_url']['url'].startswith('data:image/jpeg;base64,')

    def test_json_mode_sets_response_format(self):
        """Sets response_format when json_mode is True."""
        mock_client = MagicMock()
        mock_response = self._create_mock_response('{"key": "value"}', "stop")
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            llm.call_gemini("Return JSON", json_mode=True)

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            assert call_kwargs['response_format'] == {'type': 'json_object'}

    def test_empty_content_returns_empty_string(self):
        """Handles None content gracefully."""
        mock_client = MagicMock()
        mock_response = self._create_mock_response(None, "stop")
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_gemini("Test")

            assert result["status"] == "success"
            assert result["text"] == ""

    def test_token_limit_in_exception_message(self):
        """Detects token limit from exception message."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("Error: exceeded token limit")

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_gemini("Test")

            assert result["status"] == "token_limit"
            assert result["finish_reason"] == "length"


class TestCallVLM:
    """Test call_vlm convenience wrapper."""

    def test_calls_gemini_with_image_parameter(self):
        """call_vlm passes image to call_gemini."""
        from PIL import Image

        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "Vision response"
        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response

        test_image = Image.new('RGB', (50, 50), color='blue')

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_vlm("Describe", test_image)

            assert result["status"] == "success"
            # Verify image was in the call
            call_kwargs = mock_client.chat.completions.create.call_args[1]
            content = call_kwargs['messages'][0]['content']
            assert any(item['type'] == 'image_url' for item in content)


class TestCallTextLLM:
    """Test call_text_llm convenience wrapper."""

    def test_calls_gemini_without_image(self):
        """call_text_llm calls gemini without an image."""
        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "Text response"
        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            result = llm.call_text_llm("Test prompt")

            assert result["status"] == "success"
            # Verify only text content was passed (no image)
            call_kwargs = mock_client.chat.completions.create.call_args[1]
            messages = call_kwargs['messages']
            assert len(messages) == 1
            assert messages[0]['content'] == "Test prompt"

    def test_uses_text_max_tokens_default(self):
        """call_text_llm uses LLM_MAX_TOKENS_TEXT (4000) by default."""
        mock_client = MagicMock()
        mock_message = MagicMock()
        mock_message.content = "Response"
        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm
            llm._openai_client = mock_client

            llm.call_text_llm("Test")

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            assert call_kwargs['max_tokens'] == 4000


class TestImageToBase64:
    """Test _image_to_base64 helper function."""

    def test_converts_rgb_image(self):
        """Converts RGB image to base64 data URL."""
        from PIL import Image

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm

            test_image = Image.new('RGB', (10, 10), color='red')
            result = llm._image_to_base64(test_image)

            assert result.startswith('data:image/jpeg;base64,')
            assert len(result) > 30  # Has actual base64 content

    def test_converts_rgba_to_rgb(self):
        """Converts RGBA image to RGB before encoding."""
        from PIL import Image

        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-key'}):
            if 'llm' in sys.modules:
                del sys.modules['llm']
            import llm

            test_image = Image.new('RGBA', (10, 10), color=(255, 0, 0, 128))
            result = llm._image_to_base64(test_image)

            assert result.startswith('data:image/jpeg;base64,')
