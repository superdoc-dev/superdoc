# Graphics Rendering Support Matrix

Status meanings:

| Status | Meaning |
|---|---|
| Supported | Expected to render through the current pipeline with typed data and meaningful tests. |
| Partial | Some common cases render, but coverage, fidelity, or edge cases are incomplete. |
| Preserved only | Original OOXML/media is preserved or passed through for export, but visual rendering is incomplete or absent. |
| Not supported | No meaningful current rendering support. |
| Unknown | Needs a fixture or code audit before assigning a stronger status. |

## DOCX Fixture Coverage

The fixture coverage belongs in this matrix, not in a separate manifest. A row
is "covered" only when a DOCX fixture exists and we have a test or documented
inspection that ties the fixture to a support claim.

Current real fixtures in `packages/layout-engine/test-fixtures/shapes/`:

| Fixture | Status | Covers | Coverage gap |
|---|---|---|---|
| `basic-vector-shapes.docx` | Existing | Basic DrawingML vector shape import/render scenarios. | Needs documented feature inventory: exact presets, fills, strokes, transforms, and expected render outcomes. |
| `vectors.docx` | Existing | DrawingML vector shape scenarios. | Needs documented feature inventory and failure-stage notes. |
| `graphics-images.docx` | Existing | Inline images, crop, alpha, luminance, grayscale, alt text, hyperlink. | Needs importer/layout assertions that prove each image property survives into typed layout data. |
| `graphics-anchored-images.docx` | Existing | Page/margin/column/paragraph anchors, wrap modes, behind-doc, z-order. | Needs layout assertions for resolved coordinates, flow reservation, and layering. |
| `graphics-shapes-basic.docx` | Existing | Rect, ellipse, line, arrows, solid fill, no fill, stroke width/color, rotation, flip. | Needs adapter/painter assertions for each shape property. |
| `graphics-textboxes.docx` | Existing | DrawingML textbox text, multiline text, insets, alignment, PAGE field. | Needs adapter/painter assertions for hydrated textbox content and field rendering. |
| `graphics-groups.docx` | Existing | Grouped vector children, image children, nested transforms, child rotation/flip. | Needs adapter/painter assertions for child coordinate transforms and group layering. |
| `graphics-header-footer.docx` | Existing | Header/footer images and drawings, behind-doc objects, negative offsets, z-order. | Needs layout assertions for non-body story placement and layer ordering. |
| `graphics-vml-watermarks.docx` | Existing | VML text watermark, VML image watermark, washout/brightness, round-trip preservation. | LibreOffice render does not visibly paint the VML watermark; use source/import assertions rather than visual-only checks. |
| `graphics-shapes-advanced.docx` | Existing | Custom geometry, gradient fill, dashed stroke, arrowhead variants, theme colors. | Needs assertions for which advanced properties are supported versus preserved/dropped. |
| `graphics-charts.docx` | Existing | Bar chart and pie chart DrawingML references with chart parts. | LibreOffice render is simplified; needs import assertions for parsed `ChartDrawing.chartData`. |
| `graphics-passthrough.docx` | Existing | SmartArt/diagram-like and OLE-like unsupported drawing payloads. | Intentionally not visually rendered; should assert passthrough preservation and fallback/diagnostic behavior. |

## Image Media

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| Inline raster images | Supported | Inline images are imported into image nodes, projected to layout data, measured, and painted as image DOM. | Phase 0 still needs fixture notes for full import-to-paint coverage. |
| Block raster images | Supported | Block image fragments are measured, laid out, and painted with image metadata. | More fixture coverage needed for unusual sizing and object-fit cases. |
| DrawingML image drawings | Partial | `ImageDrawing` exists and DomPainter renders drawing images through the shared image renderer. | Needs fixture proof for all anchor/wrap combinations. |
| Anchored images | Partial | Anchor data supports page, margin, column, and paragraph-relative placement. | Tight parity with Word positioning is not proven for every relative/align combination. |
| Header/footer images | Partial | Header/footer rendering keeps images targetable and supports some behind-doc cases. | Needs systematic fixtures for header/footer variants and negative offsets. |
| Behind-document images | Partial | Z-index normalization and `behindDoc` plumbing exist. | Needs layered fixture proof with body text, headers, and footers. |
| Image crop / clip path | Partial | Clip path helpers and painter application exist. | Needs DOCX fixture proving OOXML crop survives import/projection/paint. |
| Image opacity / alpha | Partial | DrawingML alpha handling is tested in painter paths. | Import-path coverage is incomplete. |
| Image luminance / washout | Partial | DrawingML luminance and VML watermark adjustments have targeted tests. | Needs fixture comparison against Word-like output. |
| Grayscale images | Partial | Contract field exists. | Need confirmation that import and paint paths cover all supported image contexts. |
| Image hyperlink | Partial | Image hyperlink metadata and anchor wrapping exist. | Needs fixture coverage across inline, block, and anchored images. |
| Decorative images / alt text | Partial | Export helpers understand decorative and description metadata. | Rendering/accessibility behavior needs fixture audit. |
| EMF / WMF display | Partial | EMF/WMF conversion helpers exist and export can prefer original media. | Rendering fidelity and fallback behavior need fixtures. |
| SVG image media | Unknown | General image pipeline can display image sources. | Need fixture for DOCX SVG media, sanitization expectations, and export preservation. |
| Animated images | Not supported | No explicit pipeline support. | Animated playback/control is outside current document rendering semantics. |

