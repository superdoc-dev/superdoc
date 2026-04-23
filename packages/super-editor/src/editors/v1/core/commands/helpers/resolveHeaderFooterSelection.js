export function resolveHeaderFooterSelection({ tr }) {
  // Keep selection resolution centralized here so header/footer-specific fallback
  // logic can be reintroduced in one place if we need it again.
  return tr?.selection;
}
