/** Acciones de fichero: exportar/importar y (en dev) guardar en src/levels. */
export function FileSection({
  exportRoom,
  importRoom,
  saveToDevServer,
  fileInputRef,
}: {
  exportRoom: () => Promise<void>;
  importRoom: (file: File) => void;
  saveToDevServer: () => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="editor-section">
      <h2>Archivo</h2>
      <div className="editor-field-row">
        <button type="button" className="editor-btn" onClick={() => void exportRoom()}>
          Exportar
        </button>
        <button type="button" className="editor-btn" onClick={() => fileInputRef.current?.click()}>
          Importar
        </button>
      </div>
      {import.meta.env.DEV && (
        <button type="button" className="editor-btn editor-btn-wide" onClick={() => void saveToDevServer()}>
          Guardar en src/levels (dev)
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importRoom(file);
          e.target.value = '';
        }}
      />
    </section>
  );
}
