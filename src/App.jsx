import React, { useState, useMemo } from 'react';
import { 
  Layout, Ruler, Bot, Sparkles, Loader2, Wrench, 
  Calculator, Coins, SquareDashed, Download, CheckCircle2, Layers, ShieldCheck
} from 'lucide-react';

// Lấy API Key an toàn cho môi trường Vite & Vercel
const getApiKey = () => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch {
    return "";
  }
};

// Hàm làm sạch các ký tự Markdown và LaTeX thừa từ phản hồi AI
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

// Hàm gọi Gemini API có tự động thử lại khi lỗi 503/429
const fetchGemini = async (prompt) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Chưa cấu hình VITE_GEMINI_API_KEY trong file .env hoặc trên Vercel.");
  }

  const formattedPrompt = `${prompt}\n\nYÊU CẦU TRÌNH BÀY: Trả lời hoàn toàn bằng danh sách gạch đầu dòng ngắn gọn, rõ ràng. TUYỆT ĐỐI KHÔNG dùng bảng Markdown (ký tự |) và KHÔNG dùng công thức LaTeX (ký tự $).`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
// THUẬT TOÁN HÌNH HỌC CHỐNG GÃY GÓC (BO TRÒN CUNG R & NGÀM ĐÔI KHÓA GÓC)
// ============================================================================

// Nội suy bo tròn góc (Corner Fillet) cho đa giác khép kín
const filletClosedPolygon = (rawVertices, arcSegments = 7) => {
  // Lọc bỏ các điểm trùng nhau liên tiếp
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
    // Giới hạn chiều dài tiếp tuyến không vượt quá 42% cạnh kề để không chồng lấn cung
    const maxDist = Math.min(len1, len2) * 0.42;
    if (tangentDist > maxDist) {
      tangentDist = maxDist;
    }
    const actualR = tangentDist * halfTan;

    // 2 tiếp điểm đầu và cuối của cung bo
    const t1x = curr.x + u1x * tangentDist;
    const t1y = curr.y + u1y * tangentDist;
    const t2x = curr.x + u2x * tangentDist;
    const t2y = curr.y + u2y * tangentDist;

    // Tâm cung tròn
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

  // Đóng kín đường polyline cho DXF
  if (result.length > 0) {
    result.push([result[0][0], result[0][1]]);
  }
  return result;
};

