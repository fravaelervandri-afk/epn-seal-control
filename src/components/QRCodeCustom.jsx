import React, { useEffect, useRef } from 'react';

const QRCodeCustom = ({ displayValue, qrPayload, size = 200, showText = false }) => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    let isMounted = true;
    
    const drawQR = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = "Anonymous";
      
      // Menggunakan API QR Server Eksternal
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrPayload)}&qzone=2&ecc=H`;
      
      img.onload = () => {
        if (!isMounted) return;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        
        if (showText) {
          const fontSize = Math.floor(size * 0.09); 
          ctx.font = `bold ${fontSize}px monospace`;
          const textWidth = ctx.measureText(displayValue).width;
          const paddingX = Math.floor(size * 0.03);
          const paddingY = Math.floor(size * 0.03);
          const rectWidth = textWidth + (paddingX * 2);
          const rectHeight = fontSize + (paddingY * 2); 
          const rectX = size - rectWidth;
          const rectY = size - rectHeight;
          
          ctx.fillStyle = 'white';
          ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
          ctx.fillStyle = 'black';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(displayValue, size - paddingX, size - paddingY + (fontSize * 0.1));
        }
      };

      img.onerror = () => {
        console.error("Gagal memuat QR Code dari API server.");
      };
    };
    
    drawQR();
    return () => { isMounted = false; };
  }, [displayValue, qrPayload, size, showText]);

  return <canvas ref={canvasRef} width={size} height={size} className="w-full h-auto block bg-white" />;
};

export default QRCodeCustom;
