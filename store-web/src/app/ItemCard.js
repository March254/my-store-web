"use client";

export default function ItemCard({ item, quantityInCart, onUpdate, mode }) {
  const maxLabel = mode === "withdraw" ? "คลังคงเหลือ" : "คุณถืออยู่";

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all relative">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* 📸 นำรูปภาพอุปกรณ์ตรงรายการสินค้ากลับมาแสดงผลที่เดิม */}
        <div className="w-20 h-20 bg-slate-50 rounded-2xl border border-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {item.image_url ? (
            <img 
              src={item.image_url} 
              alt={item.name} 
              className="w-full h-full object-cover" 
            />
          ) : (
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-wider">No Image</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-black text-slate-800 text-base uppercase italic truncate pr-16">{item.name}</h3>
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">{item.category}</p>
          <p className="text-xs font-bold text-slate-400">
            {maxLabel}: <span className="text-slate-700 font-black">{item.stock}</span> ชิ้น
          </p>
        </div>
      </div>

      {/* ฝั่งจัดการปุ่มบวกลบ และ ช่องพิมพ์กรอกตัวเลขโดยตรง */}
      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100 w-full sm:w-auto justify-between sm:justify-start">
        {/* ปุ่มลดจำนวน (-) */}
        <button
          type="button"
          onClick={() => onUpdate(item.id, -1, false)}
          className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
        >
          -
        </button>

        {/* ช่องกรอกตัวเลขโดยตรง (Direct Input) สามารถพิมพ์จำนวนได้เลย */}
        <div className="flex items-center justify-center bg-white px-3 h-10 rounded-xl border border-slate-200 min-w-[70px]">
          <input
            type="number"
            min="0"
            max={item.stock}
            value={quantityInCart || 0}
            onChange={(e) => onUpdate(item.id, e.target.value, true)}
            className="w-full text-center font-black text-slate-800 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* ปุ่มเพิ่มจำนวน (+) */}
        <button
          type="button"
          onClick={() => onUpdate(item.id, 1, false)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-md active:scale-95 transition-all ${
            mode === "withdraw" ? "bg-slate-900 hover:bg-slate-800" : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          +
        </button>
      </div>
    </div>
  );
}