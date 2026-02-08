'use client';

import React, { useState, useCallback } from 'react';
import {
  Box,
  Database,
  Server,
  Cloud,
  Users,
  Smartphone,
  Globe,
  Lock,
  Cog,
  MessageSquare,
  FileCode,
  GitBranch,
  Layers,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  X,
} from 'lucide-react';
import type { ExcalidrawElement } from '../types';

interface ComponentPaletteProps {
  onAddComponent: (elements: ExcalidrawElement[]) => void;
  className?: string;
}

interface PaletteComponent {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  elements: Partial<ExcalidrawElement>[];
}

interface PaletteCategory {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  components: PaletteComponent[];
}

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Create a base element with defaults
function createBaseElement(overrides: Partial<ExcalidrawElement>): ExcalidrawElement {
  return {
    id: generateId(),
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  } as ExcalidrawElement;
}

// Component categories
const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: 'architecture',
    name: 'Arquitetura',
    icon: Layers,
    components: [
      {
        id: 'service-box',
        name: 'Servico',
        icon: Box,
        description: 'Box de servico/microservico',
        elements: [
          {
            type: 'rectangle',
            width: 120,
            height: 80,
            backgroundColor: '#e3f2fd',
            strokeColor: '#1976d2',
            roundness: { type: 3, value: 8 },
          },
          {
            type: 'text',
            text: 'Servico',
            x: 30,
            y: 30,
            fontSize: 16,
            fontFamily: 1,
            textAlign: 'center',
          },
        ],
      },
      {
        id: 'api-gateway',
        name: 'API Gateway',
        icon: Globe,
        description: 'Gateway de API',
        elements: [
          {
            type: 'diamond',
            width: 100,
            height: 80,
            backgroundColor: '#fff3e0',
            strokeColor: '#f57c00',
          },
          {
            type: 'text',
            text: 'API',
            x: 35,
            y: 30,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'load-balancer',
        name: 'Load Balancer',
        icon: GitBranch,
        description: 'Balanceador de carga',
        elements: [
          {
            type: 'ellipse',
            width: 100,
            height: 60,
            backgroundColor: '#e8f5e9',
            strokeColor: '#388e3c',
          },
          {
            type: 'text',
            text: 'LB',
            x: 40,
            y: 20,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'data',
    name: 'Dados',
    icon: Database,
    components: [
      {
        id: 'database',
        name: 'Banco de Dados',
        icon: Database,
        description: 'Simbolo de banco de dados',
        elements: [
          {
            type: 'ellipse',
            width: 80,
            height: 30,
            backgroundColor: '#fce4ec',
            strokeColor: '#c2185b',
          },
          {
            type: 'rectangle',
            x: 0,
            y: 15,
            width: 80,
            height: 50,
            backgroundColor: '#fce4ec',
            strokeColor: '#c2185b',
          },
          {
            type: 'ellipse',
            x: 0,
            y: 50,
            width: 80,
            height: 30,
            backgroundColor: '#fce4ec',
            strokeColor: '#c2185b',
          },
          {
            type: 'text',
            text: 'DB',
            x: 25,
            y: 35,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'cache',
        name: 'Cache',
        icon: Cog,
        description: 'Cache/Redis',
        elements: [
          {
            type: 'rectangle',
            width: 80,
            height: 60,
            backgroundColor: '#ffebee',
            strokeColor: '#d32f2f',
            roundness: null,
          },
          {
            type: 'text',
            text: 'Cache',
            x: 15,
            y: 20,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'queue',
        name: 'Fila/Queue',
        icon: MessageSquare,
        description: 'Message queue',
        elements: [
          {
            type: 'rectangle',
            width: 120,
            height: 40,
            backgroundColor: '#f3e5f5',
            strokeColor: '#7b1fa2',
          },
          {
            type: 'text',
            text: 'Queue',
            x: 35,
            y: 10,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'infra',
    name: 'Infraestrutura',
    icon: Server,
    components: [
      {
        id: 'server',
        name: 'Servidor',
        icon: Server,
        description: 'Servidor/VM',
        elements: [
          {
            type: 'rectangle',
            width: 100,
            height: 70,
            backgroundColor: '#e0e0e0',
            strokeColor: '#424242',
          },
          {
            type: 'text',
            text: 'Server',
            x: 25,
            y: 25,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'cloud',
        name: 'Cloud',
        icon: Cloud,
        description: 'Nuvem/Cloud provider',
        elements: [
          {
            type: 'ellipse',
            width: 140,
            height: 80,
            backgroundColor: '#e1f5fe',
            strokeColor: '#0288d1',
          },
          {
            type: 'text',
            text: 'Cloud',
            x: 50,
            y: 30,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'container',
        name: 'Container',
        icon: Box,
        description: 'Docker container',
        elements: [
          {
            type: 'rectangle',
            width: 100,
            height: 60,
            backgroundColor: '#e3f2fd',
            strokeColor: '#0d47a1',
            strokeStyle: 'dashed',
          },
          {
            type: 'text',
            text: 'Container',
            x: 15,
            y: 20,
            fontSize: 12,
            fontFamily: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'actors',
    name: 'Atores',
    icon: Users,
    components: [
      {
        id: 'user',
        name: 'Usuario',
        icon: Users,
        description: 'Ator/Usuario',
        elements: [
          {
            type: 'ellipse',
            width: 40,
            height: 40,
            backgroundColor: '#fff9c4',
            strokeColor: '#fbc02d',
          },
          {
            type: 'rectangle',
            x: 5,
            y: 40,
            width: 30,
            height: 50,
            backgroundColor: '#fff9c4',
            strokeColor: '#fbc02d',
          },
          {
            type: 'text',
            text: 'User',
            x: 5,
            y: 95,
            fontSize: 12,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'mobile-app',
        name: 'App Mobile',
        icon: Smartphone,
        description: 'Aplicativo mobile',
        elements: [
          {
            type: 'rectangle',
            width: 50,
            height: 80,
            backgroundColor: '#f5f5f5',
            strokeColor: '#616161',
            roundness: { type: 3, value: 8 },
          },
          {
            type: 'text',
            text: 'App',
            x: 10,
            y: 35,
            fontSize: 12,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'browser',
        name: 'Browser',
        icon: Globe,
        description: 'Navegador web',
        elements: [
          {
            type: 'rectangle',
            width: 100,
            height: 70,
            backgroundColor: '#fff',
            strokeColor: '#757575',
          },
          {
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 100,
            height: 15,
            backgroundColor: '#e0e0e0',
            strokeColor: '#757575',
          },
          {
            type: 'text',
            text: 'Browser',
            x: 25,
            y: 35,
            fontSize: 12,
            fontFamily: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'security',
    name: 'Seguranca',
    icon: Lock,
    components: [
      {
        id: 'auth',
        name: 'Autenticacao',
        icon: Lock,
        description: 'Servico de auth',
        elements: [
          {
            type: 'rectangle',
            width: 100,
            height: 60,
            backgroundColor: '#ffecb3',
            strokeColor: '#ff8f00',
          },
          {
            type: 'text',
            text: 'Auth',
            x: 30,
            y: 20,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'firewall',
        name: 'Firewall',
        icon: Lock,
        description: 'Firewall/WAF',
        elements: [
          {
            type: 'rectangle',
            width: 20,
            height: 100,
            backgroundColor: '#ffcdd2',
            strokeColor: '#c62828',
          },
        ],
      },
    ],
  },
  {
    id: 'code',
    name: 'Codigo',
    icon: FileCode,
    components: [
      {
        id: 'function',
        name: 'Funcao',
        icon: FileCode,
        description: 'Funcao/Lambda',
        elements: [
          {
            type: 'rectangle',
            width: 100,
            height: 50,
            backgroundColor: '#e8eaf6',
            strokeColor: '#3f51b5',
            roundness: { type: 3, value: 4 },
          },
          {
            type: 'text',
            text: 'fn()',
            x: 35,
            y: 15,
            fontSize: 14,
            fontFamily: 3, // Monospace
          },
        ],
      },
      {
        id: 'class',
        name: 'Classe',
        icon: Box,
        description: 'Classe UML',
        elements: [
          {
            type: 'rectangle',
            width: 120,
            height: 100,
            backgroundColor: '#fff',
            strokeColor: '#1e1e1e',
          },
          {
            type: 'line',
            points: [[0, 0], [120, 0]],
            x: 0,
            y: 30,
            strokeColor: '#1e1e1e',
          },
          {
            type: 'line',
            points: [[0, 0], [120, 0]],
            x: 0,
            y: 60,
            strokeColor: '#1e1e1e',
          },
          {
            type: 'text',
            text: 'ClassName',
            x: 20,
            y: 5,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
      {
        id: 'interface',
        name: 'Interface',
        icon: FileCode,
        description: 'Interface',
        elements: [
          {
            type: 'rectangle',
            width: 120,
            height: 60,
            backgroundColor: '#f3e5f5',
            strokeColor: '#9c27b0',
            strokeStyle: 'dashed',
          },
          {
            type: 'text',
            text: '<<interface>>',
            x: 15,
            y: 10,
            fontSize: 10,
            fontFamily: 1,
          },
          {
            type: 'text',
            text: 'IInterface',
            x: 25,
            y: 30,
            fontSize: 14,
            fontFamily: 1,
          },
        ],
      },
    ],
  },
];

/**
 * Component Palette for drag-and-drop developer components
 */
export function ComponentPalette({ onAddComponent, className = '' }: ComponentPaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['architecture'])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedComponent, setDraggedComponent] = useState<string | null>(null);

  // Toggle category expansion
  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  // Handle component click (add to center of canvas)
  const handleAddComponent = useCallback(
    (component: PaletteComponent) => {
      const elements = component.elements.map((partial) => createBaseElement(partial));
      onAddComponent(elements);
    },
    [onAddComponent]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, component: PaletteComponent) => {
      setDraggedComponent(component.id);
      // Store component data for drop
      const elements = component.elements.map((partial) => createBaseElement(partial));
      e.dataTransfer.setData('application/json', JSON.stringify(elements));
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedComponent(null);
  }, []);

  // Filter components by search
  const filteredCategories = PALETTE_CATEGORIES.map((category) => ({
    ...category,
    components: category.components.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((category) => category.components.length > 0);

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
          Componentes
        </h3>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar componente..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Categories and components */}
      <div className="max-h-96 overflow-y-auto">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Nenhum componente encontrado
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {expandedCategories.has(category.id) ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <category.icon className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {category.name}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {category.components.length}
                </span>
              </button>

              {/* Components */}
              {expandedCategories.has(category.id) && (
                <div className="px-2 pb-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {category.components.map((component) => (
                      <div
                        key={component.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, component)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleAddComponent(component)}
                        className={`group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-grab active:cursor-grabbing transition-all ${
                          draggedComponent === component.id
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 ring-2 ring-indigo-500'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        title={component.description}
                      >
                        <GripVertical className="h-3 w-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                        <component.icon className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                          {component.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Clique ou arraste para adicionar
        </p>
      </div>
    </div>
  );
}

export default ComponentPalette;
