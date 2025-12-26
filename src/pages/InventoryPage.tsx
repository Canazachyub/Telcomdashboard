import { useEffect, useState, useMemo } from 'react';
import { useInventoryStore } from '../stores/inventoryStore';
import { exportInventoryToCSV } from '../services/inventoryService';
import type { InventoryTipo, InventoryRecord } from '../types/inventory';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import {
  Search, Filter, Download, Package, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  RotateCcw, FileSpreadsheet, Image, ExternalLink,
  PackagePlus, PackageMinus, RotateCcw as ReturnIcon
} from 'lucide-react';

// Configuracion de paginacion
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'numero' | 'fecha' | 'tipo' | 'categoria' | 'cantidad' | 'persona';
type SortDirection = 'asc' | 'desc';

// Badge de tipo con icono y color
function TipoBadge({ tipo }: { tipo: InventoryTipo }) {
  const config = {
    INGRESO: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: <PackagePlus size={14} />,
      label: 'Ingreso'
    },
    SALIDA: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: <PackageMinus size={14} />,
      label: 'Salida'
    },
    DEVOL: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: <ReturnIcon size={14} />,
      label: 'Devolucion'
    }
  };

  const { bg, text, icon, label } = config[tipo] || config.INGRESO;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {icon}
      {label}
    </span>
  );
}

