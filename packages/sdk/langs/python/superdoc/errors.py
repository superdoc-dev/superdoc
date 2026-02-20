class SuperDocError(Exception):
    def __init__(self, message: str, code: str, details=None, exit_code=None):
        super().__init__(message)
        self.code = code
        self.details = details
        self.exit_code = exit_code
