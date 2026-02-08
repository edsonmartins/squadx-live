'use client';

import React, { useState, useCallback } from 'react';
import {
  GitBranch,
  X,
  Play,
  AlertCircle,
  Loader2,
  Code2,
  Lightbulb,
} from 'lucide-react';

interface MermaidImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (mermaidCode: string) => Promise<void>;
}

const EXAMPLE_DIAGRAMS = {
  flowchart: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Other]
    C --> E[End]
    D --> E`,
  architecture: `flowchart TB
    Client[Web Client]
    Gateway[API Gateway]
    Auth[Auth Service]
    Users[User Service]
    DB[(Database)]

    Client --> Gateway
    Gateway --> Auth
    Gateway --> Users
    Auth --> DB
    Users --> DB`,
  sequence: `flowchart LR
    User[User] --> Frontend[Frontend]
    Frontend --> API[API Server]
    API --> DB[(Database)]
    API --> Cache[(Redis)]`,
};

/**
 * Modal component for importing Mermaid diagrams
 */
export function MermaidImporter({
  isOpen,
  onClose,
  onImport,
}: MermaidImporterProps) {
  const [mermaidCode, setMermaidCode] = useState(EXAMPLE_DIAGRAMS.flowchart);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!mermaidCode.trim()) {
      setError('Por favor, insira código Mermaid válido');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      await onImport(mermaidCode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar diagrama');
    } finally {
      setIsImporting(false);
    }
  }, [mermaidCode, onImport, onClose]);

  const handleExampleClick = (key: keyof typeof EXAMPLE_DIAGRAMS) => {
    setMermaidCode(EXAMPLE_DIAGRAMS[key]);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Importar Diagrama Mermaid
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Cole seu código Mermaid para criar um diagrama
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Examples */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Exemplos
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleExampleClick('flowchart')}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Fluxograma
              </button>
              <button
                onClick={() => handleExampleClick('architecture')}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Arquitetura
              </button>
              <button
                onClick={() => handleExampleClick('sequence')}
                className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Sequência
              </button>
            </div>
          </div>

          {/* Code editor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Código Mermaid
              </span>
            </div>
            <textarea
              value={mermaidCode}
              onChange={(e) => {
                setMermaidCode(e.target.value);
                setError(null);
              }}
              placeholder="flowchart TD&#10;    A[Start] --> B[End]"
              className="w-full h-64 px-4 py-3 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              spellCheck={false}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-400">
                {error}
              </span>
            </div>
          )}

          {/* Help text */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <p>
              Suporta diagramas <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">flowchart</code> e{' '}
              <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">graph</code>.
              Consulte a{' '}
              <a
                href="https://mermaid.js.org/syntax/flowchart.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                documentação do Mermaid
              </a>{' '}
              para mais opções.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || !mermaidCode.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Importar Diagrama
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MermaidImporter;
