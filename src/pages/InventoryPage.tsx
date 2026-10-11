import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { useInventoryStore } from '../stores/inventoryStore';
import { exportInventoryToCSV } from '../services/inventoryService';
import type { InventoryTipo, InventoryRecord } from '../types/inventory';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import {
  Search, Filter, Download, Package, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  RotateCcw, FileSpreadsheet, Image, ExternalLink,
  PackagePlus, PackageMinus, RotateCcw as ReturnIcon, Scale
} from 'lucide-react';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, ui, type Tone } from '../components/ui';

// Formato de miles es-PE (solo visual)
const fmt = (n: number) => n.toLocaleString('es-PE');

// Configuracion de paginacion
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'numero' | 'fecha' | 'tipo' | 'categoria' | 'cantidad' | 'persona';
type SortDirection = 'asc' | 'desc';

// Badge de tipo con icono y color
function TipoBadge({ tipo }: { tipo: InventoryTipo }) {
  const config: Record<InventoryTipo, { tone: Tone; icon: ReactNode; label: string }> = {
    INGRESO: {
      tone: 'blue',
      icon: <PackagePlus size={12} />,
      label: 'Ingreso'
    },
    SALIDA: {
      tone: 'red',
      icon: <PackageMinus size={12} />,
      label: 'Salida'
    },
    DEVOL: {
      tone: 'green',
      icon: <ReturnIcon size={12} />,
      label: 'Devolución'
    }
  };

  const { tone, icon, label } = config[tipo] || config.INGRESO;

  return (
    <Badge tone={tone}>
      {icon}
      {label}
    </Badge>
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
      ? <ArrowUp size={14} className="text-electric" />
      : <ArrowDown size={14} className="text-electric" />;
  };

  // Estadisticas rapidas
  const stats = useMemo(() => {
    // La app envía las SALIDAS con cantidad negativa; se usan magnitudes para que
    // el resumen sea correcto se guarden en negativo o en positivo (y aunque lleguen como texto).
    const unidades = (r: { cantidad: unknown }) => Math.abs(Number(r.cantidad) || 0);
    const ingresos = filteredRecords.filter(r => r.tipo === 'INGRESO').reduce((sum, r) => sum + unidades(r), 0);
    const salidas = filteredRecords.filter(r => r.tipo === 'SALIDA').reduce((sum, r) => sum + unidades(r), 0);
    const devoluciones = filteredRecords.filter(r => r.tipo === 'DEVOL').reduce((sum, r) => sum + unidades(r), 0);
    return { ingresos, salidas, devoluciones, balance: ingresos - salidas + devoluciones };
  }, [filteredRecords]);

  if (isLoading && !filteredRecords.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-electric"></div>
        <p className="text-sm text-gray-500">Cargando inventario…</p>
      </div>
    );
  }

  const sortTh = `${ui.th} cursor-pointer select-none whitespace-nowrap hover:text-electric`;
  const pagerBtn = 'rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Almacén · Materiales"
        title="Inventario"
        icon={<Package size={22} />}
        subtitle="Movimientos de materiales y medidores: ingresos, salidas y devoluciones por hoja."
        actions={
          <>
            <button
              onClick={refresh}
              disabled={isLoading}
              className={ui.btnSecondary}
              title="Actualizar datos"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              onClick={handleExport}
              disabled={filteredRecords.length === 0}
              className={ui.btnSuccess}
              title="Exportar los registros filtrados a CSV"
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </>
        }
      />

      {/* Hoja activa (fuera del encabezado para que el menú no se recorte) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Hoja</span>
        {/* Selector de Hoja */}
        <div className="relative z-20">
          <button
            onClick={() => setShowSheetSelector(!showSheetSelector)}
            className="flex items-center gap-2 rounded-xl border border-gray-300 bg-navy-900 px-3 py-1.5 text-sm text-gray-800 transition hover:border-electric"
          >
            <FileSpreadsheet size={16} className="text-electric" />
            <span className="font-medium">{selectedSheet || 'Seleccionar hoja'}</span>
            <ChevronDown size={16} className={`text-gray-500 transition-transform ${showSheetSelector ? 'rotate-180' : ''}`} />
          </button>

          {showSheetSelector && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl shadow-black/40">
              {sheets.length === 0 ? (
                <div className="px-4 py-3 text-center text-sm text-gray-500">
                  No hay hojas de inventario
                </div>
              ) : (
                sheets.map((sheet) => (
                  <button
                    key={sheet.name}
                    onClick={() => handleSheetChange(sheet.name)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      selectedSheet === sheet.name ? 'bg-cyan-400/10 text-electric' : 'text-gray-700'
                    }`}
                  >
                    <span>{sheet.name}</span>
                    <span className="font-mono text-xs text-gray-400">{fmt(sheet.recordCount)} reg.</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <span className="text-gray-400">·</span>
        <span className="text-sm text-gray-500">
          <span className="font-mono text-gray-700">{fmt(filteredRecords.length)}</span> registros
        </span>
      </div>

      {/* Click outside handler */}
      {showSheetSelector && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSheetSelector(false)} />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Ingresos"
          tone="blue"
          icon={<PackagePlus size={18} />}
          value={`+${fmt(stats.ingresos)}`}
          hint="Unidades ingresadas"
        />
        <StatCard
          label="Salidas"
          tone="red"
          icon={<PackageMinus size={18} />}
          value={stats.salidas ? `−${fmt(stats.salidas)}` : "0"}
          hint="Unidades entregadas"
        />
        <StatCard
          label="Devoluciones"
          tone="green"
          icon={<ReturnIcon size={18} />}
          value={`+${fmt(stats.devoluciones)}`}
          hint="Unidades devueltas"
        />
        <StatCard
          label="Neto"
          tone="cyan"
          icon={<Scale size={18} />}
          value={`${stats.balance >= 0 ? '+' : '−'}${fmt(Math.abs(stats.balance))}`}
          hint="Ingresos − Salidas + Devoluciones (registros filtrados)"
        />
      </div>

      {/* Filtros */}
      <SectionCard
        title="Filtros"
        icon={<Filter size={16} />}
        actions={
          (filters.search || filters.tipo !== 'todos' || filters.categoria !== 'todos' || filters.persona !== 'todos') ? (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-electric"
            >
              <RotateCcw size={14} />
              Limpiar filtros
            </button>
          ) : undefined
        }
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Busqueda */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Buscar descripción, persona, DNI…"
              className={`${ui.input} pl-9`}
            />
          </div>

          {/* Filtro tipo */}
          <select
            value={filters.tipo}
            onChange={(e) => setFilter('tipo', e.target.value as any)}
            className={ui.input}
            aria-label="Tipo de movimiento"
          >
            <option value="todos">Todos los tipos</option>
            <option value="INGRESO">Ingresos</option>
            <option value="SALIDA">Salidas</option>
            <option value="DEVOL">Devoluciones</option>
          </select>

          {/* Filtro categoria */}
          {categorias.length > 0 && (
            <select
              value={filters.categoria}
              onChange={(e) => setFilter('categoria', e.target.value)}
              className={ui.input}
              aria-label="Categoría"
            >
              <option value="todos">Todas las categorías</option>
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
              className={ui.input}
              aria-label="Persona"
            >
              <option value="todos">Todas las personas</option>
              {personas.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Mostrando <span className="font-mono text-gray-700">{fmt(filteredRecords.length)}</span> de{' '}
          <span className="font-mono text-gray-700">{fmt(useInventoryStore.getState().records.length)}</span> registros
        </p>
      </SectionCard>

      {/* Tabla */}
      <div className={ui.tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={ui.theadRow}>
                <th className={sortTh} onClick={() => handleSort('numero')}>
                  <span className="flex items-center gap-1">
                    N.º
                    <SortIcon field="numero" />
                  </span>
                </th>
                <th className={sortTh} onClick={() => handleSort('fecha')}>
                  <span className="flex items-center gap-1">
                    Fecha
                    <SortIcon field="fecha" />
                  </span>
                </th>
                <th className={sortTh} onClick={() => handleSort('tipo')}>
                  <span className="flex items-center gap-1">
                    Tipo
                    <SortIcon field="tipo" />
                  </span>
                </th>
                <th className={sortTh} onClick={() => handleSort('categoria')}>
                  <span className="flex items-center gap-1">
                    Categoría
                    <SortIcon field="categoria" />
                  </span>
                </th>
                <th className={ui.th}>
                  Descripción
                </th>
                <th className={sortTh} onClick={() => handleSort('cantidad')}>
                  <span className="flex items-center gap-1">
                    Cantidad
                    <SortIcon field="cantidad" />
                  </span>
                </th>
                <th className={sortTh} onClick={() => handleSort('persona')}>
                  <span className="flex items-center gap-1">
                    Persona
                    <SortIcon field="persona" />
                  </span>
                </th>
                <th className={ui.th}>
                  Estado
                </th>
                <th className={ui.th}>
                  Foto
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((record, index) => (
                <tr
                  key={`${record.numero}-${index}`}
                  className={ui.tbodyRow}
                >
                  <td className={`${ui.td} font-mono text-gray-500`}>
                    {record.numero}
                  </td>
                  <td className={`${ui.td} whitespace-nowrap`}>
                    <div className="font-mono">{record.fecha}</div>
                    <div className="font-mono text-xs text-gray-400">{record.hora}</div>
                  </td>
                  <td className={ui.td}>
                    <TipoBadge tipo={record.tipo} />
                  </td>
                  <td className={ui.td}>
                    {record.categoria ? <Badge tone="gray">{record.categoria}</Badge> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className={`${ui.td} max-w-[220px] text-gray-900`}>
                    <div className="truncate" title={record.descripcion}>
                      {record.descripcion}
                    </div>
                    {record.observaciones && (
                      <div className="truncate text-xs text-gray-400" title={record.observaciones}>
                        {record.observaciones}
                      </div>
                    )}
                  </td>
                  <td className={ui.td}>
                    <span className={`font-mono font-semibold ${
                      record.tipo === 'SALIDA' ? 'text-red-700' : 'text-green-700'
                    }`}>
                      {record.tipo === 'SALIDA' ? '−' : '+'}{fmt(Math.abs(Number(record.cantidad) || 0))}
                    </span>
                  </td>
                  <td className={ui.td}>
                    <div className="text-gray-900">{record.persona}</div>
                    {record.dni && (
                      <div className="font-mono text-xs text-gray-400">DNI {record.dni}</div>
                    )}
                  </td>
                  <td className={ui.td}>
                    {record.estado || <span className="text-gray-400">—</span>}
                  </td>
                  <td className={ui.td}>
                    {record.fotoLink ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="rounded-lg p-2 text-electric transition-colors hover:bg-cyan-400/10"
                          title="Ver foto"
                        >
                          <Image size={16} />
                        </button>
                        <a
                          href={record.fotoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                          title="Abrir en Google Drive"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedRecords.length === 0 && (
          <EmptyState
            icon="inventario"
            title={sheets.length === 0
              ? 'No hay hojas de inventario disponibles'
              : 'No se encontraron registros'
            }
            description={sheets.length === 0
              ? 'Cuando exista una hoja de inventario en la planilla aparecerá aquí.'
              : 'Prueba con otra búsqueda o limpia los filtros.'
            }
          />
        )}

        {/* Paginacion */}
        {sortedRecords.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-4 py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Mostrando <span className="font-mono text-gray-700">{fmt(startIndex + 1)}–{fmt(Math.min(endIndex, sortedRecords.length))}</span> de{' '}
                <span className="font-mono text-gray-700">{fmt(sortedRecords.length)}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Filas por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-300 bg-navy-900 px-2 py-1 font-mono text-sm outline-none focus:border-electric"
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
                className={pagerBtn}
              >
                Primera
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={pagerBtn}
                title="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-sm text-gray-500">
                Página <span className="font-mono text-gray-800">{currentPage}</span> de <span className="font-mono text-gray-800">{totalPages || 1}</span>
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className={pagerBtn}
                title="Página siguiente"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className={pagerBtn}
              >
                Última
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
