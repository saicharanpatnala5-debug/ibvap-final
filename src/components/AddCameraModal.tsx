import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileVideo, Globe, Play, Upload, X, AlertCircle } from 'lucide-react';
import { CameraFeedItem } from '../types';
import { SAMPLE_FEED_PRESETS, SampleFeedPreset } from '../data/sampleFeeds';
import { getDetectionModel } from '../services/detectionEngine';

interface AddCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCamera: (camera: CameraFeedItem) => void;
}

export const AddCameraModal: React.FC<AddCameraModalProps> = ({
  isOpen,
  onClose,
  onAddCamera,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'stream' | 'presets'>('upload');
  const [cameraName, setCameraName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-warm AI detection pipeline in background the moment modal opens or user selects file
  useEffect(() => {
    if (isOpen) {
      getDetectionModel().catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!cameraName) {
        // Auto-fill sensible camera name from filename
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        setCameraName(`CAM: ${cleanName}`);
      }
      setErrorMessage(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validExts = ['.mp4', '.webm', '.mov', '.jpg', '.jpeg', '.png', '.webp'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExts.includes(fileExt)) {
        setErrorMessage('Please upload a supported surveillance file (.mp4, .webm, .mov, .jpg, .png)');
        return;
      }
      setSelectedFile(file);
      if (!cameraName) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        setCameraName(`CAM: ${cleanName}`);
      }
      setErrorMessage(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const now = Date.now();
    const defaultName = cameraName.trim() || `CAM-${Math.floor(100 + Math.random() * 900)}`;

    if (activeTab === 'upload') {
      if (!selectedFile) {
        setErrorMessage('Please select or drop a video file (.mp4, .webm, or .mov)');
        return;
      }
      const objectUrl = URL.createObjectURL(selectedFile);
      const newCamera: CameraFeedItem = {
        id: `cam-${now}-${Math.random().toString(36).substring(2, 6)}`,
        name: defaultName,
        sourceType: 'file',
        sourceUrl: objectUrl,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        status: 'active',
        fps: 30,
        isNightMode: false,
        zones: [],
        createdAt: now,
      };
      onAddCamera(newCamera);
      resetAndClose();
    } else if (activeTab === 'stream') {
      if (!streamUrl.trim()) {
        setErrorMessage('Please enter an RTSP or HTTP/HLS video stream URL');
        return;
      }
      const cleanUrl = streamUrl.trim();
      const newCamera: CameraFeedItem = {
        id: `cam-${now}-${Math.random().toString(36).substring(2, 6)}`,
        name: defaultName,
        sourceType: 'stream',
        sourceUrl: cleanUrl,
        status: 'active',
        fps: 25,
        isNightMode: false,
        zones: [],
        createdAt: now,
      };
      onAddCamera(newCamera);
      resetAndClose();
    }
  };

  const handleSelectPreset = (preset: SampleFeedPreset) => {
    const now = Date.now();
    const newCamera: CameraFeedItem = {
      id: `cam-${now}-${Math.random().toString(36).substring(2, 6)}`,
      name: cameraName.trim() || preset.name,
      sourceType: 'stream',
      sourceUrl: preset.url,
      status: 'active',
      fps: 30,
      isNightMode: preset.type === 'perimeter_night',
      zones: [], // Zones are OFF by default on every camera per spec
      createdAt: now,
    };
    onAddCamera(newCamera);
    resetAndClose();
  };

  const resetAndClose = () => {
    setCameraName('');
    setStreamUrl('');
    setSelectedFile(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-camera-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div
        id="add-camera-card"
        className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-neutral-300" aria-hidden="true" />
            <h2 id="add-camera-modal-title" className="text-lg font-semibold tracking-tight">
              Add Camera Feed
            </h2>
          </div>
          <button
            id="close-add-camera-modal-btn"
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Close add camera modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="mt-4 flex rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
          <button
            id="tab-upload-btn"
            type="button"
            onClick={() => {
              setActiveTab('upload');
              setErrorMessage(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Upload className="h-4 w-4" />
            Upload Video File
          </button>
          <button
            id="tab-stream-btn"
            type="button"
            onClick={() => {
              setActiveTab('stream');
              setErrorMessage(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === 'stream'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Globe className="h-4 w-4" />
            RTSP / IP Stream
          </button>
          <button
            id="tab-presets-btn"
            type="button"
            onClick={() => {
              setActiveTab('presets');
              setErrorMessage(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === 'presets'
                ? 'bg-neutral-800 text-white shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Play className="h-4 w-4" />
            Sample Test Feeds
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Camera Name Input */}
          <div>
            <label htmlFor="camera-name-input" className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              Camera Identifier / Label
            </label>
            <input
              id="camera-name-input"
              type="text"
              placeholder="e.g. CAM-01 North Gate Perimeter"
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {activeTab === 'upload' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                Surveillance Recording or Reference Image (.mp4, .webm, .mov, .jpg, .png)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? 'border-amber-500 bg-amber-500/5'
                    : selectedFile
                    ? 'border-neutral-600 bg-neutral-800/40'
                    : 'border-neutral-700 hover:border-neutral-500 bg-neutral-950/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="camera-file-input"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*,image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex items-center gap-3 text-left">
                    <div className="rounded-lg bg-neutral-800 p-2 text-amber-400">
                      <FileVideo className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-100">{selectedFile.name}</p>
                      <p className="text-xs text-neutral-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for continuous detection
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-full bg-neutral-800 p-3 text-neutral-400 mb-2">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-neutral-200">
                      Drop CCTV video recording here or <span className="text-amber-400">browse file</span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Supports MP4, WebM, and MOV formats for client-side AI analysis
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stream' && (
            <div>
              <label htmlFor="rtsp-url-input" className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                RTSP / IP Stream URL
              </label>
              <input
                id="rtsp-url-input"
                type="text"
                placeholder="rtsp://admin:password@192.168.1.120:554/h264Preview_01_main or http://..."
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <div className="mt-2 rounded-lg bg-neutral-950/60 p-3 text-xs text-neutral-400 space-y-1">
                <p className="font-medium text-neutral-300">Supported Ingestion Protocols:</p>
                <p>• Native browser HTTP / HTTPS MP4 or WebM video streams</p>
                <p>• HLS streams (`.m3u8`) and HTTP surveillance tunnels</p>
                <p>• For raw RTSP ports (554), browser-compatible WebRTC / WebSocket proxy transcoding is mapped seamlessly</p>
              </div>
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                1-Click Quick Start Surveillance Feeds
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {SAMPLE_FEED_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    id={`preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset)}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 transition-colors hover:border-amber-500/60 hover:bg-neutral-800/40"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-100">{preset.name}</span>
                        {preset.type === 'perimeter_night' && (
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            Night Mode
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-400">{preset.description}</p>
                    </div>
                    <button
                      type="button"
                      className="ml-3 shrink-0 rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab !== 'presets' && (
            <div className="flex justify-end gap-3 border-t border-neutral-800 pt-4">
              <button
                id="cancel-add-camera-btn"
                type="button"
                onClick={resetAndClose}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Cancel
              </button>
              <button
                id="submit-add-camera-btn"
                type="submit"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Add Camera to Ingestion
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
