# SuperDoc: Node.js Example

A headless Node.js example using SuperDoc's Editor class with Express.

> Requires Node >= 20. Earlier versions are missing the `File` object. If you must use Node < 20, see the file polyfill in this example.

## Quick start

```bash
npm install && npm run dev
```

Runs an Express server at `http://localhost:3000` with a single root endpoint that returns a `.docx` file.

## Usage

```
# Returns the unchanged .docx template
http://localhost:3000

# Insert text
http://localhost:3000?text=hello world!

# Insert HTML
http://localhost:3000?html=<p>I am a paragraph</p><p><strong>I AM BOLD!</strong></p>
```

## Additional docs

See the [SuperDoc docs](https://docs.superdoc.dev/core/supereditor/methods) for all available editor commands and hooks.
