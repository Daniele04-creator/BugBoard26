// src/features/auth/components/LoginVideoPanel.jsx
import React, { useRef, useState } from "react";

export default function LoginVideoPanel() {
  const videoRef = useRef(null);
  const [videoFinished, setVideoFinished] = useState(false);
  const [videoPoster, setVideoPoster] = useState(null);

  const handleVideoEnd = () => {
    const video = videoRef.current;
    if (!video) {
      setVideoFinished(true);
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL("image/png");
        setVideoPoster(poster);
      }
    } catch (err) {
      console.error("Errore generazione poster video:", err);
    }

    setVideoFinished(true);
  };

  return (
    <div
      className="w-1/2 flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #7DD3FC 0%, #A78BFA 100%)",
      }}
    >
      <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
      <div className="absolute bottom-32 right-32 w-80 h-80 rounded-full bg-white/10 blur-3xl"></div>

      <div className="z-10 w-full h-full flex items-center justify-center animate-fadeIn">
        {!videoFinished ? (
          <video
            ref={videoRef}
            src="/Bugboard.webm"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="max-w-full max-h-full flex items-center justify-center">
            {videoPoster ? (
              <img
                src={videoPoster}
                alt="poster"
                className="object-contain max-w-full max-h-full"
              />
            ) : (
              <div className="text-white/20 text-4xl font-bold tracking-widest">
                LOGIN
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