// Tạo các đỉnh trên 1 cạnh (Hỗ trợ Ngàm Đôi chống bênh góc & Ngàm Đơn cổ rộng)
const getEdgeVertices = (x1, y1, x2, y2, tabType, options) => {
  const { kerf = 0, jointMode = 'double', tabFillet = 4.5, cornerRadius = 3 } = options;

  if (tabType === 0) {
    return [{ x: x2, y: y2, r: cornerRadius }];
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;

  // Pháp tuyến hướng ra ngoài theo chiều kim đồng hồ
  const nx = -uy * tabType;
  const ny = ux * tabType;

  // Bù dung sai mạch cắt (ngàm dương phình ra +kerf/2, ngàm âm thu hẹp -kerf/2)
  const k = (tabType === 1 ? 1 : -1) * (kerf / 2);

  const vertices = [];
  const scale = L / 300; // Tự động co giãn theo kích thước tấm

  // Tỉ lệ ngàm tối ưu chống gãy: Cổ rộng, độ loe vừa phải (3.5mm - 4.5mm), bo góc R lớn
  const positions = jointMode === 'double' ? [0.26 * L, 0.74 * L] : [0.5 * L];
  const depth = (jointMode === 'double' ? 13 : 16) * scale + k;
  const neckHalf = (jointMode === 'double' ? 19 : 28) * scale + k;
  const headHalf = (jointMode === 'double' ? 23 : 33) * scale + k;
  const rFillet = Math.min(tabFillet, depth * 0.45);

  positions.forEach((centerPos) => {
    const p1 = {
      x: x1 + ux * (centerPos - neckHalf),
      y: y1 + uy * (centerPos - neckHalf),
      r: rFillet
    };
    const p2 = {
      x: x1 + ux * (centerPos - headHalf) + nx * depth,
      y: y1 + uy * (centerPos - headHalf) + ny * depth,
      r: rFillet
    };
    const p3 = {
      x: x1 + ux * (centerPos + headHalf) + nx * depth,
      y: y1 + uy * (centerPos + headHalf) + ny * depth,
      r: rFillet
    };
    const p4 = {
      x: x1 + ux * (centerPos + neckHalf),
      y: y1 + uy * (centerPos + neckHalf),
      r: rFillet
    };
    vertices.push(p1, p2, p3, p4);
  });

  // Đỉnh kết thúc cạnh (góc tấm)
  vertices.push({ x: x2, y: y2, r: cornerRadius });
  return vertices;
};

// Sinh biên dạng hoàn chỉnh cho 1 tấm ghép
const generateTilePoints = (size, edges, offsetX = 0, offsetY = 0, options = {}) => {
  const [top, right, bottom, left] = edges;
  const rawVertices = [];

  // 1. Cạnh Trái: (0,0) -> (0, size)
  rawVertices.push(...getEdgeVertices(offsetX, offsetY, offsetX, offsetY + size, left, options));
  // 2. Cạnh Trên: (0, size) -> (size, size)
  rawVertices.push(...getEdgeVertices(offsetX, offsetY + size, offsetX + size, offsetY + size, top, options));
  // 3. Cạnh Phải: (size, size) -> (size, 0)
  rawVertices.push(...getEdgeVertices(offsetX + size, offsetY + size, offsetX + size, offsetY, right, options));
  // 4. Cạnh Dưới: (size, 0) -> (0, 0)
  rawVertices.push(...getEdgeVertices(offsetX + size, offsetY, offsetX, offsetY, bottom, options));

  return filletClosedPolygon(rawVertices, 7);
};

// Xuất chuỗi nội dung file DXF chuẩn AutoCAD R12 (Đơn vị: mm)
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

// Tải file DXF về máy
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

// Chuyển đổi tọa độ CAD sang đường dẫn SVG hiển thị trên Web
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

  // Thông số tối ưu cơ khí chống gãy góc
  const [jointMode, setJointMode] = useState('double'); // 'double' (Ngàm đôi khóa góc) | 'single' (Ngàm đơn Omega)
  const [tabFillet, setTabFillet] = useState(4.5); // Bán kính bo tròn góc ngàm (mm)
  const [cornerRadius, setCornerRadius] = useState(3.0); // Bán kính bo 4 góc tấm (mm)
  const [kerf, setKerf] = useState(0.15); // Bù mạch cắt Laser/CNC (mm)
  const [material, setMaterial] = useState('Gỗ MDF 5mm (Phổ biến)');

  const [loadingAI, setLoadingAI] = useState({ floor: false, frame: false, mat: false, cost: false });
  const [aiResult, setAiResult] = useState({ floor: '', frame: '', mat: '', cost: '' });

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

  const geoOptions = { kerf, jointMode, tabFillet, cornerRadius };

  // Xuất 1 tấm mẫu ra DXF
  const handleExportSingleTileDXF = (name, edges) => {
    const points = generateTilePoints(tileSize, edges, 0, 0, geoOptions);
    const dxfContent = buildDXFContent([{ points, layer: "CUT_OUTLINE", color: 7 }]);
    downloadDXFFile(`${name}_${tileSize}x${tileSize}mm_${jointMode}.dxf`, dxfContent);
  };

  // Xuất toàn bộ các tấm của sa bàn ra 1 file DXF
  const handleExportAllTilesDXF = () => {
    const polylines = [];
    const spacing = tileSize + 50;

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
    downloadDXFFile(`Full_Sa_Ban_Chong_Gay_${actualWidth}x${actualLength}mm.dxf`, dxfContent);
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                Thiết kế Sa Bàn {actualWidth}x{actualLength}mm
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Bản Chống Gãy Góc
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Module {tileSize}x{tileSize}mm • Ngàm bo tròn R{tabFillet}mm & Bo góc tấm R{cornerRadius}mm • Xuất CAD (.DXF)
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
              <Ruler className="w-4 h-4" />
              Cấu hình Ngàm & Xuất DXF
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
                Biên dạng <strong>{jointMode === 'double' ? 'Ngàm Đôi Bo Tròn (Khóa chặt 4 góc)' : 'Ngàm Đơn Omega Cổ Rộng'}</strong> giúp triệt tiêu ứng suất gây gãy góc
              </p>

              {/* Bộ điều khiển nhanh */}
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
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Kiểu ngàm chống gãy góc
                  </label>
                  <select
                    value={jointMode}
                    onChange={(e) => setJointMode(e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-200 bg-indigo-50/50 text-indigo-900 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="double">Ngàm Đôi Bo Tròn (2 ngàm/cạnh - Khóa góc tốt nhất)</option>
                    <option value="single">Ngàm Đơn Omega Cổ Rộng (1 ngàm lớn/cạnh)</option>
                  </select>
                </div>
              </div>

              {/* Bản vẽ SVG tổng thể */}
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
                        kerf: 0,
                        jointMode,
                        tabFillet,
                        cornerRadius
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

            {/* Cột phải: Thống kê & Xuất DXF */}
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

              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-md p-6 text-white">
                <h3 className="text-base font-bold flex items-center gap-2 mb-2">
                  <Download className="w-5 h-5" />
                  Xuất File CAD (.DXF) Chống Gãy
                </h3>
                <p className="text-xs text-indigo-100 mb-4 leading-relaxed">
                  Bản vẽ xuất ra đã được <strong>bo tròn cổ ngàm R{tabFillet}mm</strong> và <strong>bo góc tấm R{cornerRadius}mm</strong>, sẵn sàng đưa vào máy cắt CNC / Laser.
                </p>

                <button
                  onClick={handleExportAllTilesDXF}
                  className="w-full py-3 px-4 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-sm rounded-xl shadow transition flex items-center justify-center gap-2 mb-2.5"
                >
                  <Download className="w-4 h-4" />
                  Tải trọn bộ {stats.total} tấm (.DXF)
                </button>

                <button
                  onClick={() => setActiveTab('cnc')}
                  className="w-full py-2.5 px-4 bg-indigo-500/40 hover:bg-indigo-500/60 text-white font-medium text-xs rounded-xl transition flex items-center justify-center gap-1"
                >
                  Tùy chỉnh thông số bo góc R & tải lẻ từng mẫu →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 2: CẤU HÌNH NGÀM CHỐNG GÃY & XUẤT DXF CHI TIẾT
        ================================================================= */}
        {activeTab === 'cnc' && (
          <div className="space-y-6">
            
            {/* Bảng điều khiển thông số cơ khí */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-indigo-600" />
                    Tinh chỉnh Cơ khí Chống Gãy Góc & Xuất File .DXF
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Tối ưu hóa bán kính bo góc ngàm (Fillet) và khoảng cách khóa góc để tăng độ bền gấp 3 lần
                  </p>
                </div>

                <button
                  onClick={handleExportAllTilesDXF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Xuất toàn bộ {stats.total} tấm (.DXF)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    1. Kiểu kết cấu ngàm
                  </label>
                  <select
                    value={jointMode}
                    onChange={(e) => setJointMode(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-indigo-700"
                  >
                    <option value="double">Ngàm Đôi (Khóa góc chống bênh)</option>
                    <option value="single">Ngàm Đơn Omega (Cổ rộng)</option>
                  </select>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Bo tròn góc ngàm R (mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="6"
                    value={tabFillet}
                    onChange={(e) => setTabFillet(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700"
                  />
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. Bo tròn 4 góc tấm R (mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={cornerRadius}
                    onChange={(e) => setCornerRadius(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700"
                  />
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    4. Bù tia cắt Kerf (mm)
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
                </div>
              </div>
            </div>

            {/* 3 Mẫu biên dạng chi tiết */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: '1. Mẫu Tấm Trung Tâm',
                  desc: `Cần cắt: ${stats.centers} tấm (4 cạnh ngàm bo tròn)`,
                  filename: 'Mau_Tam_Trung_Tam_Chong_Gay',
                  edges: [-1, 1, 1, -1],
                  badgeColor: 'bg-emerald-100 text-emerald-800',
                  strokeColor: '#059669'
                },
                {
                  title: '2. Mẫu Tấm Viền (Cạnh biên)',
                  desc: `Cần cắt: ${stats.edges} tấm (1 cạnh phẳng, 3 cạnh ngàm)`,
                  filename: 'Mau_Tam_Vien_Chong_Gay',
                  edges: [0, 1, 1, -1],
                  badgeColor: 'bg-blue-100 text-blue-800',
                  strokeColor: '#2563eb'
                },
                {
                  title: '3. Mẫu Tấm Góc',
                  desc: `Cần cắt: ${stats.corners} tấm (2 cạnh phẳng, 2 cạnh ngàm)`,
                  filename: 'Mau_Tam_Goc_Chong_Gay',
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
                        Bo ngàm R{tabFillet} • Bo góc tấm R{cornerRadius}
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

            {/* Giải thích kỹ thuật */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Cải tiến kỹ thuật giúp chống gãy góc tuyệt đối:</p>
                <p>• <strong>Ngàm Đôi Khóa Góc:</strong> Đặt 2 ngàm cách mép góc tấm 75mm giúp triệt tiêu hiện tượng bập bênh góc tấm khi có lực đè lên mặt sa bàn.</p>
                <p>• <strong>Bo tròn cung tiếp tuyến R{tabFillet}mm:</strong> Thay thế toàn bộ góc nhọn bằng đường cong lượn mượt, giúp phôi Gỗ MDF, Formex hoặc Mica không bị nứt xé tại cổ ngàm.</p>
                <p>• <strong>Bo góc đỉnh tấm R{cornerRadius}mm:</strong> Loại bỏ mũi nhọn 90° ở 4 góc tấm, chống mẻ góc khi va chạm hoặc tháo lắp liên tục.</p>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 3: TRỢ LÝ KỸ SƯ AI
        ================================================================= */}
        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Box 1 */}
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Calculator className="w-5 h-5" />
                Kỹ sư Tính toán Sàn
              </div>
              <p className="text-sm text-slate-600">
                Tính toán số lượng tấm ván nguyên khổ 1220x2440mm cần mua và cách xếp phôi (nesting) tối ưu cho thiết kế ngàm bo tròn.
              </p>
              <button
                disabled={loadingAI.floor}
                onClick={() =>
                  runAIAssistant(
                    'floor',
                    `Tôi cần làm sàn sa bàn kích thước ${actualWidth}x${actualLength}mm ghép từ ${stats.total} tấm vuông ${tileSize}x${tileSize}mm (${stats.centers} tấm trung tâm, ${stats.edges} tấm viền, ${stats.corners} tấm góc) có ngàm lồi ra 13mm. Hãy tính số lượng tấm ván khổ 1220x2440mm cần mua và hướng dẫn cách xếp phôi (nesting) để cắt tiết kiệm vật liệu nhất.`
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

            {/* Box 2 */}
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

            {/* Box 3 */}
            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Wrench className="w-5 h-5" />
                Chuyên gia Vật liệu Sàn
              </div>
              <p className="text-sm text-slate-600">
                Phân tích độ bền chịu lực của ngàm bo tròn R{tabFillet}mm và thông số bù mạch cắt (Kerf) chuẩn cho từng loại vật liệu.
              </p>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white"
              >
                <option>Gỗ MDF 5mm (Phổ biến)</option>
                <option>Gỗ Plywood (Ván ép) 6mm - 8mm (Siêu bền)</option>
                <option>Nhựa PVC Foam (Formex cứng) 8mm - 10mm</option>
                <option>Mica (Acrylic) 5mm</option>
              </select>
              <button
                disabled={loadingAI.mat}
                onClick={() =>
                  runAIAssistant(
                    'mat',
                    `Tôi cắt các mảnh ghép sàn sa bàn ${tileSize}x${tileSize}mm dùng thiết kế Ngàm Đôi Bo Tròn R${tabFillet}mm bằng vật liệu "${material}". Hãy đánh giá độ bền chống gãy góc của loại vật liệu này, lưu ý khi gia công Laser/CNC và gợi ý thông số bù mạch cắt (Kerf) chuẩn xác.`
                  )
                }
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loadingAI.mat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Phân tích Vật liệu ✨
              </button>
              {aiResult.mat && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm whitespace-pre-line leading-relaxed">
                  {aiResult.mat}
                </div>
              )}
            </div>

            {/* Box 4 */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Coins className="w-5 h-5" />
                Chuyên gia Báo giá
              </div>
              <p className="text-sm text-slate-600">
                Ước tính chi phí vật tư và gia công cắt CNC/Laser cho bộ sa bàn ({actualWidth}x{actualLength}mm) bằng {material} kèm khung nhôm 2060.
              </p>
              <button
                disabled={loadingAI.cost}
                onClick={() =>
                  runAIAssistant(
                    'cost',
                    `Hãy lập dự toán chi phí vật tư và gia công tại Việt Nam (VNĐ) cho 1 bộ sa bàn kích thước ${actualWidth}x${actualLength}mm gồm: ${stats.total} tấm sàn (${tileSize}x${tileSize}mm) bằng "${material}" cắt theo file DXF, cộng với bộ khung viền nhôm định hình 2060 bao quanh.`
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