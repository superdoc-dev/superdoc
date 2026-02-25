"""
Failing tests that expose: _parse_envelope masks real CLI errors.

When stdout contains non-JSON noise (telemetry, warnings, debug output) and
stderr contains the actual error message, _parse_envelope uses `stdout or stderr`
which picks stdout (truthy non-empty string), never sees stderr, and raises a
generic JSON_PARSE_ERROR instead of surfacing the real error.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from superdoc.runtime import _parse_envelope
from superdoc.errors import SuperDocError


class TestParseEnvelopeSurfacesStderrErrors:
    """These tests FAIL because _parse_envelope ignores stderr when stdout is non-empty."""

    def test_stderr_error_not_masked_when_stdout_has_noise(self):
        """
        Bug: When the CLI prints telemetry/noise to stdout and the real error to
        stderr, _parse_envelope picks stdout (because `stdout or stderr` returns
        stdout when it's truthy), fails to parse it as JSON, and raises a generic
        JSON_PARSE_ERROR — masking the real error message in stderr.

        Expected: The error from stderr should be surfaced, not a generic parse error.
        """
        stdout = "Telemetry: initialized in 42ms\nSome debug noise\n"
        stderr = '{"ok": false, "error": {"code": "FILE_NOT_FOUND", "message": "Document not found: contract.docx"}, "meta": {"version": "1.0.0"}}'

        # This SHOULD return the parsed stderr envelope with the real error.
        # Instead, it raises JSON_PARSE_ERROR because it only looks at stdout.
        result = _parse_envelope(stdout, stderr)

        assert result['ok'] is False
        assert result['error']['code'] == 'FILE_NOT_FOUND'
        assert 'contract.docx' in result['error']['message']

    def test_stderr_error_accessible_when_stdout_is_partial_json(self):
        """
        Bug: stdout contains a partial/corrupt JSON object (e.g. truncated output),
        stderr contains the real error envelope. _parse_envelope tries to parse
        stdout, fails, and never falls back to stderr.

        Expected: Should try stderr when stdout parsing fails.
        """
        stdout = '{"ok": true, "data": {"coun'  # truncated
        stderr = '{"ok": false, "error": {"code": "TIMEOUT", "message": "Operation timed out after 30000ms"}, "meta": {"version": "1.0.0"}}'

        result = _parse_envelope(stdout, stderr)

        assert result['ok'] is False
        assert result['error']['code'] == 'TIMEOUT'

    def test_real_error_code_preserved_not_replaced_with_json_parse_error(self):
        """
        Bug: Even when the real error is available in stderr, the raised exception
        always has code='JSON_PARSE_ERROR' because _parse_envelope never looks at
        stderr when stdout is non-empty.

        Expected: The exception should carry the real error code from stderr.
        """
        stdout = "Warning: deprecated API version\n"
        stderr = '{"ok": false, "error": {"code": "VALIDATION_ERROR", "message": "Invalid query: missing required field select"}, "meta": {"version": "1.0.0"}}'

        # _parse_envelope should NOT raise here — it should return the stderr envelope.
        # But because it only looks at stdout, it raises JSON_PARSE_ERROR.
        try:
            result = _parse_envelope(stdout, stderr)
            # If we get here, verify we got the right error
            assert result['error']['code'] == 'VALIDATION_ERROR'
        except SuperDocError as exc:
            # This is the bug: we get JSON_PARSE_ERROR instead of the real error
            pytest.fail(
                f"_parse_envelope raised JSON_PARSE_ERROR instead of returning the "
                f"stderr envelope. Got code='{exc.code}', but stderr contains "
                f"VALIDATION_ERROR. The real CLI error is masked."
            )
