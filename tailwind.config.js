/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tema Warna Resmi (Sesuai Referensi Gambar Pengguna)
        // Hijau segar & hangat (#38a638 / #2e8b2e) dengan aksen oranye CTA (#f59e0b)
        primary: {
          50: '#f0fdf2',
          100: '#dcfce4',
          200: '#bbf7cb',
          300: '#86ef9f',
          400: '#4ade6b',
          500: '#34c759',
          600: '#2e8b38', // Hijau Khas  (Vibrant, Fresh Education)
          700: '#23732d', // Hover state
          800: '#1e5c26',
          900: '#184b20',
          950: '#092910',
        },
        // Aksen Kuning/Oranye Khas Tombol "Mulai Sekarang" & "Masuk" Edlink
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
          light: '#fef3c7',
          dark: '#b45309',
        },
        sidebar: {
          DEFAULT: '#144622', // Deep Forest Edlink Green
          muted: '#1b5a2c',   // Hover item background
          border: '#246b36',
        },
        canvas: '#f4faf5',    // Latar belakang lembut dengan sentuhan mint segar Edlink
        surface: '#ffffff',   // Cards, panels, modals
        content: {
          primary: '#112918', // Dark forest slate untuk teks utama yang sangat terbaca
          secondary: '#4d6954',
          muted: '#7a9681',
        },
        border: {
          DEFAULT: '#e1ede4',
          subtle: '#ebf4ed',
          strong: '#c4ddcb',
        },
        status: {
          success: '#2e8b38',
          'success-bg': '#dcfce4',
          warning: '#d97706',
          'warning-bg': '#fef3c7',
          danger: '#dc2626',
          'danger-bg': '#fee2e2',
          info: '#0284c7',
          'info-bg': '#e0f2fe',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        button: '9px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        floating: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
