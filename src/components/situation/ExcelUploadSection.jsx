import { memo } from "react";
import { toast } from "../../utils/toast.js";

export const ExcelUploadSection = memo(({ onFileUpload }) => {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-[#25D366]/40 bg-[#0b141a]/60 p-10 text-center backdrop-blur-sm transition-all hover:border-[#25D366]/70 hover:bg-[#0b141a]/80 md:p-14"
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const file = files[0];
          if (file.name.match(/\.(xlsx|xls)$/i)) {
            const fakeEvent = { target: { files: [file] } };
            onFileUpload(fakeEvent);
          } else {
            toast.error("Veuillez glisser un fichier Excel (.xlsx ou .xls)");
          }
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={onFileUpload}
        className="hidden"
        id="excel-upload"
      />
      <label
        htmlFor="excel-upload"
        className="inline-flex cursor-pointer flex-col items-center gap-5"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#25D366] text-4xl shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-105 md:h-24 md:w-24">
          📊
        </div>
        <div>
          <p className="text-lg font-bold text-white md:text-xl">
            Glissez votre fichier Excel ici
          </p>
          <p className="mt-2 text-sm text-slate-400">ou cliquez pour parcourir · .xlsx, .xls</p>
        </div>
      </label>
    </div>
  );
});

ExcelUploadSection.displayName = "ExcelUploadSection";