## Vector Shapes

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| DrawingML preset shapes | Partial | `VectorShapeDrawing` and preset SVG rendering exist. Existing fixtures: `basic-vector-shapes.docx`, `vectors.docx`. | Support breadth across all preset geometries is not inventoried. |
| Lines / straight connectors | Partial | Line-like shapes are special-cased to SVG `<line>`. | Complex connector routing is not supported. |
| Dimension-sensitive presets | Partial | Renderer passes width/height to preset shape generation; tests cover arrow aspect-ratio behavior. | Needs DOCX fixture coverage. |
| Custom geometry `a:custGeom` | Partial | Custom path data can be represented and rendered as SVG paths. | Unsupported custom geometry formulas/adjust handles need audit. |
| Solid fill | Partial | Solid fills are normalized and rendered for SVG/CSS fallback paths. | Theme/tint/shade fidelity needs fixture audit. |
| No fill | Partial | Explicit no-fill can render as `none`. | Needs fixture proof across preset and custom geometry. |
| Gradient fill | Partial | Gradient typed data and SVG application exist. | Pattern fills, picture fills, and complex gradient variants are not covered. |
| Pattern fill | Not supported | No clear typed/rendered support found. | Would need contract/import/render design. |
| Picture fill | Not supported | No clear typed/rendered support found. | Would need media relationship handling for shape fills. |
| Stroke color | Partial | Stroke color is normalized and rendered. | Theme color parity needs fixture audit. |
| Stroke width | Partial | Stroke widths, including hairline behavior, are parsed/rendered in helper paths. | Needs fixture proof and browser rendering tolerance. |
| No line / no stroke | Partial | Null stroke can render as no stroke. | Needs fixture proof. |
| Dashed strokes | Unknown | Need audit for `a:prstDash` preservation/rendering. | Likely incomplete unless represented in attrs only. |
| Line ends / arrowheads | Partial | Line-end marker rendering exists for common marker shapes. | Full OOXML head/tail width/length/type fidelity is not proven. |
| Shape rotation | Partial | Geometry rotation affects measurement bounds and paint transform. | Needs fixture proof for standalone and grouped shapes. |
| Horizontal / vertical flip | Partial | Flip fields exist and paint transforms apply. | Needs fixture proof for text, images, and groups. |
| Effect extents | Partial | Effect extents are represented and used in shape metrics. | Visual effects themselves, such as shadows/glows, are not fully rendered. |
| Shadows / glow / soft edges / 3D | Not supported | No full visual effects renderer. | Would need new typed effect data and SVG/CSS rendering strategy. |

## Shape Text And Textboxes

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| Basic shape text | Partial | Shape text content is represented as text parts and painted in fallback/WordArt paths. | Full DrawingML text body semantics are incomplete. |
| Textbox shapes | Partial | `TextboxDrawing` exists with text content and hydrated paragraph `contentBlocks`. | Needs fixture coverage for nested content and overflow behavior. |
| Multiline textbox text | Partial | Line breaks and paragraph-like parts are represented. | Exact Word paragraph spacing and wrapping parity needs audit. |
| Text insets | Partial | Insets are normalized and used in painting. | Needs fixture proof for DrawingML and VML sources. |
| Vertical text alignment | Partial | Top/center/bottom alignment is represented. | More OOXML anchor variants need audit. |
| Horizontal text alignment | Partial | Left/center/right is represented in text content/rendering. | Full paragraph/run formatting parity is incomplete. |
| Run formatting in shape text | Partial | Bold, italic, color, font family, font size, and letter spacing have partial support. | Underline, highlight, complex scripts, bidi, and advanced typography need audit. |
| PAGE / NUMPAGES fields in shape text | Partial | Field tokens are resolved during paint for supported parts. | More fields and nested field structures are not supported. |
| Inline images inside textbox text | Partial | Text parts can carry image data and render inline images. | Needs fixture proof through import/projection/paint. |
| Lists inside textboxes | Unknown | Textbox content blocks can be paragraphs. | Need fixture audit for list conversion and rendering inside textboxes. |
| Tables inside textboxes | Not supported | `TextboxDrawing.contentBlocks` is typed as paragraph blocks. | Would require broader nested block support. |
| WordArt text | Partial | WordArt-specific SVG text rendering exists for supported `isWordArt` cases. | WordArt transforms/effects are not fully implemented. |
| Text path / warped text | Not supported | No complete text-on-path/warp renderer. | Would require dedicated SVG text-path/warp support. |

