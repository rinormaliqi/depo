"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

// Camera QR/barcode reader for the Scanner page. Native BarcodeDetector
// where the browser has it (Chrome/Edge on Android and desktop — decodes
// QR plus the common 1D formats in hardware), jsQR on a canvas frame
// everywhere else (iOS Safari has no BarcodeDetector as of 2026). Either
// way the result is a string handed to onDecode; what to do with it —
// resolve a label URL to a code, fill the field — is the form's business.
//
// getUserMedia only works in a secure context: https, or localhost. A
// phone on the LAN hitting http://192.168.x.x:3000 gets a clear message
// rather than a silent failure — run `next dev --experimental-https` for
// that, or test against a deployed instance.

type Detector = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

declare global {
  interface Window {
    BarcodeDetector?: DetectorCtor;
  }
}

type Status = "starting" | "scanning" | "error";

export function CameraScanner({ onDecode, onClose }: { onDecode: (raw: string) => void; onClose: () => void }) {
  const t = useTranslations("scanner");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((key: string) => {
    setError(t(key));
    setStatus("error");
  }, [t]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!window.isSecureContext) return fail("cameraNeedsHttps");
    if (!navigator.mediaDevices?.getUserMedia) return fail("cameraUnsupported");

    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        return fail(name === "NotAllowedError" ? "cameraDenied" : name === "NotFoundError" ? "cameraNone" : "cameraUnsupported");
      }
      if (stopped || !video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStatus("scanning");

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "code_39"] })
        : null;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const jsQR = detector ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (stopped || !video) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          let raw: string | null = null;
          try {
            if (detector) {
              raw = (await detector.detect(video))[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              raw = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            // A frame that fails to decode is just a frame that fails to decode.
          }
          if (raw && !stopped) {
            stopped = true;
            navigator.vibrate?.(60);
            onDecode(raw);
            return;
          }
        }
        // ~7 fps: plenty for a held-up label, and jsQR on a 720p frame is
        // the expensive path we don't want at 60.
        timer = setTimeout(tick, 140);
      };
      tick();
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [fail, onDecode]);

  return (
    <div className="dialog-backdrop" style={{ position: "fixed", zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog blueprint camera-dialog">
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <div className="dialog-title">{t("cameraTitle")}</div>
        <div className="camera-viewport">
          <video ref={videoRef} playsInline muted autoPlay />
          {status === "scanning" && <div className="camera-reticle" />}
          {status === "starting" && <div className="camera-overlay-text">{t("cameraStarting")}</div>}
          {status === "error" && <div className="camera-overlay-text">{error}</div>}
        </div>
        <div className="dialog-body">{t("cameraHint")}</div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>{t("cameraClose")}</button>
        </div>
      </div>
    </div>
  );
}
