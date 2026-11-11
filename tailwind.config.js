/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F2FF',
          100: '#E8EBFF',
          500: '#2A3DFF',
          600: '#172BFF', // Electric blue accent
          700: '#1022D8',
          800: '#0B189E',
        },
        sidebar: {
          DEFAULT: '#090A0F', // Dark sidebar background
          muted: '#171923',   // Hover item background
          border: '#202330',
        },
        canvas: '#F3F4F6',    // Main light canvas background
        surface: '#FFFFFF',   // Cards, panels, modals
        content: {
          primary: '#171923',
          secondary: '#6B7280',
          muted: '#9CA3AF',
        },
        border: {
          DEFAULT: '#E5E7EB',
          subtle: '#F0F1F3',
          strong: '#D1D5DB',
        },
        status: {
          success: '#16A34A',
          'success-bg': '#DCFCE7',
          warning: '#D97706',
          'warning-bg': '#FEF3C7',
          danger: '#DC2626',
          'danger-bg': '#FEE2E2',
          info: '#2563EB',
          'info-bg': '#DBEAFE',
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

