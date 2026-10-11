import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Cambiar esta clave reinicia el boundary (p.ej. al cambiar de ruta) */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Evita que un error de render deje la pagina en blanco.
 * Muestra un mensaje y permite reintentar.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de render:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center" role="alert">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Ocurrió un error al mostrar esta página</h2>
          <p className="text-sm text-gray-600 mb-4">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