export default function InventoryPage() {
  const {
    filteredRecords,
    sheets,
    selectedSheet,
    filters,
    isLoading,
    error,
    categorias,
    personas,
    loadSheets,
    setSelectedSheet,
    setFilter,
    resetFilters,
    refresh
  } = useInventoryStore();

  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<InventoryRecord | null>(null);

  // Paginacion
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>('numero');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Cargar hojas al montar
  useEffect(() => {
    loadSheets();
  }, []);

  // Reset pagina cuando cambian filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Ordenar registros
  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'numero':
          aVal = a.numero;
          bVal = b.numero;
          break;
        case 'fecha':
          // Convertir dd/mm/yyyy a comparable
          const parseDate = (d: string) => {
            const [day, month, year] = d.split('/');
            return new Date(`${year}-${month}-${day}`).getTime() || 0;
          };
          aVal = parseDate(a.fecha);
          bVal = parseDate(b.fecha);
          break;
        case 'tipo':
          aVal = a.tipo;
          bVal = b.tipo;
          break;
        case 'categoria':
          aVal = a.categoria;
          bVal = b.categoria;
          break;
        case 'cantidad':
          aVal = a.cantidad;
          bVal = b.cantidad;
          break;
        case 'persona':
          aVal = a.persona;
          bVal = b.persona;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredRecords, sortField, sortDirection]);

  // Paginacion
  const totalPages = Math.ceil(sortedRecords.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRecords = sortedRecords.slice(startIndex, endIndex);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const handleExport = () => {
    if (filteredRecords.length > 0) {
      exportInventoryToCSV(filteredRecords, selectedSheet);
    }
  };

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    setShowSheetSelector(false);
    setCurrentPage(1);
  };

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />;
  };

  // Estadisticas rapidas
  const stats = useMemo(() => {
    const ingresos = filteredRecords.filter(r => r.tipo === 'INGRESO').reduce((sum, r) => sum + r.cantidad, 0);
    const salidas = filteredRecords.filter(r => r.tipo === 'SALIDA').reduce((sum, r) => sum + r.cantidad, 0);
    const devoluciones = filteredRecords.filter(r => r.tipo === 'DEVOL').reduce((sum, r) => sum + r.cantidad, 0);
    return { ingresos, salidas, devoluciones, balance: ingresos - salidas + devoluciones };
  }, [filteredRecords]);

  if (isLoading && !filteredRecords.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="text-blue-600" />
            Inventario
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {/* Selector de Hoja */}
            <div className="relative">
              <button
                onClick={() => setShowSheetSelector(!showSheetSelector)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                <FileSpreadsheet size={16} className="text-blue-600" />
                <span className="font-medium">{selectedSheet || 'Seleccionar hoja'}</span>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${showSheetSelector ? 'rotate-180' : ''}`} />
              </button>

              {showSheetSelector && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                  {sheets.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                      No hay hojas de inventario
                    </div>
                  ) : (
                    sheets.map((sheet) => (
                      <button
                        key={sheet.name}
                        onClick={() => handleSheetChange(sheet.name)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                          selectedSheet === sheet.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <span>{sheet.name}</span>
                        <span className="text-xs text-gray-400">{sheet.recordCount} reg.</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <span className="text-gray-400">|</span>
            <span className="text-gray-500 text-sm">
              {filteredRecords.length} registros
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>
      </div>

      {/* Click outside handler */}
      {showSheetSelector && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSheetSelector(false)} />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <PackagePlus size={18} />
            <span className="text-sm font-medium">Ingresos</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">+{stats.ingresos}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <PackageMinus size={18} />
            <span className="text-sm font-medium">Salidas</span>
          </div>
          <p className="text-2xl font-bold text-red-700">-{stats.salidas}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <ReturnIcon size={18} />
            <span className="text-sm font-medium">Devoluciones</span>
          </div>
          <p className="text-2xl font-bold text-green-700">+{stats.devoluciones}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Package size={18} />
            <span className="text-sm font-medium">Balance</span>
          </div>
          <p className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {stats.balance >= 0 ? '+' : ''}{stats.balance}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                placeholder="Buscar descripcion, persona, DNI..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filtro tipo */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={filters.tipo}
              onChange={(e) => setFilter('tipo', e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="todos">Todos los tipos</option>
              <option value="INGRESO">Ingresos</option>
              <option value="SALIDA">Salidas</option>
              <option value="DEVOL">Devoluciones</option>
            </select>
          </div>

          {/* Filtro categoria */}
          {categorias.length > 0 && (
            <select
              value={filters.categoria}
              onChange={(e) => setFilter('categoria', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="todos">Todas las categorias</option>
              {categorias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Filtro persona */}
          {personas.length > 0 && (
            <select
              value={filters.persona}
              onChange={(e) => setFilter('persona', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="todos">Todas las personas</option>
              {personas.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {/* Limpiar filtros */}
          {(filters.search || filters.tipo !== 'todos' || filters.categoria !== 'todos' || filters.persona !== 'todos') && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={16} />
              Limpiar
            </button>
          )}
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Mostrando {filteredRecords.length} de {useInventoryStore.getState().records.length} registros
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('numero')}
                >
                  <span className="flex items-center gap-1">
                    N
                    <SortIcon field="numero" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('fecha')}
                >
                  <span className="flex items-center gap-1">
                    Fecha
                    <SortIcon field="fecha" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('tipo')}
                >
                  <span className="flex items-center gap-1">
                    Tipo
                    <SortIcon field="tipo" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('categoria')}
                >
                  <span className="flex items-center gap-1">
                    Categoria
                    <SortIcon field="categoria" />
                  </span>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Descripcion
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('cantidad')}
                >
                  <span className="flex items-center gap-1">
                    Cant.
                    <SortIcon field="cantidad" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('persona')}
                >
                  <span className="flex items-center gap-1">
                    Persona
                    <SortIcon field="persona" />
                  </span>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Estado
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Foto
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((record, index) => (
                <tr
                  key={`${record.numero}-${index}`}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 px-4 text-gray-600 font-mono">
                    {record.numero}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    <div>{record.fecha}</div>
                    <div className="text-xs text-gray-400">{record.hora}</div>
                  </td>
                  <td className="py-3 px-4">
                    <TipoBadge tipo={record.tipo} />
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {record.categoria || '-'}
                  </td>
                  <td className="py-3 px-4 text-gray-900 max-w-[200px]">
                    <div className="truncate" title={record.descripcion}>
                      {record.descripcion}
                    </div>
                    {record.observaciones && (
                      <div className="text-xs text-gray-400 truncate" title={record.observaciones}>
                        {record.observaciones}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${
                      record.tipo === 'SALIDA' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {record.tipo === 'SALIDA' ? '-' : '+'}{record.cantidad}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-900">{record.persona}</div>
                    {record.dni && (
                      <div className="text-xs text-gray-400">DNI: {record.dni}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {record.estado || '-'}
                  </td>
                  <td className="py-3 px-4">
                    {record.fotoLink ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver foto"
                        >
                          <Image size={16} />
                        </button>
                        <a
                          href={record.fotoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Abrir en Drive"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedRecords.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {sheets.length === 0
              ? 'No hay hojas de inventario disponibles'
              : 'No se encontraron registros'
            }
          </div>
        )}

        {/* Paginacion */}
        {sortedRecords.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Mostrando {startIndex + 1}-{Math.min(endIndex, sortedRecords.length)} de {sortedRecords.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Filas:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Primera
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-3 py-1 text-sm">
                Pagina {currentPage} de {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ultima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de foto */}
      {selectedRecord && selectedRecord.fotoLink && (
        <PhotoGalleryModal
          photos={[{
            url: selectedRecord.fotoLink,
            fecha: `${selectedRecord.fecha} ${selectedRecord.hora}`,
            numero: selectedRecord.numero
          }]}
          suministro={`${selectedRecord.descripcion} - ${selectedRecord.persona}`}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
