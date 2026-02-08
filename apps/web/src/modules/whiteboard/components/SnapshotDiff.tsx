'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  GitCompare,
  ArrowRight,
  Plus,
  Minus,
  Edit3,
  X,
  RotateCcw,
  ChevronDown,
  Eye,
  Loader2,
} from 'lucide-react';
import type { WhiteboardSnapshot, ExcalidrawElement } from '../types';

interface SnapshotDiffProps {
  snapshots: WhiteboardSnapshot[];
  currentElements: readonly ExcalidrawElement[];
  onRestoreSnapshot: (elements: ExcalidrawElement[]) => void;
  onClose: () => void;
  className?: string;
}

interface DiffResult {
  added: ExcalidrawElement[];
  removed: ExcalidrawElement[];
  modified: Array<{
    before: ExcalidrawElement;
    after: ExcalidrawElement;
    changes: string[];
  }>;
  unchanged: number;
}

/**
 * Compare two sets of elements and find differences
 */
function compareElements(
  before: ExcalidrawElement[],
  after: ExcalidrawElement[]
): DiffResult {
  const beforeMap = new Map(before.map((el) => [el.id, el]));
  const afterMap = new Map(after.map((el) => [el.id, el]));

  const added: ExcalidrawElement[] = [];
  const removed: ExcalidrawElement[] = [];
  const modified: DiffResult['modified'] = [];
  let unchanged = 0;

  // Find removed and modified elements
  for (const el of before) {
    const afterEl = afterMap.get(el.id);
    if (!afterEl) {
      removed.push(el);
    } else {
      // Check for modifications
      const changes = findChanges(el, afterEl);
      if (changes.length > 0) {
        modified.push({ before: el, after: afterEl, changes });
      } else {
        unchanged++;
      }
    }
  }

  // Find added elements
  for (const el of after) {
    if (!beforeMap.has(el.id)) {
      added.push(el);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Find specific changes between two elements
 */
function findChanges(before: ExcalidrawElement, after: ExcalidrawElement): string[] {
  const changes: string[] = [];
  const propsToCheck = [
    'x',
    'y',
    'width',
    'height',
    'angle',
    'strokeColor',
    'backgroundColor',
    'fillStyle',
    'strokeWidth',
    'opacity',
    'text',
  ];

  for (const prop of propsToCheck) {
    const beforeVal = before[prop];
    const afterVal = after[prop];
    if (beforeVal !== afterVal) {
      if (prop === 'x' || prop === 'y') {
        changes.push('posicao');
      } else if (prop === 'width' || prop === 'height') {
        changes.push('tamanho');
      } else if (prop === 'angle') {
        changes.push('rotacao');
      } else if (prop === 'strokeColor' || prop === 'backgroundColor' || prop === 'fillStyle') {
        changes.push('cor');
      } else if (prop === 'text') {
        changes.push('texto');
      } else {
        changes.push(prop);
      }
    }
  }

  // Remove duplicates
  return [...new Set(changes)];
}

/**
 * Format element type to Portuguese
 */
function formatElementType(type: string): string {
  const types: Record<string, string> = {
    rectangle: 'Retangulo',
    ellipse: 'Elipse',
    diamond: 'Losango',
    line: 'Linha',
    arrow: 'Seta',
    text: 'Texto',
    freedraw: 'Desenho livre',
    image: 'Imagem',
  };
  return types[type] || type;
}

/**
 * Snapshot Diff component for comparing two versions side by side
 */
export function SnapshotDiff({
  snapshots,
  currentElements,
  onRestoreSnapshot,
  onClose,
  className = '',
}: SnapshotDiffProps) {
  const [leftSnapshotId, setLeftSnapshotId] = useState<string | 'current'>('current');
  const [rightSnapshotId, setRightSnapshotId] = useState<string | null>(
    snapshots.length > 0 ? snapshots[0]?.id ?? null : null
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'added' | 'removed' | 'modified' | null>(
    'modified'
  );

  // Get elements for each side
  const leftElements = useMemo(() => {
    if (leftSnapshotId === 'current') {
      return currentElements as ExcalidrawElement[];
    }
    const snapshot = snapshots.find((s) => s.id === leftSnapshotId);
    return snapshot?.elementsJson || [];
  }, [leftSnapshotId, snapshots, currentElements]);

  const rightElements = useMemo(() => {
    if (!rightSnapshotId) return [];
    const snapshot = snapshots.find((s) => s.id === rightSnapshotId);
    return snapshot?.elementsJson || [];
  }, [rightSnapshotId, snapshots]);

  // Calculate diff
  const diff = useMemo(() => {
    if (!rightElements.length) return null;
    return compareElements(rightElements, leftElements);
  }, [leftElements, rightElements]);

  // Handle restore
  const handleRestore = useCallback(
    async (elements: ExcalidrawElement[]) => {
      setIsRestoring(true);
      try {
        onRestoreSnapshot(elements);
        onClose();
      } finally {
        setIsRestoring(false);
      }
    },
    [onRestoreSnapshot, onClose]
  );

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get snapshot label
  const getSnapshotLabel = (id: string | 'current') => {
    if (id === 'current') return 'Estado atual';
    const snapshot = snapshots.find((s) => s.id === id);
    return snapshot?.label || formatDate(snapshot?.createdAt || '');
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 ${className}`}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Comparar Versoes
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Snapshot selectors */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            {/* Right side (older) */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Versao anterior
              </label>
              <div className="relative">
                <select
                  value={rightSnapshotId || ''}
                  onChange={(e) => setRightSnapshotId(e.target.value || null)}
                  className="w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecionar snapshot...</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === leftSnapshotId}>
                      {s.label || formatDate(s.createdAt)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />

            {/* Left side (newer) */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Versao atual
              </label>
              <div className="relative">
                <select
                  value={leftSnapshotId}
                  onChange={(e) => setLeftSnapshotId(e.target.value as string | 'current')}
                  className="w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="current">Estado atual</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === rightSnapshotId}>
                      {s.label || formatDate(s.createdAt)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!rightSnapshotId ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Selecione uma versao anterior para comparar</p>
            </div>
          ) : !diff ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium">{diff.added.length} adicionados</span>
                </div>
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Minus className="h-4 w-4" />
                  <span className="text-sm font-medium">{diff.removed.length} removidos</span>
                </div>
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Edit3 className="h-4 w-4" />
                  <span className="text-sm font-medium">{diff.modified.length} modificados</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Eye className="h-4 w-4" />
                  <span className="text-sm">{diff.unchanged} sem alteracao</span>
                </div>
              </div>

              {/* Added elements */}
              {diff.added.length > 0 && (
                <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'added' ? null : 'added')
                    }
                    className="w-full flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="font-medium">Elementos adicionados ({diff.added.length})</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expandedSection === 'added' ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSection === 'added' && (
                    <div className="divide-y divide-green-100 dark:divide-green-900">
                      {diff.added.map((el) => (
                        <div key={el.id} className="px-4 py-2.5 text-sm">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatElementType(el.type)}
                          </span>
                          {el.type === 'text' && (
                            <span className="ml-2 text-gray-500 dark:text-gray-400 truncate">
                              &ldquo;{(el as { text?: string }).text?.substring(0, 30)}...&rdquo;
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Removed elements */}
              {diff.removed.length > 0 && (
                <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'removed' ? null : 'removed')
                    }
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4" />
                      <span className="font-medium">Elementos removidos ({diff.removed.length})</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expandedSection === 'removed' ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSection === 'removed' && (
                    <div className="divide-y divide-red-100 dark:divide-red-900">
                      {diff.removed.map((el) => (
                        <div key={el.id} className="px-4 py-2.5 text-sm">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatElementType(el.type)}
                          </span>
                          {el.type === 'text' && (
                            <span className="ml-2 text-gray-500 dark:text-gray-400 truncate">
                              &ldquo;{(el as { text?: string }).text?.substring(0, 30)}...&rdquo;
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modified elements */}
              {diff.modified.length > 0 && (
                <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === 'modified' ? null : 'modified')
                    }
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Edit3 className="h-4 w-4" />
                      <span className="font-medium">Elementos modificados ({diff.modified.length})</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expandedSection === 'modified' ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedSection === 'modified' && (
                    <div className="divide-y divide-amber-100 dark:divide-amber-900">
                      {diff.modified.map(({ before, changes }) => (
                        <div key={before.id} className="px-4 py-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatElementType(before.type)}
                            </span>
                            <div className="flex items-center gap-1">
                              {changes.map((change) => (
                                <span
                                  key={change}
                                  className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded"
                                >
                                  {change}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* No changes */}
              {diff.added.length === 0 &&
                diff.removed.length === 0 &&
                diff.modified.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Eye className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma diferenca encontrada</p>
                    <p className="text-sm">As versoes sao identicas</p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Comparando: <span className="font-medium">{getSnapshotLabel(rightSnapshotId || '')}</span>
            <ArrowRight className="inline-block h-3 w-3 mx-1" />
            <span className="font-medium">{getSnapshotLabel(leftSnapshotId)}</span>
          </div>
          <div className="flex items-center gap-2">
            {rightSnapshotId && rightElements.length > 0 && (
              <button
                onClick={() => handleRestore(rightElements)}
                disabled={isRestoring}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors disabled:opacity-50"
              >
                {isRestoring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Restaurar versao anterior
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SnapshotDiff;
