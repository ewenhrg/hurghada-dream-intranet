import { memo } from "react";
import { toast } from "../../utils/toast.js";

export const ExcelUploadSection = memo(({ onFileUpload }) => {
  return (
    <div 
      className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/50"
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
        className="cursor-pointer inline-flex flex-col items-center gap-3"
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg">
          📤
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">Cliquez ou glissez un fichier Excel ici</p>
          <p className="text-xs text-slate-500 mt-1">Formats acceptés: .xlsx, .xls</p>
        </div>
      </label>
    </div>
  );
});

ExcelUploadSection.displayName = "ExcelUploadSection";

