import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, FolderOpen, Image as ImageIcon, File as FileIcon, Plus, QrCode, Smartphone, Trash2, UploadCloud, X } from 'lucide-react';
import { generateQrMatrix } from '../qrGenerator';

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildQrSvgPath(matrix) {
  if (!matrix || !matrix.length) return '';
  let d = '';
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x]) {
        d += `M${x},${y}h1v1h-1z`;
      }
    }
  }
  return d;
}

export default function DropShareTab() {
  const [files, setFiles] = useState([]);
  const [shareStatus, setShareStatus] = useState({ running: false, url: '', lanIp: '', port: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [busyToggle, setBusyToggle] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAllCount, setSavedAllCount] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const savedTimerRef = useRef(null);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    window.twocode?.getDropShelf?.().then((list) => {
      if (active && Array.isArray(list)) setFiles(list);
    });
    window.twocode?.getDropShareStatus?.().then(async (st) => {
      if (!active) return;
      if (st?.running) {
        setShareStatus(st);
      } else {
        const started = await window.twocode?.toggleDropShareServer?.(true);
        if (active && started) setShareStatus(started);
      }
    });
    const unsub = window.twocode?.onDropShelfUpdate?.((list) => {
      if (Array.isArray(list)) setFiles(list);
    });
    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

  const qrData = useMemo(() => {
    if (!shareStatus.running || !shareStatus.url) return null;
    try {
      const matrix = generateQrMatrix(shareStatus.url);
      return { size: matrix.length, path: buildQrSvgPath(matrix) };
    } catch {
      return null;
    }
  }, [shareStatus.running, shareStatus.url]);

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const paths = window.twocode?.getDroppedFilePaths?.(e.dataTransfer?.files) || [];
    if (paths.length) {
      const updated = await window.twocode?.addDropFiles?.(paths);
      if (Array.isArray(updated)) setFiles(updated);
    }
  };

  const handlePickFiles = async () => {
    const updated = await window.twocode?.pickDropFiles?.();
    if (Array.isArray(updated)) setFiles(updated);
  };

  const handleToggleShare = async () => {
    if (busyToggle) return;
    setBusyToggle(true);
    try {
      const next = await window.twocode?.toggleDropShareServer?.(!shareStatus.running);
      if (next) setShareStatus(next);
    } finally {
      setBusyToggle(false);
    }
  };

  const handleSaveAll = async () => {
    if (savingAll || !files.length) return;
    setSavingAll(true);
    try {
      const res = await window.twocode?.saveAllDropFiles?.();
      if (res?.ok && res.count > 0) {
        setSavedAllCount(res.count);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedAllCount(null), 2200);
      }
    } finally {
      setSavingAll(false);
    }
  };

  const getItemPreviewUrl = (item) => {
    if (!item?.isImage || !shareStatus.running || !shareStatus.port || !shareStatus.token) return '';
    return `http://127.0.0.1:${shareStatus.port}/s/${shareStatus.token}/f/${encodeURIComponent(item.id)}?inline=1`;
  };

  return (
    <div
      className={`drop-share-view ${isDragOver ? 'is-drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <div className="drop-left-col">
        {shareStatus.running && qrData ? (
          <div className="drop-qr-card" title={shareStatus.url}>
            <svg
              className="drop-qr-svg"
              viewBox={`0 0 ${qrData.size} ${qrData.size}`}
              shapeRendering="crispEdges"
              aria-label="QR"
            >
              <rect width={qrData.size} height={qrData.size} fill="#ffffff" />
              <path d={qrData.path} fill="#090b10" />
            </svg>
          </div>
        ) : (
          <div className="drop-zone-box">
            <button
              type="button"
              className="drop-pick-btn"
              onClick={handlePickFiles}
              title="Dosya seç"
            >
              <span className="drop-float-icon">
                <UploadCloud size={22} strokeWidth={1.9} />
              </span>
              <span>Drop</span>
            </button>
            <button
              type="button"
              className="drop-share-btn"
              onClick={handleToggleShare}
              disabled={busyToggle}
              title="Telefona QR ile bağlan"
            >
              <QrCode size={13} />
              <span>QR</span>
            </button>
          </div>
        )}
      </div>

      <div className="drop-right-col">
        {files.length === 0 ? (
          <button
            type="button"
            className="drop-empty-zone"
            onClick={handlePickFiles}
          >
            <span className="drop-empty-pulse">
              <UploadCloud size={20} strokeWidth={1.8} />
            </span>
            <span>Sürükle veya seç</span>
          </button>
        ) : (
          <>
            <div className="drop-header-row">
              <div className="drop-title-wrap">
                <span
                  className="drop-count-pill is-draggable"
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    window.twocode?.startDropDrag?.(files.map((f) => f.path));
                  }}
                  title="Tüm dosyaları sürükle"
                >
                  {files.length}
                </span>
              </div>
              <div className="drop-header-actions">
                <button
                  type="button"
                  className={`drop-mini-btn is-batch ${savedAllCount !== null ? 'is-done' : ''}`}
                  onClick={handleSaveAll}
                  disabled={savingAll}
                  title="Tüm dosyaları seçilen klasöre kaydet (Masaüstü varsayılan)"
                >
                  {savedAllCount !== null ? <Check size={12} /> : <Download size={12} />}
                  <span>
                    {savingAll
                      ? 'Kaydediliyor...'
                      : savedAllCount !== null
                        ? `${savedAllCount} kaydedildi`
                        : 'Toplu İndir'}
                  </span>
                </button>
                <button type="button" className="drop-mini-btn" onClick={handlePickFiles} title="Ekle">
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  className="drop-mini-btn is-danger"
                  onClick={async () => {
                    const res = await window.twocode?.clearDropShelf?.();
                    if (Array.isArray(res)) setFiles(res);
                  }}
                  title="Temizle"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <div className="drop-list-card">
              <div className="drop-list">
                {files.map((item, idx) => {
                  const thumbUrl = getItemPreviewUrl(item);
                  return (
                    <div
                      key={item.id}
                      className="drop-item-row"
                      style={{ animationDelay: `${Math.min(idx * 35, 180)}ms` }}
                      draggable
                      onDragStart={(e) => {
                        e.preventDefault();
                        window.twocode?.startDropDrag?.(item.path);
                      }}
                      title={item.name}
                    >
                      <span
                        className={`drop-item-icon ${thumbUrl ? 'has-thumb' : ''}`}
                        onClick={(e) => {
                          if (!thumbUrl) return;
                          e.stopPropagation();
                          setPreviewItem({ ...item, thumbUrl });
                        }}
                        title={thumbUrl ? 'Önizle' : undefined}
                      >
                        {thumbUrl ? (
                          <img
                            className="drop-item-thumb"
                            src={thumbUrl}
                            alt=""
                            loading="lazy"
                            draggable={false}
                          />
                        ) : item.isImage ? (
                          <ImageIcon size={14} />
                        ) : (
                          <FileIcon size={14} />
                        )}
                      </span>
                      <div className="drop-item-info">
                        <span className="drop-item-name">{item.name}</span>
                        <span className="drop-item-meta">
                          {formatFileSize(item.size)}
                          {item.source === 'phone' && (
                            <span className="drop-phone-tag">
                              <Smartphone size={10} />
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="drop-item-actions">
                        <button
                          type="button"
                          className="drop-icon-btn"
                          onClick={() => window.twocode?.openDropFile?.(item.path)}
                          title="Klasör"
                        >
                          <FolderOpen size={13} />
                        </button>
                        <button
                          type="button"
                          className="drop-icon-btn"
                          onClick={async () => {
                            const res = await window.twocode?.removeDropFile?.(item.id);
                            if (Array.isArray(res)) setFiles(res);
                          }}
                          title="Kaldır"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {previewItem && (
        <div className="drop-preview-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="drop-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drop-preview-stage">
              <img className="drop-preview-img" src={previewItem.thumbUrl} alt="" />
            </div>
            <span className="drop-preview-size-pill">{formatFileSize(previewItem.size)}</span>
            <div className="drop-preview-float-actions">
              <button
                type="button"
                className="drop-preview-pill-btn"
                onClick={() => window.twocode?.openDropFile?.(previewItem.path)}
                title="Klasörde Göster"
              >
                <FolderOpen size={13} />
              </button>
              <button
                type="button"
                className="drop-preview-pill-btn is-close"
                onClick={() => setPreviewItem(null)}
                title="Kapat"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
