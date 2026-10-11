import { useSuministroDrawer } from '../stores/suministroDrawerStore';
import { useState, useMemo, useRef } from 'react';
import { usePointsStore, useSheetStructure, useTecnicos, useDistritos, useFilters, useIsTecnico } from '../stores/pointsStore';
import { getPointStatus, getStatusLabel } from '../types/point';
import {
  Search, Filter, Download, Camera, MapPin, Users, Building2, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Upload,
  FileSpreadsheet, X, AlertCircle, CheckCircle, RefreshCw, ChevronDown, Zap
} from 'lucide-react';
import { PageHeader, StatCard, SectionCard, EmptyState, Badge, STATUS_UI, ui } from '../components/ui';
import type { GpsPoint, GpsPointExtended } from '../types/point';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import * as XLSX from 'xlsx';
import { API_POINTS } from '../config/api';
import { downloadCsv, type CsvValue } from '../utils/csv';
import { formatCoords } from '../utils/format';

// Configuración de paginación
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

type SortField = 'suministro' | 'tecnico' | 'distrito' | 'status' | 'photoCount';
type SortDirection = 'asc' | 'desc';

// Tipo para suministros a subir (estructura extended de 22 columnas)
interface SuministroUpload {
  numero?: number | string;
  tecnico?: string;
  fechaContraste?: string;
  suministro: string;
  codigoRuta?: string;
  clienteNombre?: string;
  direccion?: string;
  distrito?: string;
  sed?: string;
  marca?: string;
  modelo?: string;
  serie?: string;
  fase?: string;
  anioFabricacion?: string | number;
  hilos?: string | number;
  consumoPromedio?: string | number;
  equipoPatron?: string;
  carga?: string;
  dniCliente?: string;
  longRef?: number;
  latRef?: number;
  gis?: string;
  [key: string]: string | number | undefined;
}

// Mapeo de columnas del Excel a campos internos
const EXCEL_COLUMN_MAP: Record<string, keyof SuministroUpload> = {
  // Variantes de nombres de columnas
  'nº': 'numero',
  'n°': 'numero',
  'numero': 'numero',
  'no': 'numero',
  'tecnico': 'tecnico',
  'técnico': 'tecnico',
  'fecha de contraste': 'fechaContraste',
  'fecha_contraste': 'fechaContraste',
  'fechacontraste': 'fechaContraste',
  'suministro': 'suministro',
  'codigoderuta': 'codigoRuta',
  'codigo_ruta': 'codigoRuta',
  'codigoruta': 'codigoRuta',
  'codigo de ruta': 'codigoRuta',
  'ruta': 'codigoRuta',
  'nombres y apellidos': 'clienteNombre',
  'cliente': 'clienteNombre',
  'cliente_nombre': 'clienteNombre',
  'nombre': 'clienteNombre',
  'direccion': 'direccion',
  'dirección': 'direccion',
  'distrito': 'distrito',
  'sed': 'sed',
  'marca': 'marca',
  'modelo': 'modelo',
  'serie': 'serie',
  'fase': 'fase',
  'año': 'anioFabricacion',
  'anio': 'anioFabricacion',
  'anio_fabricacion': 'anioFabricacion',
  'hilos': 'hilos',
  'consumo promedio (kw-h)': 'consumoPromedio',
  'consumo promedio': 'consumoPromedio',
  'consumo_promedio': 'consumoPromedio',
  'consumopromedio': 'consumoPromedio',
  'equipo patron': 'equipoPatron',
  'equipo_patron': 'equipoPatron',
  'equipopatron': 'equipoPatron',
  'carga': 'carga',
  'dni': 'dniCliente',
  'dni_cliente': 'dniCliente',
  'dnicliente': 'dniCliente',
  'longitud': 'longRef',
  'long': 'longRef',
  'lng': 'longRef',
  'long_ref': 'longRef',
  'latitud': 'latRef',
  'lat': 'latRef',
  'lat_ref': 'latRef',
  'gis': 'gis',
};

// Modal de Upload
interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSheet: string;
  sheets: { id: number; name: string }[];
  onSuccess: () => void;
}

