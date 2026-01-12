import { memo } from "react";
import { toast } from "../../utils/toast.js";

export const ExcelUploadSection = memo(({ onFileUpload }) => {
  return (
    <div 
      className="border-2 border-dashed border-blue-300 rounded-2xl p-8 md:p-12 text-center bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 hover:border-blue-400 transition-all shadow-lg hover:shadow-xl"
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
        className="cursor-pointer inline-flex flex-col items-center gap-4 md:gap-5"
      >
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-3xl md:text-4xl shadow-xl hover:scale-110 transition-transform">
          📤
        </div>
        <div>
          <p className="text-base md:text-lg font-bold text-slate-800">Cliquez ou glissez un fichier Excel ici</p>
          <p className="text-sm md:text-base text-slate-600 mt-2 font-medium">Formats acceptés: .xlsx, .xls</p>
        </div>
      </label>
    </div>
  );
});

ExcelUploadSection.displayName = "ExcelUploadSection";
