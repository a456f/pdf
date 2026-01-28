import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Importar el worker como URL para que Vite lo procese correctamente
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import axios from 'axios';
import { Pen, Image as ImageIcon, Download, FileText, Upload, Trash2, FileUp, Loader2 } from 'lucide-react';
import './App.css';

// Configurar Worker de PDF.js localmente
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Definir la URL del backend de forma inteligente
// En desarrollo usa localhost:8000, en producción (VPS) usa ruta relativa ''
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

function App() {
  const [pdfFile, setPdfFile] = useState(null); // Archivo PDF original
  const [pdfDoc, setPdfDoc] = useState(null); // Objeto de PDF.js para renderizar
  const [tool, setTool] = useState('none'); // Herramienta activa: 'none', 'draw'
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Referencias a elementos del DOM
  const canvasRef = useRef(null); // Canvas para renderizar el PDF
  const drawCanvasRef = useRef(null); // Canvas para dibujar encima
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Función unificada para cargar PDF
  const loadPdf = async (file) => {
    if (!file || file.type !== 'application/pdf') return;
    setIsProcessing(true);

    try {
      setPdfFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      // Esperar un poco para asegurar que el DOM del canvas esté listo si acabamos de cambiar de vista
      setTimeout(() => renderPage(doc, 1), 100);
    } catch (error) {
      console.error("Error cargando PDF:", error);
      alert("No se pudo cargar el PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    loadPdf(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    loadPdf(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Renderizar una página específica del PDF
  const renderPage = async (doc, pageNum) => {
    if (!canvasRef.current || !drawCanvasRef.current) return;

    const page = await doc.getPage(pageNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Configurar canvas base para el PDF
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Configurar canvas de dibujo (overlay)
    const drawCanvas = drawCanvasRef.current;
    drawCanvas.height = viewport.height;
    drawCanvas.width = viewport.width;

    // Renderizar PDF en el canvas base
    await page.render({ canvasContext: context, viewport }).promise;
  };

  // --- Lógica de Dibujo ---
  const startDrawing = ({ nativeEvent }) => {
    if (tool !== 'draw') return;
    const { offsetX, offsetY } = nativeEvent;
    const ctx = drawCanvasRef.current.getContext('2d');
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing || tool !== 'draw') return;
    const { offsetX, offsetY } = nativeEvent;
    const ctx = drawCanvasRef.current.getContext('2d');
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // --- Lógica para agregar imágenes ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const ctx = drawCanvasRef.current.getContext('2d');
        // Dibuja la imagen en una posición fija (ej. 50,50) con un tamaño fijo
        ctx.drawImage(img, 50, 50, 200, 150);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Limpiar el canvas de dibujo
  const clearCanvas = () => {
    const canvas = drawCanvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Helper: Generar bytes del PDF con las ediciones (dibujos)
  const getEditedPdfBytes = async () => {
    if (!pdfFile) return null;
    const existingPdfBytes = await pdfFile.arrayBuffer();
    const pdfDocLib = await PDFDocument.load(existingPdfBytes);
    const firstPage = pdfDocLib.getPages()[0];
    const drawCanvas = drawCanvasRef.current;
    const pngImageBytes = await pdfDocLib.embedPng(drawCanvas.toDataURL('image/png'));
    firstPage.drawImage(pngImageBytes, {
      x: 0,
      y: 0,
      width: firstPage.getWidth(),
      height: firstPage.getHeight(),
    });
    return await pdfDocLib.save();
  };

  // Guardar el PDF con las ediciones
  const savePdf = async () => {
    const pdfBytes = await getEditedPdfBytes();
    if (!pdfBytes) return;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'documento-editado.pdf';
    link.click();
  };

  // Convertir a Word usando el backend
  const convertToWord = async () => {
    if (!pdfFile) return;
    setIsProcessing(true);

    try {
      // Generar el PDF editado para enviarlo al backend
      const pdfBytes = await getEditedPdfBytes();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', blob, pdfFile.name);

      const response = await axios.post(`${API_URL}/api/convert-to-word`, formData, {
        responseType: 'blob', // Importante para recibir un archivo
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${pdfFile.name.replace('.pdf', '')}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error al convertir a Word:", error);
      let errorMessage = "Hubo un error al convertir el archivo a Word.";

      if (error.response) {
        // El servidor respondió con un error (ej. 500), pero axios lo recibe como Blob
        if (error.response.data instanceof Blob) {
          try {
            const text = await error.response.data.text();
            const json = JSON.parse(text);
            if (json.error || json.detail) errorMessage += `\nDetalle: ${json.error || json.detail}`;
          } catch (e) {
            errorMessage += `\nCódigo: ${error.response.status}`;
          }
        }
      } else if (error.request) {
        errorMessage += "\nNo se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 8000.";
      } else {
        errorMessage += `\n${error.message}`;
      }
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header Profesional */}
      <header className="header">
        <div className="logo">
          <FileText className="text-primary" size={24} />
          <h1>PDF Suite Pro</h1>
        </div>
        {pdfFile && <span className="filename">{pdfFile.name}</span>}
      </header>

      {/* Toolbar (Solo visible si hay documento) */}
      {pdfDoc && (
        <div className="toolbar">
          <div className="tool-group">
            <button onClick={() => fileInputRef.current.click()} className="btn secondary">
              <Upload size={18} /> Abrir otro
            </button>
            <div className="divider"></div>
            <button 
              className={`btn ${tool === 'draw' ? 'active' : ''}`} 
              onClick={() => setTool(tool === 'draw' ? 'none' : 'draw')}
            >
              <Pen size={18} /> Dibujar
            </button>
            <button onClick={() => imageInputRef.current.click()} className="btn">
              <ImageIcon size={18} /> Imagen
            </button>
            <button onClick={clearCanvas} className="btn danger-text">
              <Trash2 size={18} /> Limpiar
            </button>
          </div>
          
          <div className="tool-group">
            <button onClick={savePdf} className="btn primary">
              <Download size={18} /> Guardar PDF
            </button>
            <button onClick={convertToWord} disabled={isProcessing} className="btn success">
              {isProcessing ? <Loader2 className="spin" size={18}/> : <FileText size={18} />}
              {isProcessing ? ' Procesando...' : ' Convertir a Word'}
            </button>
          </div>
        </div>
      )}

      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} hidden />
      <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageUpload} hidden />

      {/* Área de Trabajo */}
      <div className="workspace">
        {isProcessing && !pdfDoc && (
          <div className="loading-overlay">
            <Loader2 className="spin" size={48} color="#4f46e5" />
            <p>Procesando documento...</p>
          </div>
        )}

        {pdfDoc ? (
          <div className="canvas-wrapper">
            <canvas ref={canvasRef} />
            <canvas 
              ref={drawCanvasRef} 
              className={`drawing-layer ${tool === 'draw' ? 'active' : ''}`} 
              onMouseDown={startDrawing} 
              onMouseMove={draw} 
              onMouseUp={stopDrawing} 
              onMouseLeave={stopDrawing} 
            />
          </div>
        ) : (
          <div 
            className="dropzone-container"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="dropzone" onClick={() => fileInputRef.current.click()}>
              <div className="icon-wrapper">
                <FileUp size={64} strokeWidth={1.5} />
              </div>
              <h3>Sube tu archivo PDF</h3>
              <p className="dropzone-subtext">Arrastra y suelta aquí o haz clic para explorar</p>
              <button className="btn primary mt-4">Seleccionar Archivo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
