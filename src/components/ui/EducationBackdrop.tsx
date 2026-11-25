import React from 'react';

/**
 * Backdrop ornamen ikon edukasi (Graduation cap, buku, sekolah, pensil, award)
 * Didesain sangat halus (subtle opacity ~3-4%) agar tidak mengganggu keterbacaan konten
 * Memberikan nuansa akademis khas Edlink / institusi pendidikan.
 */
export interface EducationBackdropProps {
  className?: string;
  svgClassName?: string;
  opacity?: number;
}

export const EducationBackdrop: React.FC<EducationBackdropProps> = ({
  className = '',
  svgClassName = 'text-emerald-900',
  opacity = 0.035,
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 overflow-hidden select-none z-0 ${className}`}
      style={{ opacity }}
    >
      <svg
        className={`w-full h-full ${svgClassName}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <pattern
            id="education-pattern"
            x="0"
            y="0"
            width="220"
            height="220"
            patternUnits="userSpaceOnUse"
          >
            {/* 1. Toga / Topi Kelulusan (Graduation Cap) */}
            <g transform="translate(30, 30) scale(1.1)">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </g>

            {/* 2. Buku Terbuka (Open Book) */}
            <g transform="translate(140, 45) scale(1.05)">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </g>

            {/* 3. Gedung Sekolah / Madrasah (School) */}
            <g transform="translate(35, 140) scale(1.05)">
              <path d="m4 6 8-4 8 4" />
              <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2" />
              <path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4" />
              <path d="M18 5v17" />
              <path d="M6 5v17" />
              <circle cx="12" cy="9" r="2" />
            </g>

            {/* 4. Pensil (Pencil) */}
            <g transform="translate(150, 150) rotate(-45) scale(1.1)">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </g>
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#education-pattern)" />
      </svg>
    </div>
  );
};
