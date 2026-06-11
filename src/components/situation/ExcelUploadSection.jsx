import { memo } from "react";
import { toast } from "../../utils/toast.js";

export const ExcelUploadSection = memo(({ onFileUpload }) => {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-blue-300 bg-white p-10 text-center shadow-inner md:p-14"
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const file = files[0];
          if (file.name.match(/\.(xlsx|xls)$/i)) {
            onFileUpload({ target: { files: [file] } });
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
      <label htmlFor="excel-upload" className="inline-flex cursor-pointer flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-4xl text-white shadow-lg">
          📊
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900">Cliquez ou glissez votre fichier Excel</p>
          <p className="mt-2 text-base font-medium text-gray-700">Format accepté : .xlsx ou .xls</p>
        </div>
      </label>
    </div>
  );
});

ExcelUploadSection.displayName = "ExcelUploadSection";
