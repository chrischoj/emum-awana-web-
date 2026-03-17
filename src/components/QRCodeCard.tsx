import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeCardProps {
  value: string;
  title: string;
  size?: number;
}

export function QRCodeCard({ value, title, size = 200 }: QRCodeCardProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const svg = document.querySelector(`[data-qr="${title}"] svg`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = size * 2;
      canvas.height = size * 2;
      ctx?.drawImage(img, 0, 0, size * 2, size * 2);
      const a = document.createElement('a');
      a.download = `${title}-qr.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center" data-qr={title}>
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="inline-block p-4 bg-white rounded-lg border border-gray-100">
        <QRCodeSVG value={value} size={size} level="M" />
      </div>

      {/* URL 표시 + 복사 */}
      <div className="mt-3 flex items-center gap-2 justify-center">
        <p className="text-xs text-gray-400 truncate max-w-[200px]" title={value}>
          {value}
        </p>
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0 transition-colors"
        >
          {copied ? '복사됨!' : 'URL 복사'}
        </button>
      </div>

      <div className="mt-4 flex gap-2 justify-center">
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700"
        >
          다운로드
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-200"
        >
          인쇄
        </button>
      </div>
    </div>
  );
}
