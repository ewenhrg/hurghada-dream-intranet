import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Composant pour gérer les transitions de page avec animations
 */
export function PageTransition({ children }) {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("entering");

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage("exiting");
    }
  }, [location, displayLocation]);

  useEffect(() => {
    if (transitionStage === "exiting") {
      const timer = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage("entering");
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [transitionStage, location]);

  return (
    <div
      className={transitionStage === "exiting" ? "opacity-0" : "animate-page-enter"}
      style={{
        transition: transitionStage === "exiting" ? "opacity 0.2s ease-in" : "none",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Wrapper pour les éléments avec animation d'apparition
 */
export function FadeIn({ children, delay = 0, className = "" }) {
  return (
    <div
      className={`animate-fade-in ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Wrapper pour les éléments avec animation slide-up
 */
export function SlideUp({ children, delay = 0, className = "" }) {
  return (
    <div
      className={`animate-slide-up ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Wrapper pour les éléments avec animation scale-in
 */
export function ScaleIn({ children, delay = 0, className = "" }) {
  return (
    <div
      className={`animate-scale-in ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}

