/** Transitions désactivées — rendu immédiat (site allégé). */
export function PageTransition({ children, transitionKey }) {
  return <div key={transitionKey ?? "page"}>{children}</div>;
}

export function FadeIn({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function SlideUp({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function ScaleIn({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}