function UploadModal({ isOpen, onClose, currentSheet, sheets, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<SuministroUpload[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ rowsAdded: number; sheetName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para selección de hoja destino
  const [sheetMode, setSheetMode] = useState<'new' | 'existing'>('new');
  const [newSheetName, setNewSheetName] = useState('');
  const [selectedExistingSheet, setSelectedExistingSheet] = useState(currentSheet || '');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setSuccess(false);
    setParsedData([]);
    setDetectedColumns([]);

    // Verificar extension del archivo
    const fileName = selectedFile.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        if (isExcel) {
          // Parse Excel file
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          // Usar la primera hoja
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Convertir a JSON (primera fila son headers)
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: ''
          }) as (string | number | null)[][];

          if (jsonData.length < 2) {
            setError('El archivo debe tener al menos una fila de encabezado y una de datos');
            return;
          }

          // Headers en primera fila
          const headers = jsonData[0].map(h =>
            h ? String(h).toLowerCase().trim() : ''
          );

          // Detectar columnas mapeadas
          const columnMapping: { index: number; field: keyof SuministroUpload }[] = [];
          const detected: string[] = [];

          headers.forEach((header, index) => {
            if (!header) return;
            const mappedField = EXCEL_COLUMN_MAP[header];
            if (mappedField) {
              columnMapping.push({ index, field: mappedField });
              detected.push(`${header} → ${mappedField}`);
            }
          });

          setDetectedColumns(detected);

          // Verificar que existe columna suministro
          const hasSuministro = columnMapping.some(c => c.field === 'suministro');
          if (!hasSuministro) {
            setError('El archivo debe tener una columna "Suministro"');
            return;
          }

          // Parse data rows
          const parsedRows: SuministroUpload[] = [];

          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            // Buscar valor de suministro
            const suministroMapping = columnMapping.find(c => c.field === 'suministro');
            const suministroValue = suministroMapping ? row[suministroMapping.index] : null;

            if (!suministroValue) continue;

            const dataRow: SuministroUpload = {
              suministro: String(suministroValue).trim()
            };

            // Mapear resto de columnas
            columnMapping.forEach(({ index, field }) => {
              if (field === 'suministro') return;

              const value = row[index];
              if (value === null || value === undefined || value === '') return;

              // Campos numéricos
              if (field === 'latRef' || field === 'longRef') {
                const num = parseFloat(String(value));
                if (!isNaN(num)) {
                  dataRow[field] = num;
                }
              } else if (field === 'numero' || field === 'hilos' || field === 'anioFabricacion') {
                const num = parseFloat(String(value));
                if (!isNaN(num)) {
                  dataRow[field] = num;
                } else {
                  dataRow[field] = String(value).trim();
                }
              } else {
                dataRow[field] = String(value).trim();
              }
            });

            parsedRows.push(dataRow);
          }

          setParsedData(parsedRows);

        } else {
          // Parse CSV/TXT file
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());

          if (lines.length < 2) {
            setError('El archivo debe tener al menos una fila de encabezado y una de datos');
            return;
          }

          const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase());

          const columnMapping: { index: number; field: keyof SuministroUpload }[] = [];
          const detected: string[] = [];

          headers.forEach((header, index) => {
            if (!header) return;
            const mappedField = EXCEL_COLUMN_MAP[header];
            if (mappedField) {
              columnMapping.push({ index, field: mappedField });
              detected.push(`${header} → ${mappedField}`);
            }
          });

          setDetectedColumns(detected);

          const hasSuministro = columnMapping.some(c => c.field === 'suministro');
          if (!hasSuministro) {
            setError('El archivo debe tener una columna "Suministro"');
            return;
          }

          const parsedRows: SuministroUpload[] = [];

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(/[,;\t]/).map(v => v.trim());

            const suministroMapping = columnMapping.find(c => c.field === 'suministro');
            const suministroValue = suministroMapping ? values[suministroMapping.index] : null;

            if (!suministroValue) continue;

            const dataRow: SuministroUpload = { suministro: suministroValue };

            columnMapping.forEach(({ index, field }) => {
              if (field === 'suministro') return;
              const value = values[index];
              if (!value) return;

              if (field === 'latRef' || field === 'longRef') {
                const num = parseFloat(value);
                if (!isNaN(num)) {
                  dataRow[field] = num;
                }
              } else {
                dataRow[field] = value;
              }
            });

            parsedRows.push(dataRow);
          }

          setParsedData(parsedRows);
        }
      } catch (err) {
        console.error('Error parsing file:', err);
        setError('No se pudo leer el archivo. Verifica que sea un Excel o CSV válido.');
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(selectedFile);
    } else {
      reader.readAsText(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (parsedData.length === 0) {
      setError('No hay datos para subir');
      return;
    }

    // Validar nombre de hoja
    const targetSheetName = sheetMode === 'new' ? newSheetName.trim() : selectedExistingSheet;
    if (!targetSheetName) {
      setError(sheetMode === 'new' ? 'Ingresa un nombre para la nueva jornada' : 'Selecciona una jornada existente');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Usar FormData para mejor compatibilidad CORS con Google Apps Script
      const formData = new FormData();
      formData.append('payload', JSON.stringify({
        action: 'uploadSuministros',
        sheetName: targetSheetName,
        createNew: sheetMode === 'new',
        suministros: parsedData
      }));

      const response = await fetch(API_POINTS, {
        method: 'POST',
        body: formData,
        redirect: 'follow'
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setUploadResult({
          rowsAdded: result.rowsAdded,
          sheetName: result.sheetName
        });
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 2000);
      } else {
        setError(result.message || 'Error al subir los datos');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Error de conexión al subir los datos');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setDetectedColumns([]);
    setError(null);
    setSuccess(false);
    setUploadResult(null);
    setNewSheetName('');
    setSheetMode('new');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">Importación</p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Upload size={20} className="text-electric" />
              Importar suministros desde Excel
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">Crea una nueva jornada o agrega suministros a una existente</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            title="Cerrar"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Selector de archivo */}
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition-colors hover:border-electric/60">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <FileSpreadsheet className="mx-auto mb-3 text-electric" size={44} />
            {file ? (
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="font-mono text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`${ui.btnSecondary} mt-3`}
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-gray-600">Selecciona el archivo con la lista de suministros</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={ui.btnPrimary}
                >
                  <FileSpreadsheet size={16} />
                  Seleccionar archivo
                </button>
                <p className="mt-3 text-xs text-gray-500">
                  Formatos admitidos: Excel (.xlsx, .xls) o CSV
                </p>
              </div>
            )}
          </div>

          {/* Columnas detectadas */}
          {detectedColumns.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-green-800">
                <CheckCircle size={14} />
                Columnas reconocidas ({detectedColumns.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {detectedColumns.map((col, idx) => (
                  <Badge key={idx} tone="green">
                    <span className="font-mono">{col}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Selector de hoja destino - Solo mostrar cuando hay datos parseados */}
          {parsedData.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">¿Dónde guardar los datos?</h4>

              <div className="mb-4 flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="sheetMode"
                    checked={sheetMode === 'new'}
                    onChange={() => setSheetMode('new')}
                    className="h-4 w-4 accent-[#00d4ff]"
                  />
                  <span className="font-medium">Crear nueva jornada</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="sheetMode"
                    checked={sheetMode === 'existing'}
                    onChange={() => setSheetMode('existing')}
                    className="h-4 w-4 accent-[#00d4ff]"
                  />
                  <span className="font-medium">Agregar a una jornada existente</span>
                </label>
              </div>

              {sheetMode === 'new' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Nombre de la nueva jornada
                  </label>
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    placeholder="Ej.: Jornada_Enero_2025"
                    className={ui.input}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Se creará una nueva hoja en Google Sheets con este nombre
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Jornada existente
                  </label>
                  <select
                    value={selectedExistingSheet}
                    onChange={(e) => setSelectedExistingSheet(e.target.value)}
                    className={ui.input}
                  >
                    <option value="">Seleccionar jornada…</option>
                    {sheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.name}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Los suministros se agregarán al final de la jornada seleccionada
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Info del formato */}
          {!parsedData.length && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <h4 className="mb-1 text-sm font-medium text-blue-800">Formato del archivo</h4>
              <p className="text-xs leading-relaxed text-blue-800">
                El archivo debe tener una columna <strong>Suministro</strong> (obligatoria).
                Columnas reconocidas: Nº, Técnico, Fecha de contraste, Suministro, Código de ruta,
                Nombres y apellidos, Dirección, Distrito, SED, Marca, Modelo, Serie, Fase, Año,
                Hilos, Consumo promedio, Equipo patrón, Carga, DNI, Longitud, Latitud, GIS.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle size={18} className="shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Success */}
          {success && uploadResult && (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-green-800">
              <CheckCircle size={18} className="shrink-0" />
              <span className="text-sm">
                Se subieron <span className="font-mono font-semibold">{uploadResult.rowsAdded.toLocaleString('es-PE')}</span> suministros a la jornada «{uploadResult.sheetName}».
              </span>
            </div>
          )}

          {/* Preview de datos */}
          {parsedData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                Vista previa <span className="font-normal text-gray-500">({parsedData.length.toLocaleString('es-PE')} suministros)</span>
              </h4>
              <div className="max-h-64 overflow-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className={`${ui.th} py-2`}>#</th>
                      <th className={`${ui.th} py-2`}>Suministro</th>
                      <th className={`${ui.th} py-2`}>Serie</th>
                      <th className={`${ui.th} py-2`}>Cliente</th>
                      <th className={`${ui.th} py-2`}>Distrito</th>
                      <th className={`${ui.th} py-2`}>Técnico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={ui.tbodyRow}>
                        <td className={`${ui.td} py-2 font-mono text-gray-500`}>{idx + 1}</td>
                        <td className={`${ui.td} py-2 font-mono font-medium text-gray-900`}>{row.suministro}</td>
                        <td className={`${ui.td} py-2 font-mono`}>{row.serie || '—'}</td>
                        <td className={`${ui.td} max-w-[150px] truncate py-2`}>{row.clienteNombre || '—'}</td>
                        <td className={`${ui.td} py-2`}>{row.distrito || '—'}</td>
                        <td className={`${ui.td} py-2`}>{row.tecnico || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 50 && (
                  <div className="border-t border-gray-200 bg-gray-50 py-2 text-center text-sm text-gray-500">
                    … y {(parsedData.length - 50).toLocaleString('es-PE')} filas más
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <button
            onClick={handleClose}
            className={ui.btnSecondary}
          >
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={parsedData.length === 0 || uploading || success || (sheetMode === 'new' && !newSheetName.trim()) || (sheetMode === 'existing' && !selectedExistingSheet)}
            className={ui.btnPrimary}
          >
            {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            {success ? '¡Subido!' : uploading ? 'Subiendo…' : `Subir ${parsedData.length.toLocaleString('es-PE')} suministros`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuministrosPage() {
  const {
    filteredPoints, pointsExtended, selectedSheet, sheets, isLoading,
    setFilter: setStoreFilter, resetFilters: resetStoreFilters, setSelectedSheet, refreshPoints, loadSheets
  } = usePointsStore();
  const sheetStructure = useSheetStructure();
  const tecnicos = useTecnicos();
  const distritos = useDistritos();
  const filters = useFilters();
  const isTecnico = useIsTecnico();

  // TECNICO no puede exportar ni subir Excel
  const canExport = !isTecnico;
  const canUpload = !isTecnico;

  const [selectedPoint, setSelectedPoint] = useState<GpsPoint | GpsPointExtended | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSheetSelector, setShowSheetSelector] = useState(false);

  // Estado de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Estado de ordenamiento
  const [sortField, setSortField] = useState<SortField>('suministro');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Volver a la pagina 1 cuando cambia la jornada (tambien si se cambia desde el Header)
  // (patron recomendado por React: ajustar estado durante el render al cambiar una prop)
  const openFicha = useSuministroDrawer((st) => st.open);
  const [pageSheet, setPageSheet] = useState(selectedSheet);
  if (pageSheet !== selectedSheet) {
    setPageSheet(selectedSheet);
    setCurrentPage(1);
  }

  const resetFilters = () => {
    setCurrentPage(1);
    resetStoreFilters();
  };

  // Ordenar puntos
  const sortedPoints = useMemo(() => {
    const sorted = [...filteredPoints].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'suministro':
          aVal = a.suministro;
          bVal = b.suministro;
          break;
        case 'tecnico':
          aVal = (a as GpsPointExtended).tecnico || '';
          bVal = (b as GpsPointExtended).tecnico || '';
          break;
        case 'distrito':
          aVal = (a as GpsPointExtended).distrito || '';
          bVal = (b as GpsPointExtended).distrito || '';
          break;
        case 'status':
          aVal = getPointStatus(a);
          bVal = getPointStatus(b);
          break;
        case 'photoCount':
          aVal = a.photoCount;
          bVal = b.photoCount;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredPoints, sortField, sortDirection]);

  // Calcular paginación
  const totalPages = Math.ceil(sortedPoints.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPoints = sortedPoints.slice(startIndex, endIndex);

  // Reset página cuando cambian filtros
  const handleFilterChange = (key: Parameters<typeof setStoreFilter>[0], value: string) => {
    setCurrentPage(1);
    setStoreFilter(key, value);
  };

  // Cambiar ordenamiento
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Renderizar icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-electric" />
      : <ArrowDown size={14} className="text-electric" />;
  };

  // Cambiar hoja
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setShowSheetSelector(false);
    setCurrentPage(1);
  };

  // Exportar a CSV con todos los campos
  const exportToCSV = () => {
    const isExtended = sheetStructure === 'extended';

    // Función para escapar valores CSV (manejar comas y comillas)
    // Escapado, BOM y neutralizacion de formulas: lo hace el helper compartido (utils/csv)
    const escapeCSV = (value: string | number | null | undefined): CsvValue => value;

    // Headers completos para estructura extended
    const extendedHeaders = [
      'Nº', 'TECNICO', 'Fecha_Contraste', 'Suministro', 'Codigo_Ruta',
      'Cliente_Nombre', 'Direccion', 'Distrito', 'SED', 'Marca',
      'Modelo', 'Serie', 'Fase', 'Año_Fabricacion', 'Hilos',
      'Consumo_Promedio', 'Equipo_Patron', 'Carga', 'DNI_Cliente',
      'LONGITUD_REF', 'LATITUD_REF', 'GIS', 'ESTADO_TAREA',
      'ESTADO_SUPERVISION', 'Fotos', 'LAT_REAL', 'LONG_REAL',
      'LECTURA', 'Fecha_Supervision'
    ];

    const legacyHeaders = ['Suministro', 'Estado', 'Fotos', 'Latitud_Ref', 'Longitud_Ref', 'Latitud_Real', 'Longitud_Real'];

    const headers = isExtended ? extendedHeaders : legacyHeaders;

    const rows = filteredPoints.map((p) => {
      const status = getPointStatus(p);
      const statusLabel = getStatusLabel(status);

      if (isExtended) {
        const ext = p as GpsPointExtended;
        return [
          escapeCSV(ext.numero),
          escapeCSV(ext.tecnico),
          escapeCSV(ext.fecha),
          escapeCSV(p.suministro),
          escapeCSV(ext.codigoRuta),
          escapeCSV(ext.clienteNombre),
          escapeCSV(ext.direccion),
          escapeCSV(ext.distrito),
          escapeCSV(ext.sed),
          escapeCSV(ext.marca),
          escapeCSV(ext.modelo),
          escapeCSV(ext.serie),
          escapeCSV(ext.fase),
          escapeCSV(ext.anioFabricacion),
          escapeCSV(ext.hilos),
          escapeCSV(ext.consumoPromedio),
          escapeCSV(ext.equipoPatron),
          escapeCSV(ext.carga),
          escapeCSV(ext.dniCliente),
          escapeCSV(p.longRef),
          escapeCSV(p.latRef),
          escapeCSV(ext.gis),
          escapeCSV(ext.estadoTarea),
          escapeCSV(statusLabel),
          escapeCSV(p.photoCount),
          escapeCSV(p.latReal),
          escapeCSV(p.longReal),
          escapeCSV(ext.lectura),
          escapeCSV(ext.fechaSupervision || ext.syncedAt)
        ];
      }

      return [
        escapeCSV(p.suministro),
        escapeCSV(statusLabel),
        escapeCSV(p.photoCount),
        escapeCSV(p.latRef),
        escapeCSV(p.longRef),
        escapeCSV(p.latReal),
        escapeCSV(p.longReal)
      ];
    });

    downloadCsv(`suministros_${selectedSheet}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  // Resumen por estado (solo visual, sobre todos los suministros de la jornada)
  const statusSummary = useMemo(() => {
    const counts = { pendiente: 0, en_proceso: 0, completado: 0 };
    pointsExtended.forEach((p) => {
      const s = getPointStatus(p);
      if (s in counts) counts[s as keyof typeof counts]++;
    });
    return counts;
  }, [pointsExtended]);

  const fmt = (n: number) => n.toLocaleString('es-PE');
  const hasActiveFilters = Boolean(filters.search || filters.status !== 'todos' || filters.tecnico !== 'Todos' || filters.distrito !== 'Todos');

  // Cabecera de columna ordenable (solo presentación)
  const sortTh = (field: SortField, label: string) => (
    <th
      className={`${ui.th} cursor-pointer select-none whitespace-nowrap transition-colors hover:text-electric`}
      onClick={() => handleSort(field)}
      aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </span>
    </th>
  );

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-electric"></div>
        <p className="text-sm text-gray-500">Cargando suministros…</p>
      </div>
    );
  }

  const pagerBtn = 'inline-flex items-center justify-center rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-700';

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <PageHeader
        kicker="Gestión de campo"
        title="Suministros"
        icon={<Zap size={22} />}
        subtitle={
          <>
            Jornada: <span className="font-medium text-gray-900">{selectedSheet || 'sin seleccionar'}</span>
            <span className="mx-2 text-gray-400">·</span>
            <span className="font-mono">{fmt(pointsExtended.length)}</span> suministros
          </>
        }
        actions={
          <>
            <button
              onClick={refreshPoints}
              className={ui.btnSecondary}
              title="Actualizar datos"
              aria-label="Actualizar datos"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            {canUpload && (
              <button
                onClick={() => setShowUploadModal(true)}
                className={ui.btnPrimary}
              >
                <Upload size={16} />
                Subir Excel
              </button>
            )}
            {canExport && (
              <button
                onClick={exportToCSV}
                className={ui.btnSuccess}
                title="Descargar los suministros filtrados en CSV"
              >
                <Download size={16} />
                Exportar CSV
              </button>
            )}
          </>
        }
      />

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de la jornada" value={fmt(pointsExtended.length)} tone="cyan" icon={<Zap size={18} />} />
        <StatCard label={STATUS_UI.pendiente.label} value={fmt(statusSummary.pendiente)} tone={STATUS_UI.pendiente.tone} />
        <StatCard label={STATUS_UI.en_proceso.label} value={fmt(statusSummary.en_proceso)} tone={STATUS_UI.en_proceso.tone} />
        <StatCard label={STATUS_UI.completado.label} value={fmt(statusSummary.completado)} tone={STATUS_UI.completado.tone} />
      </div>

      {/* Click outside handler para cerrar selector */}
      {showSheetSelector && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowSheetSelector(false)}
        />
      )}

      {/* Filtros */}
      <SectionCard
        title="Filtros"
        icon={<Filter size={16} />}
        actions={
          hasActiveFilters ? (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-electric"
            >
              <RotateCcw size={14} />
              Limpiar filtros
            </button>
          ) : undefined
        }
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Selector de jornada */}
          <div className="relative lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Jornada</label>
            <button
              onClick={() => setShowSheetSelector(!showSheetSelector)}
              className={`${ui.input} relative z-20 flex items-center gap-2 text-left`}
            >
              <FileSpreadsheet size={16} className="shrink-0 text-electric" />
              <span className="flex-1 truncate font-medium">{selectedSheet || 'Seleccionar jornada'}</span>
              <ChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${showSheetSelector ? 'rotate-180' : ''}`} />
            </button>

            {showSheetSelector && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-2xl">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.id}
                    onClick={() => handleSheetChange(sheet.name)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${
                      selectedSheet === sheet.name ? 'bg-blue-50 text-electric' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate">{sheet.name}</span>
                    {selectedSheet === sheet.name && (
                      <CheckCircle size={14} className="shrink-0 text-electric" />
                    )}
                  </button>
                ))}
                {sheets.length === 0 && (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">
                    No hay jornadas disponibles
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Búsqueda */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Buscar</label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Suministro, cliente, dirección…"
                className={`${ui.input} pl-9`}
              />
            </div>
          </div>

          {/* Filtro de estado */}
          <div className="lg:col-span-2">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Filter size={12} /> Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className={ui.input}
            >
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="completado">Completado</option>
            </select>
          </div>

          {/* Filtros extended */}
          {sheetStructure === 'extended' && tecnicos.length > 0 && (
            <div className="lg:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <Users size={12} /> Técnico
                {isTecnico && <Badge tone="cyan">Asignado</Badge>}
              </label>
              <select
                value={filters.tecnico}
                onChange={(e) => handleFilterChange('tecnico', e.target.value)}
                disabled={isTecnico}
                className={`${ui.input} ${isTecnico ? 'cursor-not-allowed opacity-60' : ''}`}
                title={isTecnico ? 'Filtrado por tu usuario' : ''}
              >
                <option value="Todos">Todos los técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {sheetStructure === 'extended' && distritos.length > 0 && (
            <div className="lg:col-span-2">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <Building2 size={12} /> Distrito
              </label>
              <select
                value={filters.distrito}
                onChange={(e) => handleFilterChange('distrito', e.target.value)}
                className={ui.input}
              >
                <option value="Todos">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Mostrando <span className="font-mono text-gray-700">{fmt(filteredPoints.length)}</span> de{' '}
          <span className="font-mono text-gray-700">{fmt(pointsExtended.length)}</span> suministros
        </div>
      </SectionCard>

      {/* Tabla */}
      <div className={ui.tableWrap}>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[1] bg-gray-50">
              <tr className={ui.theadRow}>
                {sortTh('suministro', 'Suministro')}
                {sheetStructure === 'extended' && (
                  <>
                    {sortTh('tecnico', 'Técnico')}
                    <th className={`${ui.th} whitespace-nowrap`}>Cliente</th>
                    {sortTh('distrito', 'Distrito')}
                  </>
                )}
                {sortTh('status', 'Estado')}
                {sortTh('photoCount', 'Fotos')}
                <th className={`${ui.th} whitespace-nowrap`} title="Coordenadas de referencia (programadas)">
                  Coordenadas de referencia
                </th>
                <th className={`${ui.th} whitespace-nowrap`} title="Coordenadas registradas en campo">
                  Coordenadas en campo
                </th>
                {sheetStructure === 'extended' && (
                  <th className={`${ui.th} whitespace-nowrap`}>
                    Lectura
                  </th>
                )}
                <th className={`${ui.th} whitespace-nowrap`}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedPoints.map((point, index) => {
                const status = getPointStatus(point);
                const extPoint = point as GpsPointExtended;
                const statusUi = STATUS_UI[status];

                return (
                  <tr
                    key={`${point.suministro}-${index}`}
                    className={ui.tbodyRow}
                  >
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <button
                        onClick={() => openFicha(point, selectedSheet)}
                        className="font-mono font-medium text-electric hover:underline"
                        title="Ver ficha e historial del suministro"
                      >
                        {point.suministro}
                      </button>
                    </td>
                    {sheetStructure === 'extended' && (
                      <>
                        <td className={`${ui.td} whitespace-nowrap`}>
                          {extPoint.tecnico || '—'}
                        </td>
                        <td className={`${ui.td} max-w-[180px] truncate`} title={extPoint.clienteNombre || ''}>
                          {extPoint.clienteNombre || '—'}
                        </td>
                        <td className={`${ui.td} whitespace-nowrap`}>
                          {extPoint.distrito || '—'}
                        </td>
                      </>
                    )}
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <Badge tone={statusUi?.tone ?? 'gray'} dot>
                        {statusUi?.label ?? getStatusLabel(status)}
                      </Badge>
                    </td>
                    <td className={ui.td}>
                      <span className={`inline-flex items-center gap-1.5 font-mono ${point.photoCount > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                        <Camera size={14} />
                        {point.photoCount}
                      </span>
                    </td>
                    <td className={`${ui.td} whitespace-nowrap font-mono text-xs`}>
                      {formatCoords(point.latRef, point.longRef) ?? '—'}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap font-mono text-xs`}>
                      {formatCoords(point.latReal, point.longReal) ?? '—'}
                    </td>
                    {sheetStructure === 'extended' && (
                      <td className={`${ui.td} whitespace-nowrap font-mono`}>
                        {extPoint.lectura !== null && extPoint.lectura !== undefined && extPoint.lectura !== ''
                          ? <span className="text-energy">{extPoint.lectura}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    )}
                    <td className={ui.td}>
                      <div className="flex items-center gap-1">
                        {point.photoCount > 0 && (
                          <button
                            onClick={() => setSelectedPoint(point)}
                            className="rounded-lg p-2 text-electric transition-colors hover:bg-gray-100"
                            title="Ver fotos"
                            aria-label="Ver fotos"
                          >
                            <Camera size={16} />
                          </button>
                        )}
                        {(point.latReal || point.latRef) && (
                          <a
                            href={`https://www.google.com/maps?q=${point.latReal || point.latRef},${point.longReal || point.longRef}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-2 text-green-700 transition-colors hover:bg-gray-100"
                            title="Ver en Google Maps"
                            aria-label="Ver en Google Maps"
                          >
                            <MapPin size={16} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paginatedPoints.length === 0 && (
          <EmptyState
            icon="medidor"
            title="No se encontraron suministros"
            description={hasActiveFilters
              ? 'Ningún suministro coincide con los filtros aplicados.'
              : 'Esta jornada todavía no tiene suministros cargados.'}
            action={hasActiveFilters ? (
              <button onClick={resetFilters} className={ui.btnSecondary}>
                <RotateCcw size={16} />
                Limpiar filtros
              </button>
            ) : undefined}
          />
        )}

        {/* Controles de paginación */}
        {sortedPoints.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-500">
                Filas <span className="font-mono text-gray-900">{fmt(startIndex + 1)}–{fmt(Math.min(endIndex, sortedPoints.length))}</span> de{' '}
                <span className="font-mono text-gray-900">{fmt(sortedPoints.length)}</span>
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-500">
                Filas por página
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className={`${ui.input} w-auto py-1`}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1.5">
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
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-sm text-gray-500">
                Página <span className="font-mono text-gray-900">{currentPage}</span> de{' '}
                <span className="font-mono text-gray-900">{totalPages || 1}</span>
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className={pagerBtn}
                title="Página siguiente"
                aria-label="Página siguiente"
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

      {/* Modal de fotos */}
      {selectedPoint && (
        <PhotoGalleryModal
          photos={selectedPoint.photoLinks}
          suministro={selectedPoint.suministro}
          initialIndex={0}
          onClose={() => setSelectedPoint(null)}
        />
      )}

      {/* Modal de upload */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        currentSheet={selectedSheet || ''}
        sheets={sheets}
        onSuccess={async () => {
          // Recargar la lista de jornadas (por si se creo una nueva) y los puntos
          await loadSheets();
          await refreshPoints();
        }}
      />
    </div>
  );
}
