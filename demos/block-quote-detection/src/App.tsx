import { useCallback, useEffect, useRef, useState } from "react";

// =============================
// Types
// =============================

type DetectionMode = "styleId" | "styleProperties";

type DocApi = {
  blocks?: { list?: (opts: { nodeTypes: string[] }) => { blocks: Array<{ nodeId: string; styleId?: string }> } };
  getNode?: (opts: { kind: string; nodeType: string; nodeId: string }) => { node: Record<string, unknown> };
};

interface BlockQuoteResult {
  nodeId: string;
  styleId?: string;
  styleRef?: string;
  textSnippet: string;
  properties?: {
    leftIndent?: number;
    leftBorderStyle?: string;
    leftBorderColor?: string;
  };
}

// =============================
// Helpers
// =============================

function truncate(text: string, maxLength = 60): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + "...";
}

function extractTextFromNode(node: Record<string, unknown>): string {
  const paragraph = node.paragraph as Record<string, unknown> | undefined;
  const inlines = paragraph?.inlines as Array<{ kind: string; run?: { text?: string } }> | undefined;

  if (Array.isArray(inlines)) {
    return inlines
      .filter((inline) => inline.kind === "run" && inline.run?.text)
      .map((inline) => inline.run!.text!)
      .join("");
  }

  return "";
}

function extractStyleRef(node: Record<string, unknown>): string | undefined {
  const paragraph = node.paragraph as Record<string, unknown> | undefined;
  return paragraph?.styleRef as string | undefined;
}

function extractBlockQuoteProperties(node: Record<string, unknown>): BlockQuoteResult["properties"] {
  const paragraph = node.paragraph as Record<string, unknown> | undefined;
  const props = (paragraph?.props ?? {}) as Record<string, unknown>;
  const indent = props.indent as Record<string, unknown> | undefined;
  const borders = props.borders as Record<string, unknown> | undefined;
  const leftBorder = borders?.left as Record<string, unknown> | undefined;

  return {
    leftIndent: indent?.left as number | undefined,
    leftBorderStyle: leftBorder?.val as string | undefined,
    leftBorderColor: leftBorder?.color as string | undefined,
  };
}

// =============================
// Block quote heuristics
// =============================

function isBlockQuoteByStyleId(node: Record<string, unknown>): boolean {
  const QUOTE_STYLES = ["Quote", "IntenseQuote", "BlockQuote"];
  const paragraph = node.paragraph as Record<string, unknown> | undefined;
  const styleRef = paragraph?.styleRef as string | undefined;
  return Boolean(styleRef && QUOTE_STYLES.some((s) => styleRef.includes(s)));
}

function isBlockQuoteByProperty(node: Record<string, unknown>): boolean {
  const paragraph = node.paragraph as Record<string, unknown> | undefined;
  const props = (paragraph?.props ?? {}) as Record<string, unknown>;
  const indent = props.indent as Record<string, unknown> | undefined;
  const borders = props.borders as Record<string, unknown> | undefined;

  const leftBorder = borders?.left as Record<string, unknown> | undefined;
  const hasIndent = (indent?.left as number) > 500;
  const hasLeftBorder = !["nil", "none", undefined].includes(leftBorder?.val as string | undefined);

  return [hasIndent, hasLeftBorder].every(Boolean);
}

// =============================
// Block quote finder
// =============================

