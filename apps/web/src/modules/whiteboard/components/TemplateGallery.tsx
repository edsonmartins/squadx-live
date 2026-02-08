'use client';

import React, { useState, useMemo } from 'react';
import {
  Layout,
  X,
  Search,
  Grid3X3,
  Building2,
  GitBranch,
  Kanban,
} from 'lucide-react';
import type { WhiteboardTemplate, ExcalidrawElement } from '../types';
import { ALL_TEMPLATES, cloneTemplateElements } from '../templates';

interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (elements: ExcalidrawElement[]) => void;
  className?: string;
}

type CategoryFilter = 'all' | WhiteboardTemplate['category'];

const CATEGORY_CONFIG: Record<
  CategoryFilter,
  { label: string; icon: typeof Layout }
> = {
  all: { label: 'Todos', icon: Grid3X3 },
  architecture: { label: 'Arquitetura', icon: Building2 },
  diagram: { label: 'Diagramas', icon: GitBranch },
  planning: { label: 'Planejamento', icon: Kanban },
  general: { label: 'Geral', icon: Layout },
};

/**
 * Template gallery for quick-starting whiteboards
 */
export function TemplateGallery({
  isOpen,
  onClose,
  onApplyTemplate,
  className = '',
}: TemplateGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedTemplate, setSelectedTemplate] =
    useState<WhiteboardTemplate | null>(null);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    let templates = ALL_TEMPLATES;

    // Filter by category
    if (categoryFilter !== 'all') {
      templates = templates.filter((t) => t.category === categoryFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }

    return templates;
  }, [categoryFilter, searchQuery]);

  const handleApplyTemplate = () => {
    if (selectedTemplate) {
      const elements = cloneTemplateElements(selectedTemplate);
      onApplyTemplate(elements);
      onClose();
      setSelectedTemplate(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Layout className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Galeria de Templates
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar templates..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_CONFIG) as CategoryFilter[]).map(
              (category) => {
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const isActive = categoryFilter === category;

                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{config.label}</span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Templates grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Layout className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                Nenhum template encontrado
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Tente ajustar os filtros
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;

                return (
                  <button
                    key={template.id}
                    onClick={() =>
                      setSelectedTemplate(isSelected ? null : template)
                    }
                    className={`group relative p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/50'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                    }`}
                  >
                    {/* Preview area */}
                    <div
                      className={`relative h-32 mb-3 rounded-lg overflow-hidden ${
                        isSelected
                          ? 'bg-indigo-100 dark:bg-indigo-900/30'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      {/* Simple preview of template elements */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <TemplatePreview template={template} />
                      </div>
                    </div>

                    {/* Template info */}
                    <div>
                      <h3
                        className={`font-medium ${
                          isSelected
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${getCategoryColor(
                            template.category
                          )}`}
                        >
                          {CATEGORY_CONFIG[template.category]?.label ||
                            template.category}
                        </span>
                      </div>
                    </div>

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {selectedTemplate
              ? `Selecionado: ${selectedTemplate.name}`
              : `${filteredTemplates.length} template${filteredTemplates.length !== 1 ? 's' : ''} disponível${filteredTemplates.length !== 1 ? 'is' : ''}`}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleApplyTemplate}
              disabled={!selectedTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Layout className="h-4 w-4" />
              <span>Aplicar Template</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple preview component for templates
 */
function TemplatePreview({ template }: { template: WhiteboardTemplate }) {
  // Calculate bounding box
  const bbox = useMemo(() => {
    if (template.elements.length === 0) {
      return { minX: 0, minY: 0, width: 100, height: 100 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of template.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [template.elements]);

  // Scale to fit preview area
  const scale = Math.min(120 / bbox.width, 100 / bbox.height, 0.5);
  const offsetX = (128 - bbox.width * scale) / 2 - bbox.minX * scale;
  const offsetY = (128 - bbox.height * scale) / 2 - bbox.minY * scale;

  return (
    <svg
      width="128"
      height="128"
      viewBox="0 0 128 128"
      className="text-gray-400"
    >
      {template.elements
        .filter((el) => el.type !== 'text')
        .map((el, i) => {
          const x = el.x * scale + offsetX;
          const y = el.y * scale + offsetY;
          const width = el.width * scale;
          const height = el.height * scale;

          if (el.type === 'ellipse') {
            return (
              <ellipse
                key={i}
                cx={x + width / 2}
                cy={y + height / 2}
                rx={width / 2}
                ry={height / 2}
                fill={el.backgroundColor}
                stroke={el.strokeColor}
                strokeWidth={1}
                opacity={0.8}
              />
            );
          }

          if (el.type === 'diamond') {
            const cx = x + width / 2;
            const cy = y + height / 2;
            return (
              <polygon
                key={i}
                points={`${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`}
                fill={el.backgroundColor}
                stroke={el.strokeColor}
                strokeWidth={1}
                opacity={0.8}
              />
            );
          }

          if (el.type === 'line') {
            const points = (el as { points?: [number, number][] }).points || [];
            const p0 = points[0];
            const p1 = points[1];
            if (points.length >= 2 && p0 && p1) {
              return (
                <line
                  key={i}
                  x1={x + p0[0] * scale}
                  y1={y + p0[1] * scale}
                  x2={x + p1[0] * scale}
                  y2={y + p1[1] * scale}
                  stroke={el.strokeColor}
                  strokeWidth={1}
                  strokeDasharray={el.strokeStyle === 'dashed' ? '2,2' : undefined}
                  opacity={0.8}
                />
              );
            }
          }

          // Default: rectangle
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={width}
              height={height}
              rx={
                (el.roundness as { value?: number })?.value
                  ? ((el.roundness as { value: number }).value * scale) / 2
                  : 0
              }
              fill={el.backgroundColor}
              stroke={el.strokeColor}
              strokeWidth={1}
              opacity={0.8}
            />
          );
        })}
    </svg>
  );
}

function getCategoryColor(category: WhiteboardTemplate['category']): string {
  switch (category) {
    case 'architecture':
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
    case 'diagram':
      return 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300';
    case 'planning':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
    case 'general':
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  }
}

export default TemplateGallery;
