import React, { useState, useMemo } from 'react';
import { 
  Layout, Ruler, Bot, Sparkles, Loader2, Wrench, 
  Calculator, Coins, SquareDashed, Download, CheckCircle2, Layers
} from 'lucide-react';

// Lấy API Key từ biến môi trường (.env hoặc Vercel), KHÔNG dán trực tiếp mã vào đây
const getApiKey = () => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch {
    return "";
  }
};

// Hàm gọi Gemini API
const fetchGemini = async (prompt) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Chưa cấu hình VITE_GEMINI_API_KEY trong file .env hoặc trên Vercel.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || "Không nhận được phản hồi từ AI.";
};

// ============================================================================
// BỘ XỬ LÝ HÌNH HỌC MẢNH GHÉP & XUẤT FILE CAD (.DXF) TỈ LỆ 1:1 (MM)
// ============================================================================

// Tạo chuỗi tọa độ cạnh có ngàm đuôi én (Dovetail) từ điểm (x1, y1) đến (x2, y2)
// tabType: 0 (cạnh phẳng), 1 (ngàm lồi ra ngoài), -1 (ngàm lõm vào trong)
// kerfOffset: bù dung sai mạch cắt (mm)
const getEdgePoints = (x1, y1, x2, y2, tabType, kerfOffset = 0) => {
  if (tabType === 0) {
    return [[x2, y2]];
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  
  // Đi theo chiều kim đồng hồ quanh mảnh ghép: vector pháp tuyến hướng ra ngoài là (-uy, ux)
  const nx = -uy * tabType;
  const ny = ux * tabType;

  // Thông số ngàm đuôi én tiêu chuẩn cho tấm 300mm (đơn vị: mm)
  const depth = 15 + (tabType === 1 ? kerfOffset : -kerfOffset); // Độ sâu ngàm 15mm
  const neckHalf = 22 + (tabType === 1 ? kerfOffset : -kerfOffset); // Nửa rộng cổ ngàm (rộng 44mm)
  const headHalf = 32 + (tabType === 1 ? kerfOffset : -kerfOffset); // Nửa rộng đỉnh ngàm (rộng 64mm)
  const mid = L / 2;

  const p1 = [x1 + ux * (mid - neckHalf), y1 + uy * (mid - neckHalf)];
  const p2 = [x1 + ux * (mid - headHalf) + nx * depth, y1 + uy * (mid - headHalf) + ny * depth];
  const p3 = [x1 + ux * (mid + headHalf) + nx * depth, y1 + uy * (mid + headHalf) + ny * depth];
  const p4 = [x1 + ux * (mid + neckHalf), y1 + uy * (mid + neckHalf)];
  const p5 = [x2, y2];

  return [p1, p2, p3, p4, p5];
};

// Tạo danh sách đỉnh khép kín (Polygon) cho 1 tấm (Gốc tọa độ ở góc dưới bên trái)
// Cấu hình cạnh: [Top, Right, Bottom, Left]
const generateTilePoints = (size, edges, offsetX = 0, offsetY = 0, kerf = 0) => {
  const [top, right, bottom, left] = edges;
  // 4 đỉnh góc theo chiều kim đồng hồ trong hệ tọa độ CAD (Y hướng lên trên):
  // (0,0) -> (0, size) [Cạnh Trái] -> (size, size) [Cạnh Trên] -> (size, 0) [Cạnh Phải] -> (0,0) [Cạnh Dưới]
  const pts = [[offsetX, offsetY]];
  
  // 1. Cạnh Trái: từ (0,0) lên (0, size)
  pts.push(...getEdgePoints(offsetX, offsetY, offsetX, offsetY + size, left, kerf));
  // 2. Cạnh Trên: từ (0, size) sang (size, size)
  pts.push(...getEdgePoints(offsetX, offsetY + size, offsetX + size, offsetY + size, top, kerf));
  // 3. Cạnh Phải: từ (size, size) xuống (size, 0)
  pts.push(...getEdgePoints(offsetX + size, offsetY + size, offsetX + size, offsetY, right, kerf));
  // 4. Cạnh Dưới: từ (size, 0) về (0, 0)
  pts.push(...getEdgePoints(offsetX + size, offsetY, offsetX, offsetY, bottom, kerf));

  return pts;
};

// Chuyển đổi danh sách các đường Polyline thành nội dung file DXF chuẩn AutoCAD R12
const buildDXFContent = (polylines) => {
  let dxf = "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n"; // 4 = Millimeters
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

// Hàm kích hoạt tải file DXF về máy tính
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

// Chuyển đổi tọa độ CAD sang đường dẫn SVG để hiển thị bản vẽ trên giao diện Web
const pointsToSVGPath = (points, tileSize) => {
  return points.map((pt, idx) => {
    // Trong SVG trục Y hướng xuống nên đảo ngược Y: tileSize - y
    const svgX = pt[0];
    const svgY = tileSize - pt[1];
    return `${idx === 0 ? 'M' : 'L'} ${svgX.toFixed(2)} ${svgY.toFixed(2)}`;
  }).join(' ') + ' Z';
};

export default function App() {
  const [activeTab, setActiveTab] = useState('assembly'); // 'assembly' | 'cnc' | 'ai'
  const [width, setWidth] = useState(1500);
  const [length, setLength] = useState(1500);
  const [tileSize, setTileSize] = useState(300);
  const [kerf, setKerf] = useState(0.1); // Bù hao hụt mạch cắt Laser/CNC (mm)
  const [material, setMaterial] = useState('Gỗ MDF 5mm (Phổ biến)');

  // Trạng thái phản hồi AI
  const [loadingAI, setLoadingAI] = useState({ floor: false, frame: false, mat: false, cost: false });
  const [aiResult, setAiResult] = useState({ floor: '', frame: '', mat: '', cost: '' });

  // Tính toán lưới mảnh ghép
  const cols = Math.max(1, Math.round(width / tileSize));
  const rows = Math.max(1, Math.round(length / tileSize));
  const actualWidth = cols * tileSize;
  const actualLength = rows * tileSize;

  // Phân loại số lượng mảnh ghép
  const stats = useMemo(() => {
    const total = cols * rows;
    const corners = (cols >= 2 && rows >= 2) ? 4 : (total === 1 ? 1 : 2);
    const edges = (cols >= 2 && rows >= 2) ? 2 * (cols - 2) + 2 * (rows - 2) : Math.max(0, total - corners);
    const centers = Math.max(0, total - corners - edges);
    return { total, corners, edges, centers };
  }, [cols, rows]);

  // Xác định cấu hình 4 cạnh [Top, Right, Bottom, Left] cho từng ô (r, c)
  // Quy ước: Cạnh ngoài cùng phẳng (0). Cạnh liền kề: Phải lồi (+1), Trái lõm (-1), Dưới lồi (+1), Trên lõm (-1)
  const getCellEdges = (r, c) => {
    const top = r === 0 ? 0 : -1;
    const bottom = r === rows - 1 ? 0 : 1;
    const left = c === 0 ? 0 : -1;
    const right = c === cols - 1 ? 0 : 1;
    return [top, right, bottom, left];
  };

  // Hàm xuất 1 tấm mẫu ra DXF
  const handleExportSingleTileDXF = (name, edges) => {
    const points = generateTilePoints(tileSize, edges, 0, 0, kerf);
    const dxfContent = buildDXFContent([{ points, layer: "CUT_OUTLINE", color: 7 }]);
    downloadDXFFile(`${name}_${tileSize}x${tileSize}mm.dxf`, dxfContent);
  };

  // Hàm xuất toàn bộ các tấm của sa bàn ra 1 file DXF duy nhất (Xếp cách nhau 40mm để tiện xếp phôi)
  const handleExportAllTilesDXF = () => {
    const polylines = [];
    const spacing = tileSize + 50; // Khoảng cách giữa các tấm trong bản vẽ CAD

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const edges = getCellEdges(r, c);
        const offsetX = c * spacing;
        const offsetY = (rows - 1 - r) * spacing;
        const points = generateTilePoints(tileSize, edges, offsetX, offsetY, kerf);
        
        const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
        const isEdge = !isCorner && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
        const layerName = isCorner ? "TAM_GOC" : (isEdge ? "TAM_VIEN" : "TAM_TRUNG_TAM");
        const colorCode = isCorner ? 30 : (isEdge ? 5 : 3); // Cam, Xanh dương, Xanh lá trong AutoCAD

        polylines.push({ points, layer: layerName, color: colorCode });
      }
    }

    const dxfContent = buildDXFContent(polylines);
    downloadDXFFile(`Full_Sa_Ban_${actualWidth}x${actualLength}mm_${stats.total}_Tam.dxf`, dxfContent);
  };

  // Các hàm gọi Trợ lý AI
  const runAIAssistant = async (type, promptText) => {
    setLoadingAI(prev => ({ ...prev, [type]: true }));
    try {
      const reply = await fetchGemini(promptText);
      setAiResult(prev => ({ ...prev, [type]: reply }));
    } catch (err) {
      setAiResult(prev => ({ ...prev, [type]: `Lỗi kết nối AI: ${err.message}. Vui lòng kiểm tra lại API Key.` }));
    } finally {
      setLoadingAI(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER ĐIỀU HƯỚNG */}
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">
              Thiết kế Sa Bàn {actualWidth}x{actualLength}mm
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Module mảnh ghép {tileSize}x{tileSize}mm & Khung nhôm định hình 2060 • Hỗ trợ xuất CAD (.DXF)
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
              Kích thước cắt CNC & Xuất DXF
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
            TAB 1: SƠ ĐỒ LẮP RÁP TỔNG THỂ
        ================================================================= */}
        {activeTab === 'assembly' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Cột trái: Sơ đồ trực quan */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
              <h2 className="text-lg font-bold text-slate-800 mb-1">
                Sơ đồ {stats.total} mảnh ghép ({cols}x{rows})
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Điều chỉnh kích thước để tự động vẽ lại bản đồ lọt lòng và xuất file DXF tương ứng
              </p>

              {/* Bộ nhập kích thước nhanh */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-xl mb-6">
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
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
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
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Kích thước 1 tấm (mm)
                  </label>
                  <input
                    type="number"
                    step={50}
                    min={100}
                    value={tileSize}
                    onChange={(e) => setTileSize(Math.max(100, Number(e.target.value) || 300))}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold mb-6">
                Kích thước phủ bì sàn thực tế: {actualWidth} x {actualLength} mm
              </div>

              {/* Bản vẽ SVG tổng thể các mảnh ghép khớp vào nhau */}
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
                      const pts = generateTilePoints(tileSize, edges, 0, 0, 0);
                      const dPath = pointsToSVGPath(pts, tileSize);

                      return (
                        <g key={`${r}-${c}`} transform={`translate(${c * tileSize}, ${r * tileSize})`}>
                          <path
                            d={dPath}
                            fill={fillColor}
                            stroke="#1e293b"
                            strokeWidth={Math.max(2, tileSize / 120)}
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

            {/* Cột phải: Thống kê & Nút xuất nhanh DXF */}
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
                      Tấm Trung Tâm (4 cạnh ngàm)
                    </span>
                    <span className="font-bold text-emerald-700">{stats.centers} tấm</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <span className="flex items-center gap-2 font-medium text-blue-900">
                      <span className="w-3.5 h-3.5 rounded bg-blue-500 inline-block"></span>
                      Tấm Viền (1 cạnh phẳng)
                    </span>
                    <span className="font-bold text-blue-700">{stats.edges} tấm</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 border border-orange-100">
                    <span className="flex items-center gap-2 font-medium text-orange-900">
                      <span className="w-3.5 h-3.5 rounded bg-orange-500 inline-block"></span>
                      Tấm Góc (2 cạnh phẳng)
                    </span>
                    <span className="font-bold text-orange-700">{stats.corners} tấm</span>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-base font-bold text-slate-900">
                    <span>Tổng cộng:</span>
                    <span>{stats.total} Tấm</span>
                  </div>
                </div>
              </div>

              {/* Khung xuất nhanh DXF ngay tại Tab 1 */}
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-md p-6 text-white">
                <h3 className="text-base font-bold flex items-center gap-2 mb-2">
                  <Download className="w-5 h-5" />
                  Xuất Bản Vẽ CAD (.DXF)
                </h3>
                <p className="text-xs text-indigo-100 mb-4 leading-relaxed">
                  Tải về file <strong>.DXF tỉ lệ chuẩn 1:1 (mm)</strong> để đưa trực tiếp vào AutoCAD, SolidWorks, Aspire hoặc máy cắt Laser/CNC.
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
                  Tùy chỉnh bù mạch cắt (Kerf) & Tải lẻ từng mẫu →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 2: KÍCH THƯỚC CẮT CNC & XUẤT FILE DXF CHI TIẾT
        ================================================================= */}
        {activeTab === 'cnc' && (
          <div className="space-y-6">
            
            {/* Thanh cấu hình thông số DXF */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Ruler className="w-5 h-5 text-indigo-600" />
                  Bản vẽ kỹ thuật & Xuất file cắt CNC / Laser (.DXF)
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Đơn vị bản vẽ: <strong>Milimet (mm)</strong> • Chuẩn AutoCAD R12 (Tương thích 100% phần mềm CAM/CNC/Laser)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200">
                  <label className="text-xs font-semibold text-slate-700">
                    Bù mạch cắt (Kerf mm):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="2"
                    value={kerf}
                    onChange={(e) => setKerf(Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-sm font-bold text-indigo-700 text-center"
                  />
                </div>

                <button
                  onClick={handleExportAllTilesDXF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                >
                  <Download className="w-4 h-4" />
                  Xuất toàn bộ {stats.total} tấm (.DXF)
                </button>
              </div>
            </div>

            {/* Danh sách 3 mẫu biên dạng chính */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: '1. Mẫu Tấm Trung Tâm',
                  desc: `Số lượng cần cắt: ${stats.centers} tấm (2 ngàm lồi, 2 ngàm lõm)`,
                  filename: 'Mau_Tam_Trung_Tam',
                  edges: [-1, 1, 1, -1],
                  badgeColor: 'bg-emerald-100 text-emerald-800',
                  strokeColor: '#059669'
                },
                {
                  title: '2. Mẫu Tấm Viền (Cạnh biên)',
                  desc: `Số lượng cần cắt: ${stats.edges} tấm (1 cạnh phẳng ngoài, 3 cạnh ngàm)`,
                  filename: 'Mau_Tam_Vien_Bien',
                  edges: [0, 1, 1, -1],
                  badgeColor: 'bg-blue-100 text-blue-800',
                  strokeColor: '#2563eb'
                },
                {
                  title: '3. Mẫu Tấm Góc',
                  desc: `Số lượng cần cắt: ${stats.corners} tấm (2 cạnh phẳng góc, 2 cạnh ngàm)`,
                  filename: 'Mau_Tam_Goc',
                  edges: [0, 1, 1, 0],
                  badgeColor: 'bg-orange-100 text-orange-800',
                  strokeColor: '#ea580c'
                }
              ].map((item, idx) => {
                const previewPts = generateTilePoints(tileSize, item.edges, 0, 0, kerf);
                const svgPath = pointsToSVGPath(previewPts, tileSize);

                return (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
                    <div>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${item.badgeColor}`}>
                        Kích thước thân: {tileSize}x{tileSize} mm
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 mb-4">{item.desc}</p>

                      {/* Bản vẽ preview kỹ thuật */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center mb-4">
                        <svg viewBox={`-30 -30 ${tileSize + 60} ${tileSize + 60}`} className="w-48 h-48">
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
                      Tải file {item.filename}.dxf
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Chú thích thông số kỹ thuật ngàm */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Thông số kỹ thuật bản vẽ DXF đã xuất:</p>
                <p>• <strong>Ngàm đuôi én (Dovetail):</strong> Độ sâu ngàm 15mm, rộng cổ ngàm 44mm, rộng đỉnh ngàm 64mm, tự động cộng/trừ bù hao hụt tia cắt <strong>{kerf}mm</strong> giúp ghép khít chắc chắn.</p>
                <p>• <strong>Phân lớp (Layer CAD):</strong> Khi xuất trọn bộ sa bàn, các tấm Góc, Viền và Trung tâm được chia sẵn thành 3 Layer màu riêng biệt trong AutoCAD để dễ dàng sắp xếp phôi cắt.</p>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            TAB 3: TRỢ LÝ KỸ SƯ AI (4 MODULE)
        ================================================================= */}
        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Box 1: Kỹ sư Tính toán Sàn */}
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Calculator className="w-5 h-5" />
                Kỹ sư Tính toán Sàn
              </div>
              <p className="text-sm text-slate-600">
                Nhập kích thước sa bàn mới, AI sẽ giúp bạn tính toán chính xác số lượng từng loại mảnh ghép {tileSize}x{tileSize}mm cần cắt và tư vấn cách xếp phôi tiết kiệm nhất.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Chiều rộng (MM)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Chiều dài (MM)</label>
                  <input
                    type="number"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                  />
                </div>
              </div>
              <button
                disabled={loadingAI.floor}
                onClick={() =>
                  runAIAssistant(
                    'floor',
                    `Tôi cần làm sàn sa bàn kích thước ${actualWidth}x${actualLength}mm ghép từ các tấm vuông ${tileSize}x{tileSize}mm có ngàm đuôi én. Hiện cần ${stats.total} tấm (${stats.centers} tấm trung tâm, ${stats.edges} tấm viền, ${stats.corners} tấm góc). Hãy tính số lượng tấm ván nguyên khổ 1220x2440mm cần mua và cách xếp phôi (nesting) sao cho ít hao hụt vật liệu nhất.`
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

            {/* Box 2: Kỹ sư Khung Nhôm 2060 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-lg border-b border-slate-100 pb-3">
                <SquareDashed className="w-5 h-5" />
                Kỹ sư Khung Nhôm 2060
              </div>
              <p className="text-sm text-slate-600">
                AI sẽ tính toán số lượng thanh nhôm định hình 2060 và phụ kiện (ke góc, ốc T-nut, nối thẳng) cần thiết để dựng viền bao quanh kích thước <strong>{actualWidth}x{actualLength}mm</strong> hiện tại.
              </p>
              <button
                disabled={loadingAI.frame}
                onClick={() =>
                  runAIAssistant(
                    'frame',
                    `Hãy bóc tách khối lượng vật tư (BOM) chi tiết để làm khung viền bao quanh sa bàn kích thước lọt lòng ${actualWidth}x${actualLength}mm bằng nhôm định hình 2060 (dựng đứng thành cao 60mm). Liệt kê chiều dài cắt nhôm, số lượng ke góc vuông 2020/2060, ốc lục giác và con chạy T-nut.`
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

            {/* Box 3: Chuyên gia Vật liệu Sàn */}
            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Wrench className="w-5 h-5" />
                Chuyên gia Vật liệu Sàn
              </div>
              <p className="text-sm text-slate-600">
                Chọn vật liệu bạn muốn dùng cho sàn sa bàn, AI sẽ phân tích độ bền của ngàm đuôi én và hướng dẫn thiết lập dung sai cắt CNC/Laser (Kerf).
              </p>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white"
              >
                <option>Gỗ MDF 5mm (Phổ biến)</option>
                <option>Gỗ Plywood (Ván ép) 5mm - 8mm</option>
                <option>Nhựa PVC Foam (Formex cứng) 8mm</option>
                <option>Mica (Acrylic) 5mm</option>
              </select>
              <button
                disabled={loadingAI.mat}
                onClick={() =>
                  runAIAssistant(
                    'mat',
                    `Tôi định cắt các mảnh ghép sàn sa bàn ${tileSize}x${tileSize}mm có ngàm đuôi én bằng vật liệu "${material}". Hãy đánh giá độ bền của ngàm, tốc độ/công suất gợi ý và thông số bù mạch cắt (Kerf) phù hợp khi xuất file DXF đi cắt Laser hoặc CNC.`
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

            {/* Box 4: Chuyên gia Báo giá */}
            <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-lg border-b border-slate-100 pb-3">
                <Coins className="w-5 h-5" />
                Chuyên gia Báo giá
              </div>
              <p className="text-sm text-slate-600">
                AI sẽ kết hợp Kích thước ({actualWidth}x{actualLength}mm) và Vật liệu ({material}) để ước tính mức giá gia công tham khảo (bao gồm cả khung nhôm 2060) tại Việt Nam.
              </p>
              <button
                disabled={loadingAI.cost}
                onClick={() =>
                  runAIAssistant(
                    'cost',
                    `Hãy lập bảng dự toán chi phí vật tư và gia công tại Việt Nam (VNĐ) cho 1 bộ sa bàn kích thước ${actualWidth}x${actualLength}mm gồm: ${stats.total} tấm sàn (${tileSize}x${tileSize}mm) bằng "${material}" cắt Laser/CNC theo file DXF, cộng với bộ khung viền nhôm định hình 2060 bao quanh.`
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