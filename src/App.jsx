import React, { useState, useMemo } from 'react';
import { 
  Layout, Ruler, Bot, Sparkles, Loader2, Wrench, 
  Calculator, Coins, SquareDashed, Download, CheckCircle2, Layers, ShieldCheck, Sliders
} from 'lucide-react';

// Lấy API Key an toàn cho môi trường Vite & Vercel
const getApiKey = () => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch {
    return "";
  }
};

// Làm sạch ký tự Markdown và LaTeX thừa từ phản hồi AI
const cleanAIText = (rawText) => {
  return rawText
    .replace(/\*\*/g, '')
    .replace(/###\s*/g, '📌 ')
    .replace(/##\s*/g, '🔷 ')
    .replace(/\$90\^\\circ\$/g, '90°')
    .replace(/\\times/g, 'x')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\$/g, '')
    .replace(/^\|.*\|$/gm, (line) => line.replace(/\|/g, ' • ').trim());
};

// Gọi Gemini API kèm cơ chế tự động thử lại khi lỗi 503/429
const fetchGemini = async (prompt) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Chưa cấu hình VITE_GEMINI_API_KEY trong file .env hoặc trên Vercel.");
  }

  const formattedPrompt = `${prompt}\n\nYÊU CẦU TRÌNH BÀY: Trả lời hoàn toàn bằng danh sách gạch đầu dòng ngắn gọn, rõ ràng. TUYỆT ĐỐI KHÔNG dùng bảng Markdown (ký tự |) và KHÔNG dùng công thức LaTeX (ký tự $).`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: formattedPrompt }] }]
        })
      }
    );

    if (response.ok) {
      const result = await response.json();
      const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || "Không nhận được phản hồi từ AI.";
      return cleanAIText(raw);
    }

    if ((response.status === 503 || response.status === 429) && attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

// ============================================================================
// THUẬT TOÁN HÌNH HỌC TỐI ƯU RIÊNG CHO TẤM FORMEX (PVC FOAM) & KHUNG NHÔM 2060
// ============================================================================

// Nội suy bo tròn góc (Corner Fillet) mượt cho đường cắt CNC/Laser
const filletClosedPolygon = (rawVertices, arcSegments = 8) => {
  const pts = rawVertices.filter((pt, idx) => {
    const prev = rawVertices[(idx - 1 + rawVertices.length) % rawVertices.length];
    return Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-3;
  });

  const n = pts.length;
  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const r = curr.r || 0;

    if (r <= 0.05) {
      result.push([curr.x, curr.y]);
      continue;
    }

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    const u1x = v1x / len1;
    const u1y = v1y / len1;
    const u2x = v2x / len2;
    const u2y = v2y / len2;

    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const theta = Math.acos(dot);

    if (theta < 0.05 || Math.abs(Math.PI - theta) < 0.05) {
      result.push([curr.x, curr.y]);
      continue;
    }

    const halfTan = Math.tan(theta / 2);
    let tangentDist = r / halfTan;
    const maxDist = Math.min(len1, len2) * 0.44;
    if (tangentDist > maxDist) {
      tangentDist = maxDist;
    }
    const actualR = tangentDist * halfTan;

    const t1x = curr.x + u1x * tangentDist;
    const t1y = curr.y + u1y * tangentDist;
    const t2x = curr.x + u2x * tangentDist;
    const t2y = curr.y + u2y * tangentDist;

    const bx = u1x + u2x;
    const by = u1y + u2y;
    const bLen = Math.hypot(bx, by);
    const centerDist = actualR / Math.sin(theta / 2);
    const cx = curr.x + (bx / bLen) * centerDist;
    const cy = curr.y + (by / bLen) * centerDist;

    const startAngle = Math.atan2(t1y - cy, t1x - cx);
    const endAngle = Math.atan2(t2y - cy, t2x - cx);

    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;

    for (let s = 0; s <= arcSegments; s++) {
      const a = startAngle + (sweep * s) / arcSegments;
      result.push([cx + actualR * Math.cos(a), cy + actualR * Math.sin(a)]);
    }
  }

  if (result.length > 0) {
    result.push([result[0][0], result[0][1]]);
  }
  return result;
};

