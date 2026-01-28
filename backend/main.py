import os
import shutil
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pdf2docx import Converter

app = FastAPI()

# Configuración CORS para permitir peticiones desde el frontend de React
# Asegúrate de que el puerto coincida con el de Vite (por defecto 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp"
os.makedirs(TEMP_DIR, exist_ok=True)

def cleanup_files(file_paths: list):
    """Borra archivos temporales en segundo plano después de que la respuesta se haya enviado."""
    for path in file_paths:
        if os.path.exists(path):
            os.remove(path)

@app.post("/api/convert-to-word")
async def convert_pdf_to_word(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Define rutas para los archivos temporales
    pdf_path = os.path.join(TEMP_DIR, file.filename)
    docx_filename = os.path.splitext(file.filename)[0] + ".docx"
    docx_path = os.path.join(TEMP_DIR, docx_filename)

    # 1. Guarda el PDF subido en el servidor temporalmente
    try:
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    # 2. Realiza la conversión de PDF a DOCX
    try:
        cv = Converter(pdf_path)
        cv.convert(docx_path, start=0, end=None)
        cv.close()
    except Exception as e:
        # Si la conversión falla, limpia el PDF subido y retorna un error
        cleanup_files([pdf_path])
        return {"error": f"Failed to convert PDF: {str(e)}"}

    # 3. Programa la limpieza de los archivos temporales (PDF y DOCX)
    background_tasks.add_task(cleanup_files, [pdf_path, docx_path])

    # 4. Retorna el archivo DOCX para su descarga en el navegador
    return FileResponse(
        path=docx_path,
        filename=docx_filename,
        media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)