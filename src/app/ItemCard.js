"use client";

export default function ItemCard({ item, quantityInCart, onUpdate, mode }) {
  const canAdd = mode === "return" || (mode === "withdraw" && quantityInCart < item.stock);

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4 hover:border-blue-300 transition-all group">
      
      {/* รูปภาพอุปกรณ์ */}
      <div className="w-20 h-20 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
        {item.image_url ? (
          <img 
            src={item.image_url} 
            alt={item.name} 
            className="w-full h-full object-contain p-1 group-hover:scale-110 transition-transform"
            onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=No+Photo'; }}
          />
        ) : (
          <div className="text-slate-300 flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <span className="text-[10px] mt-1 font-bold italic">No Photo</span>
          </div>
        )}
      </div>

      {/* รายละเอียด */}
      <div className="flex-1 min-w-0">
        <span className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-black uppercase tracking-tighter mb-1 inline-block">
          {item.category || 'GENERAL'}
        </span>
        <h2 className="font-bold text-slate-800 text-base truncate uppercase">{item.name}</h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          คงเหลือ: <span className="text-blue-600 font-black">{item.stock}</span> {item.unit || 'ชิ้น'}
        </p>
      </div>

      {/* ส่วนปุ่มบวก/ลบ */}
      <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
        <button 
          onClick={() => onUpdate(item.id, -1)}
          className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-bold shadow-sm hover:text-red-500 disabled:opacity-20 active:scale-90 transition-all"
          disabled={quantityInCart === 0}
        >
          -
        </button>
        <span className="w-6 text-center font-black text-sm text-slate-700">{quantityInCart}</span>
        <button 
          onClick={() => onUpdate(item.id, 1)}
          className={`w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-bold shadow-sm active:scale-90 transition-all ${canAdd ? 'hover:text-blue-600' : 'opacity-20 cursor-not-allowed'}`}
          disabled={!canAdd}
        >
          +
        </button>
      </div>
    </div>
  );
}