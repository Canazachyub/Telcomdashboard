import { useState, useMemo, useRef } from 'react';
import { usePointsStore, useSheetStructure, useTecnicos, useDistritos, useFilters, useIsTecnico } from '../stores/pointsStore';
import { getPointStatus, getStatusLabel } from '../types/point';
import {
  Search, Filter, Download, Camera, MapPin, Users, Building2, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Upload,
  FileSpreadsheet, X, AlertCircle, CheckCircle, RefreshCw, ChevronDown
} from 'lucide-react';
import type { GpsPoint, GpsPointExtended } from '../types/point';
import PhotoGalleryModal from '../components/PhotoGalleryModal';
import * as XLSX from 'xlsx';
import { API_POINTS } from '../config/api';

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
        setError('Error al parsear el archivo. Verifica que sea un Excel o CSV válido.');
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
      setError(sheetMode === 'new' ? 'Ingresa un nombre para la nueva hoja' : 'Selecciona una hoja existente');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Upload size={20} />
              Importar Suministros desde Excel
            </h3>
            <p className="text-blue-100 text-sm">Crea una nueva jornada o agrega a una existente</p>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-white/20 rounded text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Selector de archivo */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <FileSpreadsheet className="mx-auto text-gray-400 mb-3" size={48} />
            {file ? (
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">Arrastra un archivo Excel aqui o</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Seleccionar Archivo
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Formatos soportados: Excel (.xlsx, .xls) o CSV
                </p>
              </div>
            )}
          </div>

          {/* Columnas detectadas */}
          {detectedColumns.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h4 className="font-medium text-green-800 mb-2 text-sm flex items-center gap-1">
                <CheckCircle size={14} />
                Columnas detectadas ({detectedColumns.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {detectedColumns.map((col, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Selector de hoja destino - Solo mostrar cuando hay datos parseados */}
          {parsedData.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Destino de los datos</h4>

              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheetMode"
                    checked={sheetMode === 'new'}
                    onChange={() => setSheetMode('new')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium">Crear nueva jornada</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheetMode"
                    checked={sheetMode === 'existing'}
                    onChange={() => setSheetMode('existing')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium">Agregar a existente</span>
                </label>
              </div>

              {sheetMode === 'new' ? (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Nombre de la nueva jornada:
                  </label>
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    placeholder="Ej: Jornada_Enero_2025"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Se creará una nueva hoja en Google Sheets con este nombre
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Seleccionar jornada existente:
                  </label>
                  <select
                    value={selectedExistingSheet}
                    onChange={(e) => setSelectedExistingSheet(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Seleccionar --</option>
                    {sheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.name}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Los suministros se agregarán al final de la hoja seleccionada
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Info del formato */}
          {!parsedData.length && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="font-medium text-blue-800 mb-1 text-sm">Formato del archivo</h4>
              <p className="text-xs text-blue-700">
                El archivo debe tener una columna <strong>Suministro</strong> (requerida).
                Columnas reconocidas: Nº, Tecnico, Fecha de Contraste, Suministro, Codigoderuta,
                Nombres y Apellidos, Direccion, Distrito, SED, Marca, Modelo, Serie, Fase, Año,
                Hilos, Consumo Promedio, Equipo patron, Carga, DNI, Longitud, Latitud, GIS.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle size={18} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Success */}
          {success && uploadResult && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
              <CheckCircle size={18} />
              <span className="text-sm">
                ¡{uploadResult.rowsAdded} suministros subidos correctamente a "{uploadResult.sheetName}"!
              </span>
            </div>
          )}

          {/* Preview de datos */}
          {parsedData.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                Vista previa ({parsedData.length} suministros)
              </h4>
              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">#</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Suministro</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Serie</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Cliente</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Distrito</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Tecnico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium">{row.suministro}</td>
                        <td className="py-2 px-3 text-gray-600">{row.serie || '-'}</td>
                        <td className="py-2 px-3 text-gray-600 max-w-[150px] truncate">{row.cliente || '-'}</td>
                        <td className="py-2 px-3 text-gray-600">{row.distrito || '-'}</td>
                        <td className="py-2 px-3 text-gray-600">{row.tecnico || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 50 && (
                  <div className="text-center py-2 text-sm text-gray-500 bg-gray-50">
                    ... y {parsedData.length - 50} filas más
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={parsedData.length === 0 || uploading || success || (sheetMode === 'new' && !newSheetName.trim()) || (sheetMode === 'existing' && !selectedExistingSheet)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {uploading && <RefreshCw size={16} className="animate-spin" />}
            {success ? '¡Subido!' : uploading ? 'Subiendo...' : `Subir ${parsedData.length} Suministros`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuministrosPage() {
  const {
    filteredPoints, pointsExtended, selectedSheet, sheets, isLoading,
    setFilter: setStoreFilter, resetFilters, setSelectedSheet, refreshPoints
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
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />;
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
    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

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
        ].join(',');
      }

      return [
        escapeCSV(p.suministro),
        escapeCSV(statusLabel),
        escapeCSV(p.photoCount),
        escapeCSV(p.latRef),
        escapeCSV(p.longRef),
        escapeCSV(p.latReal),
        escapeCSV(p.longReal)
      ].join(',');
    });

    // Agregar BOM para UTF-8 (para que Excel reconozca acentos)
    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suministros_${selectedSheet}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con selector de hoja */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suministros</h1>
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
                  {sheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      onClick={() => handleSheetChange(sheet.name)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                        selectedSheet === sheet.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      }`}
                    >
                      <span>{sheet.name}</span>
                      {selectedSheet === sheet.name && (
                        <CheckCircle size={14} className="text-blue-600" />
                      )}
                    </button>
                  ))}
                  {sheets.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                      No hay hojas disponibles
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="text-gray-400">|</span>
            <span className="text-gray-500 text-sm">
              {pointsExtended.length} suministros
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshPoints}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            title="Actualizar datos"
          >
            <RefreshCw size={18} />
          </button>
          {canUpload && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload size={18} />
              Subir Excel
            </button>
          )}
          {canExport && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              Exportar
            </button>
          )}
        </div>
      </div>

      {/* Click outside handler para cerrar selector */}
      {showSheetSelector && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowSheetSelector(false)}
        />
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Buscar suministro, cliente, direccion..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filtro de estado */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="en_proceso">En Proceso</option>
              <option value="completado">Completados</option>
            </select>
          </div>

          {/* Filtros extended */}
          {sheetStructure === 'extended' && tecnicos.length > 0 && (
            <div className="flex items-center gap-2">
              <Users size={18} className="text-gray-500" />
              <select
                value={filters.tecnico}
                onChange={(e) => handleFilterChange('tecnico', e.target.value)}
                disabled={isTecnico}
                className={`border border-gray-300 rounded-lg px-3 py-2 ${
                  isTecnico ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                title={isTecnico ? 'Filtrado por tu usuario' : ''}
              >
                <option value="Todos">Todos los tecnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {isTecnico && (
                <span className="text-xs text-blue-600">(Asignado)</span>
              )}
            </div>
          )}

          {sheetStructure === 'extended' && distritos.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-gray-500" />
              <select
                value={filters.distrito}
                onChange={(e) => handleFilterChange('distrito', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="Todos">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Boton limpiar filtros */}
          {(filters.search || filters.status !== 'todos' || filters.tecnico !== 'Todos' || filters.distrito !== 'Todos') && (
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
          Mostrando {filteredPoints.length} de {pointsExtended.length} suministros
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
                  onClick={() => handleSort('suministro')}
                >
                  <span className="flex items-center gap-1">
                    Suministro
                    <SortIcon field="suministro" />
                  </span>
                </th>
                {sheetStructure === 'extended' && (
                  <>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('tecnico')}
                    >
                      <span className="flex items-center gap-1">
                        Tecnico
                        <SortIcon field="tecnico" />
                      </span>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Cliente
                    </th>
                    <th
                      className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('distrito')}
                    >
                      <span className="flex items-center gap-1">
                        Distrito
                        <SortIcon field="distrito" />
                      </span>
                    </th>
                  </>
                )}
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('status')}
                >
                  <span className="flex items-center gap-1">
                    Estado
                    <SortIcon field="status" />
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('photoCount')}
                >
                  <span className="flex items-center gap-1">
                    Fotos
                    <SortIcon field="photoCount" />
                  </span>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Coordenadas Ref.
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Coordenadas Real
                </th>
                {sheetStructure === 'extended' && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Lectura
                  </th>
                )}
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedPoints.map((point, index) => {
                const status = getPointStatus(point);
                const extPoint = point as GpsPointExtended;

                return (
                  <tr
                    key={`${point.suministro}-${index}`}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900">
                        {point.suministro}
                      </span>
                    </td>
                    {sheetStructure === 'extended' && (
                      <>
                        <td className="py-3 px-4 text-gray-600">
                          {extPoint.tecnico || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-600 max-w-[150px] truncate" title={extPoint.clienteNombre || ''}>
                          {extPoint.clienteNombre || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {extPoint.distrito || '-'}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          status === 'completado'
                            ? 'bg-green-100 text-green-800'
                            : status === 'en_proceso'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {getStatusLabel(status)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Camera size={14} />
                        {point.photoCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                      {point.latRef && point.longRef
                        ? `${point.latRef.toFixed(6)}, ${point.longRef.toFixed(6)}`
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                      {point.latReal && point.longReal
                        ? `${point.latReal.toFixed(6)}, ${point.longReal.toFixed(6)}`
                        : '-'}
                    </td>
                    {sheetStructure === 'extended' && (
                      <td className="py-3 px-4 text-gray-600 font-mono">
                        {extPoint.lectura || '-'}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {point.photoCount > 0 && (
                          <button
                            onClick={() => setSelectedPoint(point)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver fotos"
                          >
                            <Camera size={16} />
                          </button>
                        )}
                        {(point.latReal || point.latRef) && (
                          <a
                            href={`https://www.google.com/maps?q=${point.latReal || point.latRef},${point.longReal || point.longRef}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Ver en Google Maps"
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
          <div className="text-center py-12 text-gray-500">
            No se encontraron suministros
          </div>
        )}

        {/* Controles de paginación */}
        {sortedPoints.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Mostrando {startIndex + 1}-{Math.min(endIndex, sortedPoints.length)} de {sortedPoints.length}
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
                Página {currentPage} de {totalPages || 1}
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
        onSuccess={refreshPoints}
      />
    </div>
  );
}
