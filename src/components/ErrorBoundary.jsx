import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur capturée par ErrorBoundary:", error, errorInfo);
    
    // Si c'est une erreur de chargement de module, essayer de recharger la page
    if (error?.message?.includes("Failed to fetch dynamically imported module") || 
        error?.message?.includes("Expected a JavaScript-or-Wasm module script")) {
      console.warn("Erreur de chargement de module détectée, rechargement de la page dans 2 secondes...");
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#070d1f] text-white p-4">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <h2 className="text-xl font-bold">Erreur de chargement</h2>
            </div>
            <p className="text-gray-300 mb-4">
              Une erreur s'est produite lors du chargement de la page. La page va se recharger automatiquement...
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Recharger maintenant
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

