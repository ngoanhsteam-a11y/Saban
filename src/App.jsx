import React, { useState } from 'react';
import { Info, Layout, Ruler, Grid3X3, Printer, Bot, Sparkles, Loader2, Wrench, Calculator, Coins, SquareDashed } from 'lucide-react';

// API Key được cung cấp tự động bởi môi trường thực thi
const apiKey = "";

// Helper function to call Gemini API with exponential backoff
const fetchGemini = async (prompt) => {
  const maxRetries = 5;
  const delays = [1000, 2000, 4000, 8000, 16000];
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [{ text: "Bạn là một kỹ sư cơ khí và chuyên gia thiết kế CNC/Laser chuyên nghiệp. Hãy trả lời ngắn gọn, súc tích, định dạng rõ ràng bằng tiếng Việt." }]
            }
          })
        }
      );
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Không nhận được phản hồi từ AI.";
    } catch (error) {
      if (i === maxRetries - 1) return `Lỗi kết nối AI: ${error.message}. Vui lòng thử lại sau.`;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

export default function App() {
  const [hoveredTile, setHoveredTile] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'blueprint' | 'ai'

  // AI State & Global Dimensions
  const [material, setMaterial] = useState('Gỗ MDF 5mm');
  const [customWidth, setCustomWidth] = useState(1500);
  const [customHeight, setCustomHeight] = useState(1500);

  const [aiMaterialResponse, setAiMaterialResponse] = useState('');
  const [isMaterialLoading, setIsMaterialLoading] = useState(false);
  const [aiLayoutResponse, setAiLayoutResponse] = useState('');
  const [isLayoutLoading, setIsLayoutLoading] = useState(false);
  const [aiPricingResponse, setAiPricingResponse] = useState('');
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [aiFrameResponse, setAiFrameResponse] = useState('');
  const [isFrameLoading, setIsFrameLoading] = useState(false);

  // Dynamic Grid Calculations
  const w = Number(customWidth) || 300;
  const h = Number(customHeight) || 300;
  const cols = Math.max(1, Math.ceil(w / 300));
  const rows = Math.max(1, Math.ceil(h / 300));
  
  const TILE_SIZE = 100; // SVG coordinate scaling
  const TOTAL_WIDTH = cols * TILE_SIZE;
  const TOTAL_HEIGHT = rows * TILE_SIZE;

  // Generate SVG path for a tile based on its position in the grid
  const getTilePath = (r, c, gridR = rows, gridC = cols) => {
    const top = r === 0 ? 'flat' : 'in';
    const right = c === gridC - 1 ? 'flat' : 'out';
    const bottom = r === gridR - 1 ? 'flat' : 'out';
    const left = c === 0 ? 'flat' : 'in';

    let d = `M 0 0 `;

    // Top edge
    if (top === 'flat') d += `L ${TILE_SIZE} 0 `;
    else d += `L 40 0 L 35 15 L 65 15 L 60 0 L ${TILE_SIZE} 0 `;

    // Right edge
    if (right === 'flat') d += `L ${TILE_SIZE} ${TILE_SIZE} `;
    else d += `L ${TILE_SIZE} 40 L ${TILE_SIZE + 15} 35 L ${TILE_SIZE + 15} 65 L ${TILE_SIZE} 60 L ${TILE_SIZE} ${TILE_SIZE} `;

    // Bottom edge
    if (bottom === 'flat') d += `L 0 ${TILE_SIZE} `;
    else d += `L 60 ${TILE_SIZE} L 65 ${TILE_SIZE + 15} L 35 ${TILE_SIZE + 15} L 40 ${TILE_SIZE} L 0 ${TILE_SIZE} `;

    // Left edge
    if (left === 'flat') d += `Z`;
    else d += `L 0 60 L 15 65 L 15 35 L 0 40 Z`;

    return d;
  };

  const getTileType = (r, c, gridR = rows, gridC = cols) => {
    const isCorner = (r === 0 || r === gridR - 1) && (c === 0 || c === gridC - 1);
    const isEdge = (r === 0 || r === gridR - 1 || c === 0 || c === gridC - 1) && !isCorner;
    if (isCorner) return 'Góc';
    if (isEdge) return 'Viền';
    return 'Trung Tâm';
  };

  const getTileColor = (type) => {
    switch (type) {
      case 'Góc': return 'fill-orange-400';
      case 'Viền': return 'fill-blue-400';
      case 'Trung Tâm': return 'fill-emerald-400';
      default: return 'fill-gray-300';
    }
  };

  // Generate Tile Array & Compute Stats
  const tiles = [];
  let centerCount = 0, edgeCount = 0, cornerCount = 0;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const type = getTileType(r, c);
      tiles.push({ r, c, type });
      
      if (type === 'Góc') cornerCount++;
      else if (type === 'Viền') edgeCount++;
      else centerCount++;
    }
  }
  const totalCount = tiles.length;

  // AI Handlers
  const handleMaterialAdvice = async () => {
    setIsMaterialLoading(true);
    setAiMaterialResponse('');
    const prompt = `Tôi đang làm mặt sàn sa bàn lắp ghép bằng ngàm đuôi én (kích thước mảnh 300x300mm). Tôi dự định dùng vật liệu: ${material}. 
    Hãy cho tôi lời khuyên chuyên môn thành các gạch đầu dòng về:
    1. Ưu nhược điểm của vật liệu này cho khớp đuôi én.
    2. Phương pháp gia công phù hợp nhất (Laser hay CNC Router).
    3. Mức dung sai ngàm (kerf) khuyến nghị để lắp ráp dễ dàng mà không bị lỏng.
    Giữ câu trả lời ngắn gọn dưới 200 chữ.`;
    
    const response = await fetchGemini(prompt);
    setAiMaterialResponse(response);
    setIsMaterialLoading(false);
  };

  const handleLayoutAdvice = async () => {
    setIsLayoutLoading(true);
    setAiLayoutResponse('');
    const prompt = `Tôi đang thiết kế một sa bàn dùng các mảnh ghép hình vuông kích thước 300x300mm. Kích thước lọt lòng mong muốn của tôi là Rộng ${w}mm x Dài ${h}mm.
    Hãy tính toán giúp tôi:
    1. Tổng số mảnh ghép cần thiết.
    2. Phân loại chi tiết: Bao nhiêu tấm Góc (có 2 cạnh phẳng), bao nhiêu tấm Viền (1 cạnh phẳng), bao nhiêu tấm Trung Tâm (4 cạnh đều có ngàm).
    3. Nếu kích thước tôi nhập không chia hết cho 300mm, hãy cảnh báo và gợi ý kích thước bao ngoài gần nhất.
    Trả lời cực kỳ ngắn gọn và trực quan.`;
    
    const response = await fetchGemini(prompt);
    setAiLayoutResponse(response);
    setIsLayoutLoading(false);
  };

  const handlePricingAdvice = async () => {
    setIsPricingLoading(true);
    setAiPricingResponse('');
    
    const prompt = `Tôi cần dự toán chi phí làm sa bàn ghép hình bằng ngàm đuôi én.
    - Kích thước lọt lòng: Rộng ${w}mm x Dài ${h}mm
    - Tổng số mảnh ghép (300x300mm/mảnh): ${totalCount} mảnh
    - Vật liệu mặt sàn: ${material}
    - Khung bao: Nhôm 2060
    Hãy ước tính chi phí gia công tại thị trường Việt Nam hiện nay, chia thành:
    1. Tiền vật tư mặt sàn ước tính.
    2. Tiền công cắt sàn (Laser hoặc CNC tùy vật liệu).
    3. Ước tính chi phí bộ khung nhôm 2060.
    4. Tổng chi phí dự kiến.
    Trả lời cực kỳ ngắn gọn, dùng tiền VNĐ. Bắt buộc ghi chú rõ đây chỉ là giá tham khảo thị trường.`;
    
    const response = await fetchGemini(prompt);
    setAiPricingResponse(response);
    setIsPricingLoading(false);
  };

  const handleFrameAdvice = async () => {
    setIsFrameLoading(true);
    setAiFrameResponse('');
    
    const prompt = `Tôi đang làm viền khung bao quanh sa bàn bằng nhôm định hình 2060.
    - Kích thước sa bàn: Rộng ${w}mm x Dài ${h}mm.
    - Quy tắc thiết kế: Chỉ dùng các thanh nhôm được cắt sẵn đúng 1 kích thước là 300mm/thanh.
    
    Hãy tính toán giúp tôi và trả lời thành các gạch đầu dòng rõ ràng:
    1. Tổng số lượng thanh nhôm 2060 (dài 300mm) cần dùng để quây kín chu vi sa bàn.
    2. Số lượng khớp nối góc vuông 90 độ (ke góc / ke 3 góc) cần dùng cho 4 góc.
    3. Số lượng thanh nối thẳng (inline connector) cần dùng để ghép các thanh 300mm lại với nhau tạo thành các cạnh dài. (Lưu ý: số thanh nối trên 1 cạnh = số đoạn 300mm - 1).
    Trả lời ngắn gọn, đóng vai như kỹ sư đang bóc tách khối lượng vật tư.`;
    
    const response = await fetchGemini(prompt);
    setAiFrameResponse(response);
    setIsFrameLoading(false);
  };

  // --- SUBCOMPONENTS FOR BLUEPRINT VIEW ---
  const SVGDefs = () => (
    <defs>
      <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
      </marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
      </marker>
      <marker id="arrow-purple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#9333ea" />
      </marker>
    </defs>
  );

  const DimensionLines = () => {
    return (
      <g>
        <line x1="0" y1="-15" x2="100" y2="-15" className="stroke-red-500 stroke-[0.75px]" markerStart="url(#arrow-red)" markerEnd="url(#arrow-red)" />
        <line x1="0" y1="0" x2="0" y2="-18" className="stroke-red-400 stroke-[0.5px] stroke-dasharray-2" />
        <line x1="100" y1="0" x2="100" y2="-18" className="stroke-red-400 stroke-[0.5px] stroke-dasharray-2" />
        <text x="50" y="-22" textAnchor="middle" className="fill-red-600 text-[8px] font-mono font-bold">300 mm</text>

        <line x1="-15" y1="0" x2="-15" y2="100" className="stroke-red-500 stroke-[0.75px]" markerStart="url(#arrow-red)" markerEnd="url(#arrow-red)" />
        <line x1="0" y1="0" x2="-18" y2="0" className="stroke-red-400 stroke-[0.5px] stroke-dasharray-2" />
        <line x1="0" y1="100" x2="-18" y2="100" className="stroke-red-400 stroke-[0.5px] stroke-dasharray-2" />
        <text x="-22" y="50" textAnchor="middle" transform="rotate(-90, -22, 50)" className="fill-red-600 text-[8px] font-mono font-bold">300 mm</text>

        <line x1="130" y1="35" x2="130" y2="65" className="stroke-blue-600 stroke-[0.75px]" markerStart="url(#arrow-blue)" markerEnd="url(#arrow-blue)" />
        <line x1="115" y1="35" x2="133" y2="35" className="stroke-blue-400 stroke-[0.5px] stroke-dasharray-2" />
        <line x1="115" y1="65" x2="133" y2="65" className="stroke-blue-400 stroke-[0.5px] stroke-dasharray-2" />
        <text x="135" y="50" textAnchor="start" alignmentBaseline="middle" className="fill-blue-700 text-[8px] font-mono">90 mm</text>

        <line x1="85" y1="40" x2="85" y2="60" className="stroke-blue-600 stroke-[0.75px]" markerStart="url(#arrow-blue)" markerEnd="url(#arrow-blue)" />
        <line x1="100" y1="40" x2="82" y2="40" className="stroke-blue-400 stroke-[0.5px] stroke-dasharray-2" />
        <line x1="100" y1="60" x2="82" y2="60" className="stroke-blue-400 stroke-[0.5px] stroke-dasharray-2" />
        <text x="75" y="50" textAnchor="end" alignmentBaseline="middle" className="fill-blue-700 text-[8px] font-mono">60</text>

        <line x1="100" y1="20" x2="115" y2="20" className="stroke-purple-600 stroke-[0.75px]" markerStart="url(#arrow-purple)" markerEnd="url(#arrow-purple)" />
        <line x1="100" y1="35" x2="100" y2="17" className="stroke-purple-400 stroke-[0.5px] stroke-dasharray-2" />
        <line x1="115" y1="35" x2="115" y2="17" className="stroke-purple-400 stroke-[0.5px] stroke-dasharray-2" />
        <text x="107.5" y="14" textAnchor="middle" className="fill-purple-700 text-[8px] font-mono">45</text>
      </g>
    );
  };

  const BlueprintCard = ({ title, type }) => {
    let r, c, color, desc;
    if (type === 'center') { r = 1; c = 1; color = "fill-emerald-100 stroke-emerald-600"; desc = "4 ngàm liên kết (2 lồi, 2 lõm)"; }
    if (type === 'edge')   { r = 0; c = 1; color = "fill-blue-100 stroke-blue-600"; desc = "1 cạnh phẳng để ốp vào thanh nhôm"; }
    if (type === 'corner') { r = 0; c = 0; color = "fill-orange-100 stroke-orange-600"; desc = "2 cạnh phẳng để ráp vào góc 90°"; }
    
    return (
       // Thêm class break-inside-avoid để tránh bị cắt đôi khi in PDF
       <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow break-inside-avoid">
          <div className="p-4 bg-gray-50 border-b border-gray-200">
             <h4 className="font-bold text-center text-sm text-gray-800">{title}</h4>
             <p className="text-[11px] text-center text-gray-500 mt-1">{desc}</p>
          </div>
          <div className="flex-1 p-6 flex justify-center items-center bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] bg-gray-50">
             <svg viewBox="0 0 210 180" className="w-full max-w-[260px] drop-shadow-sm mx-auto">
               <SVGDefs />
               <g transform="translate(45, 35)">
                  <path d={getTilePath(r, c, 3, 3)} className={`${color} stroke-[1.5px]`} />
                  <DimensionLines />
               </g>
             </svg>
          </div>
       </div>
    );
  };

  const renderFormattedText = (text) => {
    return text.split('\n').map((line, index) => {
      if (line.startsWith('* ') || line.startsWith('- ')) {
        return <li key={index} className="ml-4 mb-2">{line.substring(2)}</li>;
      }
      if (line.match(/^\d+\./)) {
        return <li key={index} className="ml-4 mb-2 font-medium">{line}</li>;
      }
      if (line.includes('**')) {
        const parts = line.split('**');
        return (
          <p key={index} className="mb-2">
            {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
          </p>
        );
      }
      return <p key={index} className="mb-2">{line}</p>;
    });
  };

  return (
    // Sử dụng style WebkitPrintColorAdjust để ép trình duyệt in màu nền
    <div 
      className="flex flex-col gap-4 p-4 md:p-6 font-sans bg-gray-100 min-h-screen text-gray-800 print:bg-white print:p-0"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
    >
      
      {/* HEADER & TOGGLES */}
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200 print:hidden">
        <div className="mb-4 xl:mb-0 text-center xl:text-left">
          <h1 className="text-xl font-bold text-gray-800">Thiết kế Sa Bàn {customWidth}x{customHeight}mm</h1>
          <p className="text-sm text-gray-500">Module mảnh ghép 300x300mm & Khung nhôm 2060</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('overview')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'overview' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Layout className="w-4 h-4 mr-2" /> Lắp ráp tổng thể
            </button>
            <button 
              onClick={() => setViewMode('blueprint')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'blueprint' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Ruler className="w-4 h-4 mr-2" /> Kích thước cắt CNC
            </button>
            <button 
              onClick={() => setViewMode('ai')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'ai' ? 'bg-indigo-600 shadow-sm text-white hover:bg-indigo-700' : 'text-indigo-600 hover:bg-indigo-50'}`}
            >
              <Bot className="w-4 h-4 mr-2" /> Trợ lý AI
            </button>
          </div>
          {viewMode === 'blueprint' && (
            <button 
              onClick={() => window.print()}
              className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
              title="Lưu file dưới dạng PDF"
            >
              <Printer className="w-4 h-4 mr-2" /> Xuất PDF
            </button>
          )}
        </div>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {viewMode === 'ai' ? (
          <div className="flex-1 w-full grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* AI FEATURE 1: Layout Calculator */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-teal-100 flex flex-col">
              <div className="flex items-center mb-4 text-teal-700 border-b border-teal-50 pb-3">
                <Calculator className="w-6 h-6 mr-2" />
                <h2 className="text-xl font-bold">Kỹ sư Tính toán Sàn</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Nhập kích thước sa bàn mới, AI sẽ giúp bạn tính toán chính xác số lượng từng loại mảnh ghép 300x300mm cần cắt. (Sơ đồ bản vẽ sẽ được tự động vẽ lại theo số đo này).
              </p>
              
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Chiều Rộng (mm)</label>
                  <input 
                    type="number" 
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition-all font-mono"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Chiều Dài (mm)</label>
                  <input 
                    type="number" 
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 transition-all font-mono"
                  />
                </div>
              </div>
              
              <button 
                onClick={handleLayoutAdvice}
                disabled={isLayoutLoading}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors shadow-md disabled:bg-teal-300"
              >
                {isLayoutLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Tính toán Mảnh Ghép Sàn ✨
              </button>

              {aiLayoutResponse && (
                <div className="mt-6 p-5 bg-teal-50/50 rounded-lg border border-teal-100 flex-1 overflow-y-auto">
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {renderFormattedText(aiLayoutResponse)}
                  </div>
                </div>
              )}
            </div>

            {/* AI FEATURE 2: Frame Calculator */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 flex flex-col">
              <div className="flex items-center mb-4 text-slate-700 border-b border-slate-100 pb-3">
                <SquareDashed className="w-6 h-6 mr-2" />
                <h2 className="text-xl font-bold">Kỹ sư Khung Nhôm 2060</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                AI sẽ tính toán số lượng thanh nhôm 300mm và phụ kiện cần thiết để dựng viền bao quanh kích thước <strong>{w}x{h}mm</strong> hiện tại.
              </p>
              
              <button 
                onClick={handleFrameAdvice}
                disabled={isFrameLoading}
                className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center justify-center transition-colors shadow-md disabled:bg-slate-400 mt-auto"
              >
                {isFrameLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Bóc tách Vật tư Nhôm ✨
              </button>

              {aiFrameResponse && (
                <div className="mt-6 p-5 bg-slate-50 rounded-lg border border-slate-200 flex-1 overflow-y-auto">
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {renderFormattedText(aiFrameResponse)}
                  </div>
                </div>
              )}
            </div>

            {/* AI FEATURE 3: Material Advisor */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-indigo-100 flex flex-col">
              <div className="flex items-center mb-4 text-indigo-700 border-b border-indigo-50 pb-3">
                <Wrench className="w-6 h-6 mr-2" />
                <h2 className="text-xl font-bold">Chuyên gia Vật liệu Sàn</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Chọn vật liệu bạn muốn dùng cho sàn sa bàn, AI sẽ phân tích độ bền của ngàm đuôi én và hướng dẫn thiết lập dung sai cắt CNC/Laser.
              </p>
              
              <div className="mb-4">
                <select 
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                >
                  <option value="Gỗ MDF 5mm">Gỗ MDF 5mm (Phổ biến)</option>
                  <option value="Nhựa Mica (Acrylic) 5mm">Nhựa Mica (Acrylic) 5mm (Trong suốt, giòn)</option>
                  <option value="Nhựa POM 8mm">Nhựa POM 8mm (Chịu mài mòn cao)</option>
                  <option value="Formex 10mm">Tấm Formex 10mm (Siêu nhẹ, xốp)</option>
                  <option value="Ván ép Plywood 8mm">Ván ép Plywood 8mm (Đẹp, vân gỗ tự nhiên)</option>
                </select>
              </div>
              
              <button 
                onClick={handleMaterialAdvice}
                disabled={isMaterialLoading}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors shadow-md disabled:bg-indigo-300 mt-auto"
              >
                {isMaterialLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Phân tích Vật liệu ✨
              </button>

              {aiMaterialResponse && (
                <div className="mt-6 p-5 bg-indigo-50/50 rounded-lg border border-indigo-100 flex-1 overflow-y-auto">
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {renderFormattedText(aiMaterialResponse)}
                  </div>
                </div>
              )}
            </div>

            {/* AI FEATURE 4: Pricing Estimator */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-amber-100 flex flex-col">
              <div className="flex items-center mb-4 text-amber-700 border-b border-amber-50 pb-3">
                <Coins className="w-6 h-6 mr-2" />
                <h2 className="text-xl font-bold">Chuyên gia Báo giá</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                AI sẽ kết hợp Kích thước ({w}x{h}) và Vật liệu ({material}) để ước tính mức giá tham khảo (bao gồm cả khung nhôm) tại VN.
              </p>
              
              <button 
                onClick={handlePricingAdvice}
                disabled={isPricingLoading}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center justify-center transition-colors shadow-md disabled:bg-amber-300 mt-auto"
              >
                {isPricingLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Dự toán Chi phí Tổng ✨
              </button>

              {aiPricingResponse && (
                <div className="mt-6 p-5 bg-amber-50/50 rounded-lg border border-amber-100 flex-1 overflow-y-auto">
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {renderFormattedText(aiPricingResponse)}
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : (
          <>
            <div className="flex-1 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              {viewMode === 'overview' ? (
                <div className="flex flex-col items-center">
                  <h2 className="text-lg font-bold mb-2">Sơ đồ {totalCount} mảnh ghép ({cols}x{rows})</h2>
                  <p className="text-sm text-gray-500 mb-4">Điều chỉnh kích thước để tự động vẽ lại bản đồ lọt lòng</p>

                  <div className="flex gap-4 mb-6 w-full max-w-md bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Chiều Rộng (mm)</label>
                      <input 
                        type="number" 
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                        className="w-full p-2 bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-mono"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Chiều Dài (mm)</label>
                      <input 
                        type="number" 
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                        className="w-full p-2 bg-white border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-mono"
                      />
                    </div>
                  </div>
                  
                  <div className="text-xs font-mono bg-blue-50 text-blue-700 px-3 py-1 rounded mb-4">
                    Kích thước phủ bì thực tế: {cols * 300} x {rows * 300} mm
                  </div>

                  <svg 
                    viewBox={`-10 -10 ${TOTAL_WIDTH + 20} ${TOTAL_HEIGHT + 20}`} 
                    className="w-full max-w-[600px] drop-shadow-xl"
                  >
                    {tiles.map((tile) => {
                      const isHovered = hoveredTile?.r === tile.r && hoveredTile?.c === tile.c;
                      return (
                        <g
                          key={`${tile.r}-${tile.c}`}
                          transform={`translate(${tile.c * TILE_SIZE}, ${tile.r * TILE_SIZE})`}
                          onMouseEnter={() => setHoveredTile(tile)}
                          onMouseLeave={() => setHoveredTile(null)}
                          className="cursor-pointer transition-transform duration-200"
                          style={{ transformOrigin: 'center' }}
                        >
                          <path
                            d={getTilePath(tile.r, tile.c)}
                            className={`${getTileColor(tile.type)} stroke-gray-800 stroke-[1.5px] transition-all duration-200 ${
                              isHovered ? 'brightness-110 drop-shadow-md' : 'hover:brightness-110'
                            }`}
                            style={{
                              transform: isHovered ? 'scale(0.98)' : 'scale(1)',
                              transformOrigin: '50px 50px'
                            }}
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {hoveredTile ? (
                    <div className="mt-6 p-4 w-full bg-blue-50 rounded-lg border border-blue-100">
                      <h3 className="font-bold text-lg mb-1 text-blue-800">
                        Tấm {hoveredTile.type} (Tọa độ: Hàng {hoveredTile.r + 1}, Cột {hoveredTile.c + 1})
                      </h3>
                      <p className="text-sm text-blue-600">
                        Kích thước bao: 300x300mm. 
                        {hoveredTile.type === 'Góc' && ' Có 2 cạnh phẳng để áp sát vào góc khung nhôm.'}
                        {hoveredTile.type === 'Viền' && ' Có 1 cạnh phẳng để áp sát vào thanh nhôm.'}
                        {hoveredTile.type === 'Trung Tâm' && ' Có 4 ngàm lồi/lõm để liên kết 4 hướng.'}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 p-4 w-full bg-gray-50 border border-dashed border-gray-300 rounded-lg text-center text-gray-400">
                      <Info className="inline-block w-5 h-5 mb-1 mr-2" />
                      Trỏ chuột vào sa bàn để hiển thị thông tin
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-bold mb-2">Bản vẽ kích thước tiêu chuẩn</h2>
                  <p className="text-sm text-gray-500 mb-6">Thông số áp dụng chung cho cả ngàm lồi và ngàm lõm trên tất cả các tấm.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6 lg:gap-8">
                    <BlueprintCard title="1. Tấm Trung Tâm (Center)" type="center" />
                    <BlueprintCard title="2. Tấm Viền (Edge)" type="edge" />
                    <BlueprintCard title="3. Tấm Góc (Corner)" type="corner" />
                  </div>

                  {/* Thêm class break-inside-avoid để hộp tóm tắt không bị cắt nửa khi in */}
                  <div className="mt-8 p-4 bg-orange-50 border border-orange-200 rounded-lg break-inside-avoid">
                    <h4 className="font-bold text-orange-800 flex items-center mb-2">
                      <Ruler className="w-4 h-4 mr-2" /> Tóm tắt thông số ngàm Đuôi Én:
                    </h4>
                    <ul className="list-disc list-inside text-sm text-orange-700 space-y-1 ml-2">
                      <li><strong>Kích thước ô vuông cơ sở:</strong> 300 x 300 mm</li>
                      <li><strong>Chiều sâu ngàm (Depth):</strong> 45 mm (Nhô ra hoặc khoét vào)</li>
                      <li><strong>Bề rộng cổ ngàm (Neck):</strong> 60 mm (Phần thắt lại ở mép)</li>
                      <li><strong>Bề rộng đỉnh ngàm (Head):</strong> 90 mm (Phần xòe ra to nhất)</li>
                      <li><strong>Bo góc Tấm Góc:</strong> Cần bo (Fillet) 4 góc vuông ngoài cùng R3 - R5 mm.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR: Stats (Bỏ class print:hidden để có thể xuất hiện trên PDF) */}
            <div className="w-full lg:w-72 flex flex-col gap-4 break-inside-avoid print:mt-6 print:w-full">
              <div className="bg-white p-5 rounded-xl shadow-lg border-t-4 border-gray-800">
                <h3 className="text-lg font-bold mb-4 flex items-center">
                  <Grid3X3 className="w-5 h-5 mr-2 text-gray-700" />
                  Số lượng gia công Sàn
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <div className="w-4 h-4 rounded mt-1 mr-3 bg-emerald-400 border border-gray-300"></div>
                    <div>
                      <p className="font-bold text-sm">{centerCount} Tấm Trung Tâm</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="w-4 h-4 rounded mt-1 mr-3 bg-blue-400 border border-gray-300"></div>
                    <div>
                      <p className="font-bold text-sm">{edgeCount} Tấm Viền</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="w-4 h-4 rounded mt-1 mr-3 bg-orange-400 border border-gray-300"></div>
                    <div>
                      <p className="font-bold text-sm">{cornerCount} Tấm Góc</p>
                    </div>
                  </li>
                </ul>
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-sm font-bold flex justify-between">
                    <span>Tổng cộng:</span>
                    <span className="text-lg text-gray-800">{totalCount} Tấm</span>
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}