function findBlockQuotes(doc: DocApi, mode: DetectionMode): string {
  if (!doc?.blocks?.list || !doc?.getNode) {
    return "Document API not available. Make sure a document is loaded.";
  }

  const heuristic = mode === "styleId" ? isBlockQuoteByStyleId : isBlockQuoteByProperty;
  const { blocks } = doc.blocks.list({ nodeTypes: ["paragraph"] });
  const found: BlockQuoteResult[] = [];

  for (const block of blocks) {
    const { node } = doc.getNode({ kind: "block", nodeType: "paragraph", nodeId: block.nodeId });
    if (heuristic(node)) {
      const text = extractTextFromNode(node).trim();
      if (text) {
        found.push({
          nodeId: block.nodeId,
          styleId: block.styleId,
          styleRef: extractStyleRef(node),
          textSnippet: truncate(text),
          properties: extractBlockQuoteProperties(node),
        });
      }
    }
  }

  const formatResult = (r: BlockQuoteResult) => {
    if (mode === "styleId") {
      return `  - "${r.textSnippet}"\n      styleRef: ${r.styleRef || "none"}`;
    }
    const parts: string[] = [];
    if (r.properties?.leftIndent) parts.push(`leftIndent: ${r.properties.leftIndent} twips`);
    if (r.properties?.leftBorderStyle) parts.push(`leftBorder: ${r.properties.leftBorderStyle}${r.properties.leftBorderColor ? ` (${r.properties.leftBorderColor})` : ""}`);
    return `  - "${r.textSnippet}"\n      ${parts.length ? parts.join(", ") : "none"}`;
  };

  const label = mode === "styleId" ? "style ID" : "style properties";
  return found.length
    ? `Found ${found.length} block quote(s) by ${label}:\n${found.map(formatResult).join("\n")}`
    : `No block quotes found by ${label}.`;
}

// =============================
// App
// =============================

const DEFAULT_DOC_PATH = "/quote-detection-tester.docx";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string>("");

  // Load default document on mount
  useEffect(() => {
    const loadDefaultDoc = async () => {
      try {
        const response = await fetch(DEFAULT_DOC_PATH);
        if (!response.ok) throw new Error("Failed to fetch default document");
        const blob = await response.blob();
        const defaultFile = new File([blob], "quote-detection-tester.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        setFile(defaultFile);
      } catch (err) {
        console.error("Failed to load default document:", err);
      }
    };
    loadDefaultDoc();
  }, []);

  // Initialize SuperDoc when file changes
  useEffect(() => {
    if (!file || !containerRef.current) return;

    let instance: { destroy?: () => void } | null = null;

    const init = async () => {
      setLoading(true);
      setResults("");

      const { SuperDoc } = await import("superdoc");

      containerRef.current!.innerHTML = "";

      instance = new SuperDoc({
        selector: containerRef.current,
        document: file,
      });

      editorRef.current = instance;
      setLoading(false);
    };

    init().catch((err) => {
      console.error("Failed to initialize SuperDoc:", err);
      setLoading(false);
      setResults(`Error: ${err.message}`);
    });

    return () => {
      instance?.destroy?.();
      editorRef.current = null;
    };
  }, [file]);

  const getDocApi = useCallback((): DocApi | null => {
    const instance = editorRef.current as Record<string, unknown> | null;
    if (!instance) return null;

    const editor = (instance.activeEditor ?? instance.editor ?? instance.view ?? instance.instance) as Record<string, unknown> | undefined;
    return editor?.doc as DocApi | undefined ?? null;
  }, []);

  const handleFindBlockQuotes = useCallback((mode: DetectionMode) => {
    const doc = getDocApi();
    if (!doc) {
      setResults("Document API not available. Make sure a document is loaded.");
      return;
    }
    setResults(findBlockQuotes(doc, mode));
  }, [getDocApi]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header style={{ padding: "1rem", borderBottom: "1px solid #ddd", background: "#f5f5f5" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Block Quote Detection Demo</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#666", fontSize: "0.875rem" }}>
          Load a DOCX file and detect block quotes using style ID or style properties.
        </p>
      </header>

      <div style={{ padding: "1rem", borderBottom: "1px solid #ddd", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept=".docx"
          onChange={handleFileChange}
          style={{ flex: "0 0 auto" }}
        />
        <button onClick={() => handleFindBlockQuotes("styleId")} disabled={!file || loading} style={buttonStyle}>
          Find by Style ID
        </button>
        <button onClick={() => handleFindBlockQuotes("styleProperties")} disabled={!file || loading} style={buttonStyle}>
          Find by Style Properties
        </button>
      </div>

      {results && (
        <div style={{ padding: "1rem", borderBottom: "1px solid #ddd", background: "#fafafa" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.875rem" }}>
            {results}
          </pre>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)" }}>
            Loading...
          </div>
        )}
        {!file && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
            Select a DOCX file to get started
          </div>
        )}
        <div ref={containerRef} style={{ height: "100%", maxWidth: 900, margin: "0 auto" }} />
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.875rem",
};
