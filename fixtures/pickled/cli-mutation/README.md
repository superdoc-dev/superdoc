# CLI mutation fixture

Create `scripts/update-contract.sh`.

Required:

- Create the `scripts` directory if it does not exist.
- Make `scripts/update-contract.sh` executable.
- Use `set -euo pipefail`.
- Open `./contract.docx` with `superdoc open`.
- Use `superdoc query match --select-json ... --require exactlyOne` to get a mutation-grade target.
- Mutate with `superdoc replace` using the query target.
- Save in place with `superdoc save --in-place`.
- Close the session with `superdoc close`.

Do not use `superdoc find` as a mutation target.
Do not use `replace-legacy`.
Do not answer with instructions only. Modify the workspace.
