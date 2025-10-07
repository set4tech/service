export function BlueprintLoader() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-emerald-50/30 relative overflow-hidden">
      {/* Animated blueprint grid background */}
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-emerald-600"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Central animated floor plan sketch */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="animate-pulse">
          <img src="/set4-logo.svg" alt="Set4 Logo" className="w-16 h-16" />
        </div>

        {/* Animated blueprint drawing */}
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          className="text-emerald-700"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer walls */}
          <path
            d="M 40 40 L 160 40 L 160 160 L 40 160 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-draw-walls"
            strokeDasharray="480"
            strokeDashoffset="480"
          />

          {/* Interior wall 1 (vertical) */}
          <path
            d="M 100 40 L 100 160"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-draw-wall-1"
            strokeDasharray="120"
            strokeDashoffset="120"
          />

          {/* Interior wall 2 (horizontal) */}
          <path
            d="M 40 100 L 160 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-draw-wall-2"
            strokeDasharray="120"
            strokeDashoffset="120"
          />

          {/* Door swing arc */}
          <path
            d="M 70 40 Q 70 55, 85 55"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="animate-draw-door"
            strokeDasharray="25"
            strokeDashoffset="25"
          />

          {/* Window lines */}
          <g className="animate-fade-in-delayed">
            <line x1="120" y1="40" x2="140" y2="40" stroke="currentColor" strokeWidth="2" />
            <line x1="160" y1="70" x2="160" y2="90" stroke="currentColor" strokeWidth="2" />
          </g>

          {/* Compass/drafting tool icon - animated rotation */}
          <g className="animate-spin-slow origin-center" style={{ transformOrigin: '180px 20px' }}>
            <circle cx="180" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="180" y1="8" x2="180" y2="20" stroke="currentColor" strokeWidth="1.5" />
            <polygon points="180,20 177,26 183,26" fill="currentColor" />
          </g>
        </svg>

        {/* Loading text */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-emerald-800 font-medium">Loading Floor Plan</div>
          <div className="flex gap-1">
            <div
              className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      </div>

      {/* Scanning line effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-0 top-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent animate-scan" />
      </div>

      <style jsx>{`
        @keyframes draw-walls {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes draw-wall-1 {
          0%,
          40% {
            stroke-dashoffset: 120;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes draw-wall-2 {
          0%,
          60% {
            stroke-dashoffset: 120;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes draw-door {
          0%,
          80% {
            stroke-dashoffset: 25;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes fade-in-delayed {
          0%,
          85% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes scan {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(100vh);
          }
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-draw-walls {
          animation: draw-walls 2s ease-in-out infinite;
        }
        .animate-draw-wall-1 {
          animation: draw-wall-1 2s ease-in-out infinite;
        }
        .animate-draw-wall-2 {
          animation: draw-wall-2 2s ease-in-out infinite;
        }
        .animate-draw-door {
          animation: draw-door 2s ease-in-out infinite;
        }
        .animate-fade-in-delayed {
          animation: fade-in-delayed 2s ease-in-out infinite;
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
        }
      `}</style>
    </div>
  );
}
