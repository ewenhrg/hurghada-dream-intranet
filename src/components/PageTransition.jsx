/** Transition désactivée (site allégé) — rendu immédiat. */
export function PageTransition({ children, transitionKey }) {
  return <div key={transitionKey ?? "page"}>{children}</div>;
}