// Tạo đỉnh trên 1 cạnh với 3 chế độ chuyên biệt chống gãy cho Formex
const getEdgeVertices = (x1, y1, x2, y2, tabType, options) => {
  const {
    kerf = 0.1,
    jointMode = 'formex_trapezoid',
    customDepth = 10,
    customUndercut = -2.5,
    tabFillet = 4.5,
    cornerRadius = 3.0
  } = options;

  if (tabType === 0) {
    return [{ x: x2, y: y2, r: cornerRadius }];
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;

  const nx = -uy * tabType;
  const ny = ux * tabType;

  // Bù tia cắt (dương phình ra +kerf/2, âm thu vào -kerf/2)
  const k = (tabType === 1 ? 1 : -1) * (kerf / 2);
  const scale = L / 300;

  let positions = [0.27 * L, 0.73 * L];
  let baseHalfWidth = 30 * scale;

  if (jointMode === 'single_heavy') {
    // 1 Ngàm đơn bản đại 90mm ở chính giữa
    positions = [0.5 * L];
    baseHalfWidth = 44 * scale;
  } else if (jointMode === 'formex_wave') {
    // 2 Ngàm sóng bản rộng đàn hồi nhẹ
    positions = [0.27 * L, 0.73 * L];
    baseHalfWidth = 24 * scale;
  } else {
    // 'formex_trapezoid': 2 Mộng thang chân rộng (Không thắt cổ - chống đứt 100%)
    positions = [0.27 * L, 0.73 * L];
    baseHalfWidth = 28 * scale;
  }

  const depth = customDepth * scale + k;
  const neckHalf = baseHalfWidth + k;
  // customUndercut < 0: chân rộng hơn đỉnh (mộng hình thang tự lựa). customUndercut > 0: đỉnh loe nhẹ khóa bấm
  const headHalf = (baseHalfWidth + customUndercut) * scale + k;
  const rFillet = Math.min(tabFillet, customDepth * 0.48);

  const vertices = [];

  positions.forEach((centerPos) => {
    vertices.push(
      {
        x: x1 + ux * (centerPos - neckHalf),
        y: y1 + uy * (centerPos - neckHalf),
        r: rFillet
      },
      {
        x: x1 + ux * (centerPos - headHalf) + nx * depth,
        y: y1 + uy * (centerPos - headHalf) + ny * depth,
        r: rFillet
      },
      {
        x: x1 + ux * (centerPos + headHalf) + nx * depth,
        y: y1 + uy * (centerPos + headHalf) + ny * depth,
        r: rFillet
      },
      {
        x: x1 + ux * (centerPos + neckHalf),
        y: y1 + uy * (centerPos + neckHalf),
        r: rFillet
      }
    );
  });

  vertices.push({ x: x2, y: y2, r: cornerRadius });
  return vertices;
};

// Sinh biên dạng hoàn chỉnh cho 1 tấm
const generateTilePoints = (size, edges, offsetX = 0, offsetY = 0, options = {}) => {
  const [top, right, bottom, left] = edges;
  const rawVertices = [];

  rawVertices.push(...getEdgeVertices(offsetX, offsetY, offsetX, offsetY + size, left, options));
  rawVertices.push(...getEdgeVertices(offsetX, offsetY + size, offsetX + size, offsetY + size, top, options));
  rawVertices.push(...getEdgeVertices(offsetX + size, offsetY + size, offsetX + size, offsetY, right, options));
  rawVertices.push(...getEdgeVertices(offsetX + size, offsetY, offsetX, offsetY, bottom, options));

  return filletClosedPolygon(rawVertices, 8);
};

// Tạo nội dung file DXF chuẩn AutoCAD R12 (Đơn vị: mm)
const buildDXFContent = (polylines) => {
  let dxf = "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n";
  dxf += "0\nSECTION\n2\nENTITIES\n";

  polylines.forEach(({ points, layer = "CUT_LINE", color = 7 }) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      dxf += "0\nLINE\n";
      dxf += `8\n${layer}\n`;
      dxf += `62\n${color}\n`;
      dxf += `10\n${x1.toFixed(4)}\n20\n${y1.toFixed(4)}\n30\n0.0\n`;
      dxf += `11\n${x2.toFixed(4)}\n21\n${y2.toFixed(4)}\n31\n0.0\n`;
    }
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
};

const downloadDXFFile = (filename, dxfContent) => {
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const pointsToSVGPath = (points, tileSize) => {
  if (!points.length) return '';
  return points.map((pt, idx) => {
    const svgX = pt[0];
    const svgY = tileSize - pt[1];
    return `${idx === 0 ? 'M' : 'L'} ${svgX.toFixed(2)} ${svgY.toFixed(2)}`;
  }).join(' ') + ' Z';
};

export default function App() {
  const [activeTab, setActiveTab] = useState('assembly');
  const [width, setWidth] = useState(1500);
  const [length, setLength] = useState(1500);
  const [tileSize, setTileSize] = useState(300);

  // Mặc định chọn chế độ tối ưu nhất cho Formex có khung nhôm 2060
  const [jointMode, setJointMode] = useState('formex_trapezoid');
  const [customDepth, setCustomDepth] = useState(10); // Ngàm nông 10mm chống bẩy gãy
  const [customUndercut, setCustomUndercut] = useState(-2.5); // -2.5mm: Chân rộng hơn đỉnh (không thắt cổ)
  const [tabFillet, setTabFillet] = useState(4.5);
  const [cornerRadius, setCornerRadius] = useState(3.0);
  const [kerf, setKerf] = useState(0.1);
  const [material, setMaterial] = useState('Nhựa PVC Foam (Formex cứng) 8mm - 10mm');

  const [loadingAI, setLoadingAI] = useState({ floor: false, frame: false, mat: false, cost: false });
  const [aiResult, setAiResult] = useState({ floor: '', frame: '', mat: '', cost: '' });

  // Khi người dùng đổi chế độ mẫu ngàm, tự động nạp bộ thông số chuẩn cho chế độ đó
  const handleSelectJointPreset = (mode) => {
    setJointMode(mode);
    if (mode === 'formex_trapezoid') {
      // Mộng thang chân rộng (Dùng khi có khung nhôm 2060 giữ ngoài) -> Không thắt cổ, tháo lắp siêu bền
      setCustomDepth(10);
      setCustomUndercut(-2.5);
      setTabFillet(4.5);
    } else if (mode === 'formex_wave') {
      // Ngàm sóng đàn hồi nhẹ cho Formex (Độ loe chỉ 1.2mm vừa đủ ôm khít mà không rách xốp)
      setCustomDepth(10);
      setCustomUndercut(1.2);
      setTabFillet(4.8);
    } else if (mode === 'single_heavy') {
      // Ngàm đơn bản đại 90mm ở giữa
      setCustomDepth(12);
      setCustomUndercut(1.5);
      setTabFillet(5.0);
    }
  };

  const cols = Math.max(1, Math.round(width / tileSize));
  const rows = Math.max(1, Math.round(length / tileSize));
  const actualWidth = cols * tileSize;
  const actualLength = rows * tileSize;

  const stats = useMemo(() => {
    const total = cols * rows;
    const corners = (cols >= 2 && rows >= 2) ? 4 : (total === 1 ? 1 : 2);
    const edges = (cols >= 2 && rows >= 2) ? 2 * (cols - 2) + 2 * (rows - 2) : Math.max(0, total - corners);
    const centers = Math.max(0, total - corners - edges);
    return { total, corners, edges, centers };
  }, [cols, rows]);

  const getCellEdges = (r, c) => {
    const top = r === 0 ? 0 : -1;
    const bottom = r === rows - 1 ? 0 : 1;
    const left = c === 0 ? 0 : -1;
    const right = c === cols - 1 ? 0 : 1;
    return [top, right, bottom, left];
  };

  const geoOptions = { kerf, jointMode, customDepth, customUndercut, tabFillet, cornerRadius };

  const handleExportSingleTileDXF = (name, edges) => {
    const points = generateTilePoints(tileSize, edges, 0, 0, geoOptions);
    const dxfContent = buildDXFContent([{ points, layer: "CUT_OUTLINE", color: 7 }]);
    downloadDXFFile(`${name}_${tileSize}x${tileSize}mm_${jointMode}.dxf`, dxfContent);
  };

  const handleExportAllTilesDXF = () => {
    const polylines = [];
    const spacing = tileSize + 45;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const edges = getCellEdges(r, c);
        const offsetX = c * spacing;
        const offsetY = (rows - 1 - r) * spacing;
        const points = generateTilePoints(tileSize, edges, offsetX, offsetY, geoOptions);
        
        const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
        const isEdge = !isCorner && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
        const layerName = isCorner ? "TAM_GOC" : (isEdge ? "TAM_VIEN" : "TAM_TRUNG_TAM");
        const colorCode = isCorner ? 30 : (isEdge ? 5 : 3);

        polylines.push({ points, layer: layerName, color: colorCode });
      }
    }

    const dxfContent = buildDXFContent(polylines);
    downloadDXFFile(`Sa_Ban_Formex_${actualWidth}x${actualLength}mm.dxf`, dxfContent);
  };

  const runAIAssistant = async (type, promptText) => {
    setLoadingAI(prev => ({ ...prev, [type]: true }));
    try {
      const reply = await fetchGemini(promptText);
      setAiResult(prev => ({ ...prev, [type]: reply }));
    } catch (err) {
      setAiResult(prev => ({ ...prev, [type]: `Lỗi kết nối AI: ${err.message}. Vui lòng thử lại sau vài giây.` }));
    } finally {
      setLoadingAI(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                Thiết kế Sa Bàn {actualWidth}x{actualLength}mm
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-teal-100 text-teal-800 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Chuyên Dụng Cho Formex & CNC
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Module {tileSize}x{tileSize}mm • Khung nhôm 2060 • Ngàm sâu {customDepth}mm (Độ loe: {customUndercut}mm)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('assembly')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'assembly'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layout className="w-4 h-4" />
              Lắp ráp tổng thể
            </button>

            <button
              onClick={() => setActiveTab('cnc')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'cnc'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Tối ưu Ngàm Formex & Xuất DXF
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'ai'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Bot className="w-4 h-4" />
              Trợ lý AI
            </button>
          </div>
        </header>

        {/* =================================================================
            TAB 1: LẮP RÁP TỔNG THỂ
        ================================================================= */}
        {activeTab === 'assembly' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
              <h2 className="text-lg font-bold text-slate-800 mb-1">
                Sơ đồ {stats.total} mảnh ghép ({cols}x{rows})
              </h2>
              <p className="text-xs text-slate-500 mb-5 text-center">
                Chế độ hiện tại: <strong>
                  {jointMode === 'formex_trapezoid'
                    ? 'Mộng Thang Chân Rộng (Chống gãy 100% khi dùng với Khung Nhôm 2060)'
                    : jointMode === 'formex_wave'
                    ? 'Ngàm Sóng Đàn Hồi Nhẹ (Độ loe 1.2mm chuyên cho xốp Formex)'
                    : 'Ngàm Đơn Bản Đại 90mm (Chịu lực cao)'}
                </strong>
              </p>

              {/* Bộ chọn nhanh */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl mb-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Chiều rộng (mm)
                  </label>
                  <input
                    type="number"
                    step={tileSize}
                    min={tileSize}
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value) || tileSize)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Chiều dài (mm)
                  </label>
                  <input
                    type="number"
                    step={tileSize}
                    min={tileSize}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value) || tileSize)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-teal-700 uppercase mb-1">
                    Chế độ ngàm tối ưu cho Formex
                  </label>
                  <select
                    value={jointMode}
                    onChange={(e) => handleSelectJointPreset(e.target.value)}
                    className="w-full px-3 py-2 border border-teal-300 bg-teal-50/60 text-teal-950 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="formex_trapezoid">1. Mộng Thang Chân Rộng (Tối ưu nhất cho Formex + Khung 2060)</option>
                    <option value="formex_wave">2. Ngàm Sóng Đàn Hồi Nhẹ (Loe 1.2mm - Bấm êm không rách Formex)</option>
                    <option value="single_heavy">3. Ngàm Đơn Bản Đại 90mm (1 Mộng lớn chính giữa siêu khỏe)</option>
                  </select>
                </div>
              </div>

              {/* Bản vẽ SVG */}
              <div className="w-full flex justify-center overflow-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
                <svg
                  viewBox={`-30 -30 ${cols * tileSize + 60} ${rows * tileSize + 60}`}
                  className="w-full max-w-[520px] h-auto drop-shadow-sm"
                >
                  {Array.from({ length: rows }).map((_, r) =>
                    Array.from({ length: cols }).map((__, c) => {
                      const edges = getCellEdges(r, c);
                      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
                      const isEdge = !isCorner && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
                      
                      const fillColor = isCorner ? '#f97316' : isEdge ? '#3b82f6' : '#10b981';
                      const pts = generateTilePoints(tileSize, edges, 0, 0, {
                        ...geoOptions,
                        kerf: 0
                      });
                      const dPath = pointsToSVGPath(pts, tileSize);

                      return (
                        <g key={`${r}-${c}`} transform={`translate(${c * tileSize}, ${r * tileSize})`}>
                          <path
                            d={dPath}
                            fill={fillColor}
                            stroke="#1e293b"
                            strokeWidth={Math.max(2, tileSize / 125)}
                            className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
                          />
                          <text
                            x={tileSize / 2}
                            y={tileSize / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#ffffff"
                            fontSize={tileSize / 10}
                            fontWeight="bold"
                          >
                            {r + 1}-{c + 1}
                          </text>
                        </g>
                      );
                    })
                  )}
                </svg>
              </div>
            </div>

            {/* Cột phải */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Số lượng gia công Sàn
                </h3>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <span className="flex items-center gap-2 font-medium text-emerald-900">
                      <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block"></span>
                      Tấm Trung Tâm
                    </span>
                    <span className="font-bold text-emerald-700">{stats.centers} tấm</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <span className="flex items-center gap-2 font-medium text-blue-900">
                      <span className="w-3.5 h-3.5 rounded bg-blue-500 inline-block"></span>
                      Tấm Viền
                    </span>
                    <span className="font-bold text-blue-700">{stats.edges} tấm</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <span className="flex items-center gap-2 font-medium text-orange-900">
                      <span className="w-3.5 h-3.5 rounded bg-orange-500 inline-block"></span>
                      Tấm Góc
                    </span>
                    <span className="font-bold text-orange-700">{stats.corners} tấm</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-base font-bold text-slate-900">
                    <span>Tổng cộng:</span>
                    <span>{stats.total} Tấm</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-2xl shadow-md p-6 text-white">
                <h3 className="text-base font-bold flex items-center gap-2 mb-2">
                  <Download className="w-5 h-5" />
                  Xuất File CAD (.DXF) Cho Formex
                </h3>
                <p className="text-xs text-teal-100 mb-4 leading-relaxed">
                  Biên dạng ngàm đã triệt tiêu hoàn toàn cổ thắt hẹp, giúp cắt trên <strong>Formex 5mm - 10mm</strong> tháo lắp liên tục không bị gập hay rách mộng.
                </p>

                <button
                  onClick={handleExportAllTilesDXF}
                  className="w-full py-3 px-4 bg-white text-teal-800 hover:bg-teal-50 font-bold text-sm rounded-xl shadow transition flex items-center justify-center gap-2 mb-2.5"
                >
                  <Download className="w-4 h-4" />
                  Tải trọn bộ {stats.total} tấm (.DXF)
                </button>

                <button
                  onClick={() => setActiveTab('cnc')}
                  className="w-full py-2.5 px-4 bg-teal-900/40 hover:bg-teal-900/60 text-white font-medium text-xs rounded-xl transition flex items-center justify-center gap-1"
                >
                  Tinh chỉnh độ sâu & độ loe ngàm theo ý muốn →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 2: TỐI ƯU NGÀM FORMEX & XUẤT DXF CHI TIẾT
        ================================================================= */}
        {activeTab === 'cnc' && (
          <div className="space-y-6">
            
            {/* Bảng điều khiển cơ khí */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-teal-600" />
                    Bảng Tinh Chỉnh Cơ Khí Chuyên Dụng Cho Tấm Formex
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Điều chỉnh trực tiếp <strong>Độ loe khóa (Undercut)</strong> và <strong>Độ sâu ngàm</strong> để phù hợp với độ mềm của Formex
                  </p>
                </div>

                <button
                  onClick={handleExportAllTilesDXF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-sm transition shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Xuất toàn bộ {stats.total} tấm (.DXF)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-teal-50/70 p-3.5 rounded-xl border border-teal-200 lg:col-span-2">
                  <label className="block text-xs font-bold text-teal-900 mb-1">
                    1. Chế độ Ngàm Formex (3 Preset chuẩn)
                  </label>
                  <select
                    value={jointMode}
                    onChange={(e) => handleSelectJointPreset(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-sm font-semibold text-teal-800"
                  >
                    <option value="formex_trapezoid">Mộng Thang Chân Rộng (Có khung nhôm 2060)</option>
                    <option value="formex_wave">Ngàm Sóng Đàn Hồi Nhẹ (Loe 1.2mm)</option>
                    <option value="single_heavy">Ngàm Đơn Bản Đại 90mm (1 Mộng Giữa)</option>
                  </select>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Độ sâu ngàm (mm)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="6"
                    max="18"
                    value={customDepth}
                    onChange={(e) => setCustomDepth(Number(e.target.value) || 10)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700"
                  />
                  <span className="text-[11px] text-slate-400">Khuyên dùng: 8 - 10mm</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. Độ loe khóa (mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="-5"
                    max="4"
                    value={customUndercut}
                    onChange={(e) => setCustomUndercut(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700"
                  />
                  <span className="text-[11px] text-slate-400">Âm (-): Mộng thang | Dương (+): Khóa</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    4. Bù dao/tia cắt Kerf (mm)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={kerf}
                    onChange={(e) => setKerf(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700"
                  />
                  <span className="text-[11px] text-slate-400">Formex nên để 0.05 - 0.1mm</span>
                </div>
              </div>
            </div>

            {/* 3 Mẫu biên dạng */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: '1. Mẫu Tấm Trung Tâm',
                  desc: `Số lượng: ${stats.centers} tấm (4 cạnh mộng Formex)`,
                  filename: 'Tam_Trung_Tam_Formex',
                  edges: [-1, 1, 1, -1],
                  badgeColor: 'bg-emerald-100 text-emerald-800',
                  strokeColor: '#059669'
                },
                {
                  title: '2. Mẫu Tấm Viền (Sát khung 2060)',
                  desc: `Số lượng: ${stats.edges} tấm (1 cạnh phẳng tựa khung nhôm)`,
                  filename: 'Tam_Vien_Formex',
                  edges: [0, 1, 1, -1],
                  badgeColor: 'bg-blue-100 text-blue-800',
                  strokeColor: '#2563eb'
                },
                {
                  title: '3. Mẫu Tấm Góc (Góc khung 2060)',
                  desc: `Số lượng: ${stats.corners} tấm (2 cạnh phẳng góc khung nhôm)`,
                  filename: 'Tam_Goc_Formex',
                  edges: [0, 1, 1, 0],
                  badgeColor: 'bg-orange-100 text-orange-800',
                  strokeColor: '#ea580c'
                }
              ].map((item, idx) => {
                const previewPts = generateTilePoints(tileSize, item.edges, 0, 0, geoOptions);
                const svgPath = pointsToSVGPath(previewPts, tileSize);

                return (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
                    <div>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${item.badgeColor}`}>
                        Sâu {customDepth}mm • Độ loe {customUndercut}mm
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 mb-4">{item.desc}</p>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center mb-4">
                        <svg viewBox={`-30 -30 ${tileSize + 60} ${tileSize + 60}`} className="w-52 h-52">
                          <path
                            d={svgPath}
                            fill="#ffffff"
                            stroke={item.strokeColor}
                            strokeWidth="3"
                          />
                          <text
                            x={tileSize / 2}
                            y={tileSize / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#64748b"
                            fontSize={tileSize / 12}
                            fontWeight="bold"
                          >
                            {tileSize}x{tileSize}mm
                          </text>
                        </svg>
                      </div>
                    </div>

                    <button
                      onClick={() => handleExportSingleTileDXF(item.filename, item.edges)}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Tải {item.filename}.dxf
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Giải thích kỹ thuật cho Formex */}
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-xs text-teal-950 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Vì sao thiết kế này giải quyết triệt để lỗi gãy góc trên Formex?</p>
                <p>• <strong>Khi để Độ loe âm (-2.5mm - Mộng Thang Chân Rộng):</strong> Phần gốc nối với thân tấm rộng tới 60mm và thuôn nhẹ về phía đỉnh. Khi đặt nằm trong <strong>khung nhôm 2060</strong>, 4 thanh nhôm viền đã khóa chặt toàn bộ sàn không cho chạy ngang, còn các mộng thang giữ cho mặt sàn phẳng tuyệt đối và tháo lắp nhẹ nhàng mà <strong>không bao giờ bị đứt cổ mộng</strong>.</p>
                <p>• <strong>Khi để Độ loe dương nhỏ (+1.2mm - Ngàm Sóng Đàn Hồi):</strong> Chỉ tạo độ gài 1.2mm vừa đúng giới hạn đàn hồi của nhựa bọt Formex, giúp ấn sập xuống nhẹ nhàng mà không làm gập trắng hay rách tai ngàm.</p>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 3: TRỢ LÝ KỸ SƯ AI
        ================================================================= */}
        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Calculator className="w-5 h-5" />
                Kỹ sư Tính toán Sàn Formex
              </div>
              <p className="text-sm text-slate-600">
                Tính toán số lượng tấm Formex nguyên khổ 1220x2440mm cần mua và cách xếp phôi (nesting) tiết kiệm nhất.
              </p>
              <button
                disabled={loadingAI.floor}
                onClick={() =>
                  runAIAssistant(
                    'floor',
                    `Tôi cần cắt sàn sa bàn kích thước ${actualWidth}x${actualLength}mm bằng tấm Formex ghép từ ${stats.total} tấm vuông ${tileSize}x${tileSize}mm (${stats.centers} tấm trung tâm, ${stats.edges} tấm viền, ${stats.corners} tấm góc) có mộng nhô ra ${customDepth}mm. Hãy tính số lượng tấm Formex chuẩn khổ 1220x2440mm cần mua và cách xếp phôi tối ưu.`
                  )
                }
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loadingAI.floor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Tính toán Mảnh Ghép Sàn ✨
              </button>
              {aiResult.floor && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm whitespace-pre-line leading-relaxed">
                  {aiResult.floor}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-lg border-b border-slate-100 pb-3">
                <SquareDashed className="w-5 h-5" />
                Kỹ sư Khung Nhôm 2060
              </div>
              <p className="text-sm text-slate-600">
                Bóc tách khối lượng thanh nhôm định hình 2060 và phụ kiện cần thiết để dựng viền bao quanh kích thước <strong>{actualWidth}x{actualLength}mm</strong>.
              </p>
              <button
                disabled={loadingAI.frame}
                onClick={() =>
                  runAIAssistant(
                    'frame',
                    `Hãy bóc tách khối lượng vật tư chi tiết để làm khung viền bao quanh sa bàn kích thước lọt lòng ${actualWidth}x${actualLength}mm bằng nhôm định hình 2060 (dựng đứng thành cao 60mm). Liệt kê chiều dài các thanh nhôm cần cắt, số lượng ke góc vuông, ốc lục giác và con chạy T-nut.`
                  )
                }
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loadingAI.frame ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Bóc tách Vật tư Nhôm ✨
              </button>
              {aiResult.frame && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm whitespace-pre-line leading-relaxed">
                  {aiResult.frame}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Wrench className="w-5 h-5" />
                Chuyên gia Gia công Formex
              </div>
              <p className="text-sm text-slate-600">
                Phân tích kỹ thuật cắt CNC (dao phay) hoặc Laser trên vật liệu bạn chọn để mép mộng không bị cháy hoặc xơ bavia.
              </p>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white"
              >
                <option>Nhựa PVC Foam (Formex cứng) 8mm - 10mm</option>
                <option>Nhựa PVC Foam (Formex) 5mm</option>
                <option>Gỗ MDF 5mm (Phổ biến)</option>
                <option>Gỗ Plywood (Ván ép) 6mm - 8mm</option>
              </select>
              <button
                disabled={loadingAI.mat}
                onClick={() =>
                  runAIAssistant(
                    'mat',
                    `Tôi gia công các tấm ghép sàn sa bàn ${tileSize}x${tileSize}mm bằng vật liệu "${material}" với mộng sâu ${customDepth}mm, độ loe ${customUndercut}mm. Hãy tư vấn nên cắt bằng máy CNC (dao xoắn 1 me) hay máy Laser, cách chọn thông số cắt và dung sai để lắp ghép khít, bền đẹp nhất.`
                  )
                }
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loadingAI.mat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Phân tích Gia công ✨
              </button>
              {aiResult.mat && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm whitespace-pre-line leading-relaxed">
                  {aiResult.mat}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Coins className="w-5 h-5" />
                Chuyên gia Báo giá
              </div>
              <p className="text-sm text-slate-600">
                Ước tính chi phí vật tư và gia công cắt CNC cho bộ sa bàn ({actualWidth}x{actualLength}mm) bằng {material} kèm khung nhôm 2060.
              </p>
              <button
                disabled={loadingAI.cost}
                onClick={() =>
                  runAIAssistant(
                    'cost',
                    `Hãy lập dự toán chi phí vật tư và gia công tại Việt Nam (VNĐ) cho 1 bộ sa bàn kích thước ${actualWidth}x${actualLength}mm gồm: ${stats.total} tấm sàn (${tileSize}x${tileSize}mm) bằng "${material}" cắt CNC theo file DXF, cộng với bộ khung viền nhôm định hình 2060 bao quanh.`
                  )
                }
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loadingAI.cost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Dự toán Chi phí Tổng ✨
              </button>
              {aiResult.cost && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm whitespace-pre-line leading-relaxed">
                  {aiResult.cost}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}