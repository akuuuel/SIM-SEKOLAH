// ============================================================================
// SweetAlert Ultra-Modern Wrapper — Web Absensi MAN 1 BULUKUMBA
// Desain Modern Berstandar iOS / Linear / Stripe Design System
// Bekerja 100% Offline (Engine Native Modern) & Online (SweetAlert2 Lib)
// ============================================================================

declare global {
  interface Window {
    Swal?: any;
  }
}

export interface SwalOptions {
  title?: string;
  text?: string;
  html?: string;
  icon?: 'success' | 'error' | 'warning' | 'info' | 'question';
  showCancelButton?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonColor?: string;
  cancelButtonColor?: string;
  timer?: number;
  timerProgressBar?: boolean;
  showConfirmButton?: boolean;
}

export interface SwalResult {
  isConfirmed: boolean;
  isDenied?: boolean;
  isDismissed?: boolean;
}

/**
 * Render modal modern mandiri (High-End Clean UI, 100% offline tanpa CDN)
 */
function renderFallbackModal(options: SwalOptions): Promise<SwalResult> {
  return new Promise((resolve) => {
    // 1. Backdrop Overlay (Glassmorphism Blur)
    const overlay = document.createElement('div');
    overlay.className = 'swal-modern-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    `;

    // 2. Modal Dialog Card
    const modal = document.createElement('div');
    modal.className = 'swal-modern-modal';
    modal.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 380px;
      background: #ffffff;
      border-radius: 28px;
      padding: 2rem 1.75rem 1.75rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
      border: 1px solid rgba(226, 232, 240, 0.85);
      transform: scale(0.92) translateY(8px);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 3. Modern Icon with Dual Glowing Ring
    const iconType = options.icon || 'info';
    let iconRingColor = 'rgba(22, 163, 74, 0.12)';
    let iconBgColor = '#f0fdf4';
    let iconBorderColor = '#bbf7d0';
    let iconTextColor = '#16a34a';
    let iconSvg = '';
    let btnGradient = 'linear-gradient(135deg, #16a34a, #059669)';
    let btnShadow = '0 6px 18px -2px rgba(22, 163, 74, 0.4)';

    if (iconType === 'success') {
      iconRingColor = 'rgba(22, 163, 74, 0.14)';
      iconBgColor = '#f0fdf4';
      iconBorderColor = '#bbf7d0';
      iconTextColor = '#16a34a';
      btnGradient = 'linear-gradient(135deg, #16a34a, #059669)';
      btnShadow = '0 6px 18px -2px rgba(22, 163, 74, 0.4)';
      iconSvg = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${iconTextColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
    } else if (iconType === 'error') {
      iconRingColor = 'rgba(225, 29, 72, 0.14)';
      iconBgColor = '#fff1f2';
      iconBorderColor = '#fecdd3';
      iconTextColor = '#e11d48';
      btnGradient = 'linear-gradient(135deg, #e11d48, #be123c)';
      btnShadow = '0 6px 18px -2px rgba(225, 29, 72, 0.4)';
      iconSvg = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${iconTextColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      `;
    } else if (iconType === 'warning') {
      iconRingColor = 'rgba(245, 158, 11, 0.14)';
      iconBgColor = '#fffbeb';
      iconBorderColor = '#fde68a';
      iconTextColor = '#d97706';
      btnGradient = 'linear-gradient(135deg, #f59e0b, #d97706)';
      btnShadow = '0 6px 18px -2px rgba(245, 158, 11, 0.4)';
      iconSvg = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${iconTextColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `;
    } else {
      iconRingColor = 'rgba(14, 165, 233, 0.14)';
      iconBgColor = '#f0f9ff';
      iconBorderColor = '#bae6fd';
      iconTextColor = '#0284c7';
      btnGradient = 'linear-gradient(135deg, #0284c7, #0369a1)';
      btnShadow = '0 6px 18px -2px rgba(2, 132, 199, 0.4)';
      iconSvg = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${iconTextColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      `;
    }

    const iconOuter = document.createElement('div');
    iconOuter.style.cssText = `
      width: 72px;
      height: 72px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${iconBgColor};
      border: 1.5px solid ${iconBorderColor};
      box-shadow: 0 0 0 8px ${iconRingColor};
      margin-bottom: 1.25rem;
      flex-shrink: 0;
    `;
    iconOuter.innerHTML = iconSvg;
    modal.appendChild(iconOuter);

    // 4. Content Text
    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'width: 100%; margin-bottom: 1.5rem;';

    if (options.title) {
      const titleEl = document.createElement('h3');
      titleEl.style.cssText = `
        font-size: 1.25rem;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.025em;
        line-height: 1.3;
        margin: 0 0 0.5rem 0;
      `;
      titleEl.textContent = options.title;
      textContainer.appendChild(titleEl);
    }

    if (options.html) {
      const htmlEl = document.createElement('div');
      htmlEl.style.cssText = `
        font-size: 0.875rem;
        color: #64748b;
        line-height: 1.55;
        max-width: 310px;
        margin: 0 auto;
      `;
      htmlEl.innerHTML = options.html;
      textContainer.appendChild(htmlEl);
    } else if (options.text) {
      const descEl = document.createElement('p');
      descEl.style.cssText = `
        font-size: 0.875rem;
        color: #64748b;
        line-height: 1.55;
        max-width: 310px;
        margin: 0 auto;
      `;
      descEl.textContent = options.text;
      textContainer.appendChild(descEl);
    }
    modal.appendChild(textContainer);

    // 5. Button Actions
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
      display: flex;
      gap: 0.75rem;
      width: 100%;
      align-items: center;
      justify-content: center;
    `;

    const cleanup = () => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.92) translateY(8px)';
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      }, 200);
    };

    if (options.showCancelButton) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = options.cancelButtonText || 'Batal';
      cancelBtn.style.cssText = `
        flex: 1;
        padding: 0.8125rem 1.25rem;
        border-radius: 16px;
        font-size: 0.8125rem;
        font-weight: 700;
        color: #475569;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        outline: none;
      `;
      cancelBtn.onmouseenter = () => (cancelBtn.style.background = '#e2e8f0');
      cancelBtn.onmouseleave = () => (cancelBtn.style.background = '#f1f5f9');
      cancelBtn.onmousedown = () => (cancelBtn.style.transform = 'scale(0.96)');
      cancelBtn.onmouseup = () => (cancelBtn.style.transform = 'scale(1)');
      cancelBtn.onclick = () => {
        cleanup();
        resolve({ isConfirmed: false, isDismissed: true });
      };
      btnContainer.appendChild(cancelBtn);
    }

    if (options.showConfirmButton !== false) {
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = options.confirmButtonText || 'OK';
      confirmBtn.style.cssText = `
        flex: 1;
        padding: 0.8125rem 1.25rem;
        border-radius: 16px;
        font-size: 0.8125rem;
        font-weight: 700;
        color: #ffffff;
        background: ${btnGradient};
        border: none;
        box-shadow: ${btnShadow};
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        outline: none;
      `;
      confirmBtn.onmouseenter = () => (confirmBtn.style.filter = 'brightness(1.08)');
      confirmBtn.onmouseleave = () => (confirmBtn.style.filter = 'none');
      confirmBtn.onmousedown = () => (confirmBtn.style.transform = 'scale(0.96)');
      confirmBtn.onmouseup = () => (confirmBtn.style.transform = 'scale(1)');
      confirmBtn.onclick = () => {
        cleanup();
        resolve({ isConfirmed: true });
      };
      btnContainer.appendChild(confirmBtn);
    }

    modal.appendChild(btnContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Trigger smooth enter animation
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });

    if (options.timer && options.timer > 0) {
      setTimeout(() => {
        cleanup();
        resolve({ isConfirmed: false, isDismissed: true });
      }, options.timer);
    }
  });
}