## Groups, Charts, And Complex Graphics

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| Shape groups | Partial | `ShapeGroupDrawing` exists and DomPainter renders grouped children. | Nested transform fidelity needs fixture proof. |
| Vector children in groups | Partial | Group child vector shapes can render. | Per-child advanced fills/effects need audit. |
| Image children in groups | Partial | Group image children can render with image clip/opacity. | Media relationship coverage needs fixture proof. |
| Nested groups | Unknown | Need audit of import/projection behavior. | May require recursive group support if absent. |
| Per-child rotation/flip in groups | Partial | Child attrs carry geometry fields. | Needs fixture proof. |
| Charts: bar/column | Partial | `ChartDrawing` and SVG chart rendering exist. | Word chart fidelity, styling, labels, axes, and legends are simplified. |
| Charts: line/area/scatter/bubble/radar/pie/doughnut | Partial | Renderer has routes for common chart types. | Rendering is simplified and needs fixture-based support notes. |
| Unsupported chart types | Partial | Placeholder/fallback behavior exists. | Need explicit unsupported-type list and export expectations. |
| SmartArt / diagrams | Preserved only | Unhandled drawings can become passthrough for round-trip. | No faithful visual rendering. |
| Embedded OLE objects | Not supported | No meaningful renderer found. | Would need preview image/fallback strategy. |
| Equations as graphics | Unknown | Math has separate rendering paths. | Need audit for equation objects embedded as drawings. |

## VML And Legacy Graphics

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| VML text watermarks | Partial | Import/export tests exist and generated SVG image rendering is used for text watermarks. | Needs layout fixture for header/footer and behind-doc behavior. |
| VML image watermarks | Partial | Image watermark import/export helpers exist. | Needs display fixture for washout/brightness and original VML preservation. |
| VML textboxes | Partial | Shape textbox import/export helpers exist. | General VML textbox fidelity needs audit. |
| VML rectangles | Partial | Targeted helper/tests exist. | General VML shape family support is incomplete. |
| VML shape containers | Partial | Translator helpers preserve/translate some shape containers. | Unsupported VML children need inventory. |
| General VML shape rendering | Partial | Some VML shapes are converted into image/shape/textbox paths. | Broad VML parity is not supported. |
| VML round-trip preservation | Partial | Many helpers preserve original attributes for export. | Need fixture list for what is preserved versus reconstructed. |

## Placement, Wrapping, And Layering

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| Inline graphic placement | Supported | Inline images/drawings participate in flow layout. | Needs fixture notes for mixed text/image runs. |
| Block graphic placement | Supported | Block images/drawings produce layout fragments. | Edge cases around zero dimensions and very large graphics need fixture notes. |
| Page-relative anchors | Partial | Shared graphic placement helpers support page-relative positioning. | Needs fixture proof against Word output. |
| Margin-relative anchors | Partial | Shared helpers support margin-relative positioning. | Needs fixture proof. |
| Column-relative anchors | Partial | Helpers honor authored per-column origins. | Per-column object measurement remains limited. |
| Paragraph-relative anchors | Partial | Layout can attach anchored graphics to paragraph context. | Paragraphless fallback and first-line alignment need more fixtures. |
| `wrapNone` / floating graphics | Partial | Floating drawings can bypass content width constraints. | Text overlap behavior needs fixture proof. |
| Square wrap | Partial | Wrap metadata is represented. | Need fixture proof for text exclusion behavior. |
| Tight / through wrap | Partial | Wrap polygon metadata can be represented. | Full Word-equivalent text exclusion is not proven. |
| Top and bottom wrap | Partial | Wrap type can be represented. | Needs fixture proof. |
| Wrap side selection | Partial | `wrapText` values can be represented. | Needs layout fidelity audit. |
| Z-order | Partial | Relative height / z-index normalization exists. | Needs layered fixture with images, shapes, charts, and text. |
| Behind-document layering | Partial | `behindDoc` metadata exists and affects z-index. | Needs systematic body/header/footer fixtures. |
| Graphics in tables | Partial | Table rendering accepts drawing content callbacks and nested measures. | Needs fixtures for anchored graphics and textboxes inside cells. |
| Graphics in footnotes | Partial | Layout has atomic drawing/image handling in footnote-related paths. | Needs fixture proof. |

## Security And Fallbacks

| Feature | Status | Current support | Not supported / gaps |
|---|---|---|---|
| SVG sanitization for generated/parsed shape SVG | Partial | DomPainter strips scripts and event-handler attributes from parsed SVG. | Needs fixture/test coverage for external SVG image media separately. |
| Unsupported drawing passthrough | Partial | Unhandled `w:drawing` can be preserved as passthrough for export. | User-visible placeholder/diagnostic behavior needs definition. |
| Error placeholder on paint failure | Supported | DomPainter catches drawing render failures and returns an error placeholder. | Need diagnostics that identify source feature and failure stage. |
| Import diagnostics for unsupported graphics | Not supported | No dedicated graphics support report exists. | Phase 0 should add or document diagnostics before broad phase 1 work. |
