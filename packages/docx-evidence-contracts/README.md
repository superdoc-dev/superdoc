# DOCX Evidence Contracts

Worker-safe public artifact contracts for DOCX render evidence.

This package is deliberately limited to the JSON handshake SuperDoc can emit and
other systems can read:

- document, fragment, render-subject, run, and artifact identities
- source refs and source anchors
- minimal comparison observations
- minimal signature and cluster records
- deterministic stable ID helpers
- Zod validators for the public shapes

This package must stay free of runtime implementation and product policy. Do not
add report generation, analysis heuristics, persistence workflows, reduction
workflows, internal feature maps, Labs service internals, SuperDoc renderer
internals, filesystem APIs, process APIs, artifact-store clients, or network
clients.

Richer DOCX analysis contracts and implementation details belong in private
internal packages. SuperDoc should only publish the narrow evidence shapes needed
for interoperability.