/**
 * Toast pill mengambang bergaya modern (Dynamic Island / Apple Pill Style)
 */
function renderModernToast(title: string, icon: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
  const existing = document.querySelector('.swal-modern-toast');
  if (existing && document.body.contains(existing)) {
    document.body.removeChild(existing);
  }

  const toast = document.createElement('div');
  toast.className = 'swal-modern-toast';

  let dotColor = '#10b981';
  let iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  if (icon === 'error') {
    dotColor = '#f43f5e';
    iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (icon === 'warning') {
    dotColor = '#f59e0b';
    iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }

  toast.style.cssText = `
    position: fixed;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%) translateY(-20px) scale(0.95);
    z-index: 9999999;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1.25rem;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: #ffffff;
    border-radius: 9999px;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.12);
    font-size: 0.8125rem;
    font-weight: 600;
    font-family: 'Inter', system-ui, sans-serif;
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    max-width: 90vw;
  `;

  toast.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 9999px; background: rgba(255,255,255,0.08); flex-shrink: 0;">
      ${iconSvg}
    </div>
    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</span>
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0) scale(1)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-15px) scale(0.95)';
    setTimeout(() => {
      if (document.body.contains(toast)) document.body.removeChild(toast);
    }, 300);
  }, 2800);
}

// Objek Swal Universal Modern
export const Swal = {
  fire: (
    optionsOrTitle: SwalOptions | string,
    text?: string,
    icon?: 'success' | 'error' | 'warning' | 'info' | 'question'
  ): Promise<SwalResult> => {
    let opts: SwalOptions = {};
    if (typeof optionsOrTitle === 'string') {
      opts = {
        title: optionsOrTitle,
        text: text || '',
        icon: icon || 'info',
        confirmButtonColor: '#16a34a',
      };
    } else {
      opts = {
        confirmButtonColor: '#16a34a',
        ...optionsOrTitle,
      };
    }

    const isDanger = opts.icon === 'error' || opts.confirmButtonColor === '#dc2626' || opts.confirmButtonColor === '#e11d48';
    const isWarning = opts.icon === 'warning' || opts.confirmButtonColor === '#d97706' || opts.confirmButtonColor === '#f59e0b';

    // Jika SweetAlert2 asli tersedia di window, terapkan custom class modern
    if (typeof window !== 'undefined' && window.Swal) {
      return window.Swal.fire({
        buttonsStyling: false,
        customClass: {
          popup: 'swal2-modern-card',
          title: 'swal2-modern-title',
          htmlContainer: 'swal2-modern-body',
          confirmButton: `swal2-modern-confirm-btn ${isDanger ? 'btn-danger' : isWarning ? 'btn-warning' : ''}`,
          cancelButton: 'swal2-modern-cancel-btn',
          actions: 'swal2-modern-actions',
          icon: 'swal2-modern-icon',
        },
        backdrop: 'rgba(15, 23, 42, 0.55)',
        ...opts,
      });
    }

    // Engine modern native (100% konsisten & tanpa dependensi eksternal)
    return renderFallbackModal(opts);
  },

  // Helper Success
  success: (title: string, text?: string) => {
    return Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonText: 'Selesai',
      confirmButtonColor: '#16a34a',
    });
  },

  // Helper Error
  error: (title: string, text?: string, html?: string) => {
    return Swal.fire({
      icon: 'error',
      title,
      text,
      html,
      confirmButtonText: 'Mengerti',
      confirmButtonColor: '#e11d48',
    });
  },

  // Helper Warning
  warning: (title: string, text?: string, html?: string) => {
    return Swal.fire({
      icon: 'warning',
      title,
      text,
      html,
      confirmButtonText: 'OK',
      confirmButtonColor: '#f59e0b',
    });
  },

  // Helper Konfirmasi (Confirm Yes/No)
  confirm: async (
    title: string,
    text: string,
    confirmButtonText = 'Ya, Lanjutkan',
    cancelButtonText = 'Batal'
  ): Promise<boolean> => {
    const res = await Swal.fire({
      icon: 'warning',
      title,
      text,
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#64748b',
    });
    return res.isConfirmed;
  },

  // Helper Toast kecil di atas layar
  toast: (title: string, icon: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    renderModernToast(title, icon);
  },
};

export default Swal;
