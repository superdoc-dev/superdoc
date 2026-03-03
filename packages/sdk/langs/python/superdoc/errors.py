"""SuperDoc SDK error types and host transport error codes."""

# Host transport error codes — used by transport.py and protocol.py.
HOST_DISCONNECTED = 'HOST_DISCONNECTED'
HOST_TIMEOUT = 'HOST_TIMEOUT'
HOST_QUEUE_FULL = 'HOST_QUEUE_FULL'
HOST_HANDSHAKE_FAILED = 'HOST_HANDSHAKE_FAILED'
HOST_PROTOCOL_ERROR = 'HOST_PROTOCOL_ERROR'

# JSON-RPC error code emitted by the CLI for operation timeouts.
JSON_RPC_TIMEOUT_CODE = -32011


class SuperDocError(Exception):
    def __init__(self, message: str, code: str, details=None, exit_code=None):
        super().__init__(message)
        self.code = code
        self.details = details
        self.exit_code = exit_code
