import React, { useEffect } from 'react'
import { navigateTo } from '../App'

interface LayoutProps {
  children: React.ReactNode
  currentPath: string
}

export default function Layout({ children, currentPath }: LayoutProps) {
  
  // Highlight active link manually based on currentPath
  const getLinkClass = (href: string) => {
    let active = false
    const path = currentPath === '/' ? '/' : currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath

    if (href === '/creators' && path.startsWith('/creators')) {
      active = true
    } else if (href === path) {
      active = true
    }
    return `navbar__link magnetic ${active ? 'active' : ''}`
  }

  const getContactBtnClass = () => {
    const path = currentPath === '/' ? '/' : currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath
    return `btn magnetic ${path === '/contact' ? 'btn--primary' : 'btn--ghost'}`
  }

  // Handle clicking custom transition links
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault()
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      window.open(href, '_blank')
    } else {
      navigateTo(href)
    }
  }

  useEffect(() => {
    // Expose layout initializer and re-run magnetic and cursor listeners on mount/route changes
    const win = window as any
    if (typeof win !== 'undefined' && typeof win.ScrollTrigger !== 'undefined') {
      setTimeout(() => {
        win.ScrollTrigger.refresh()
      }, 200)
    }
  }, [currentPath])

  return (
    <>
      {/* SVG Noise Filter Overlay */}
      <svg className="noise-overlay" xmlns="http://www.w3.org/2000/svg">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
      </svg>

      {/* Page Loader Transition Overlay */}
      <div className="loader" id="page-loader" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#090909', zIndex: 999999999, display: 'none' }}>
        <div className="loader__grain"></div>
        <div className="loader__glow"></div>
        <canvas className="loader__particles-canvas" id="loader-particles-canvas"></canvas>
        
        <div className="loader__logo-container">
          <svg className="loader__logo-svg" viewBox="0 0 420 200" id="loader-logo-svg">
            <defs>
              <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF5A1F" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#FF6A00" stopOpacity={1} />
              </linearGradient>
              
              <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FF5A1F" stopOpacity={0} />
                <stop offset="30%" stopColor="#FF6A00" stopOpacity={0.8} />
                <stop offset="50%" stopColor="#F2F2F2" stopOpacity={1} />
                <stop offset="70%" stopColor="#FF6A00" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#FF5A1F" stopOpacity={0} />
              </linearGradient>
              
              <clipPath id="wordmarkClip">
                <rect id="clipRect" x="160" y="50" width="0" height="100" />
              </clipPath>
              
              <filter id="bloomFilter" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path id="loader-orbit-path" d="M 100,60 A 40,40 0 1,1 100,140 A 40,40 0 1,1 100,60 A 40,40 0 0,1 128.28,71.72" stroke="url(#orbitGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle id="loader-orbit-dot" cx="100" cy="60" r="4.5" fill="#FF5A1F" filter="url(#bloomFilter)" />
            <image id="loader-y-monogram" href="/logo_y_only.png" x="84" y="81" width="32" height="38" style={{ opacity: 0, filter: 'blur(8px)' }} />
            
            <g clipPath="url(#wordmarkClip)">
              <image id="loader-wordmark" href="/logo_dark_theme.png" x="160" y="78" width="220" height="44" style={{ opacity: 0 }} />
            </g>
            <rect id="loader-pulse-rect" x="-150" y="50" width="150" height="100" fill="url(#pulseGrad)" style={{ mixBlendMode: 'screen', pointerEvents: 'none', opacity: 0 }} />
          </svg>
        </div>
      </div>

      {/* Custom Cursors */}
      <div className="custom-cursor-dot" id="cursor-dot"></div>
      <div className="custom-cursor-ring" id="cursor-ring"></div>

      {/* Mouse Glow Overlay */}
      <div className="mouse-glow" id="mouse-glow"></div>

      {/* Shared Navbar */}
      <nav className="navbar magnetic-wrap">
        <a href="/" onClick={(e) => handleLinkClick(e, '/')} className="navbar__logo magnetic">
          <svg className="logo-orbit-svg" viewBox="0 0 32 32">
            <circle className="logo-orbit-svg__ring" cx="16" cy="16" r="12" />
            <g className="logo-orbit-svg__rotator">
              <circle cx="24.48" cy="7.52" r="1.8" fill="#FF5A1F" />
            </g>
            <image href="/logo_y_only.png" x="10" y="8.75" width="12" height="14.5" />
          </svg>
          <img src="/logo_dark_theme.png" alt="YAWMATIC" className="logo-wordmark-img" />
        </a>
        <ul className="navbar__menu">
          <li><a href="/" onClick={(e) => handleLinkClick(e, '/')} className={getLinkClass('/')}>Home</a></li>
          <li><a href="/about" onClick={(e) => handleLinkClick(e, '/about')} className={getLinkClass('/about')}>About</a></li>
          <li><a href="/services" onClick={(e) => handleLinkClick(e, '/services')} className={getLinkClass('/services')}>Services</a></li>
          <li><a href="/work" onClick={(e) => handleLinkClick(e, '/work')} className={getLinkClass('/work')}>Work</a></li>
          <li><a href="/process" onClick={(e) => handleLinkClick(e, '/process')} className={getLinkClass('/process')}>Process</a></li>
          <li><a href="/creators" onClick={(e) => handleLinkClick(e, '/creators')} className={getLinkClass('/creators')}>Creators</a></li>
        </ul>
        <div className="magnetic-wrap navbar__cta">
          <a href="/contact" onClick={(e) => handleLinkClick(e, '/contact')} className={getContactBtnClass()}>Let's Talk →</a>
        </div>
      </nav>

      {/* Page Content */}
      {children}

      {/* Shared Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer__logo-col">
            <a href="/" onClick={(e) => handleLinkClick(e, '/')} className="footer__logo magnetic">
              <svg className="logo-orbit-svg" viewBox="0 0 32 32" style={{ width: '50px', height: '50px' }}>
                <circle className="logo-orbit-svg__ring" cx="16" cy="16" r="12" />
                <g className="logo-orbit-svg__rotator">
                  <circle cx="24.48" cy="7.52" r="1.8" fill="#FF5A1F" />
                </g>
                <image href="/logo_y_only.png" x="10" y="8.75" width="12" height="14.5" />
              </svg>
              <img src="/logo_dark_theme.png" alt="YAWMATIC" className="logo-wordmark-img" />
            </a>
            <div className="footer__tagline">THINK FUTURE. BUILD DIFFERENT.</div>
          </div>

          <div className="footer__nav-col">
            <ul className="footer__menu">
              <li><a href="/" onClick={(e) => handleLinkClick(e, '/')} className="footer__link magnetic">Home</a></li>
              <li><a href="/about" onClick={(e) => handleLinkClick(e, '/about')} className="footer__link magnetic">About</a></li>
              <li><a href="/services" onClick={(e) => handleLinkClick(e, '/services')} className="footer__link magnetic">Services</a></li>
              <li><a href="/work" onClick={(e) => handleLinkClick(e, '/work')} className="footer__link magnetic">Work</a></li>
              <li><a href="/process" onClick={(e) => handleLinkClick(e, '/process')} className="footer__link magnetic">Process</a></li>
              <li><a href="/creators" onClick={(e) => handleLinkClick(e, '/creators')} className="footer__link magnetic">Creators</a></li>
            </ul>
          </div>

          <div className="footer__socials-col">
            <a href="https://www.instagram.com/yawmatic?igsh=YjJvcW8xY3dzejFq" target="_blank" rel="noopener noreferrer" className="footer__social-btn magnetic" aria-label="Instagram">
              <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204 0.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
            </a>
            <a href="#" className="footer__social-btn magnetic" aria-label="YouTube">
              <svg viewBox="0 0 24 24"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11C4.483 20.455 12 20.455 12 20.455s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
            </a>
            <a href="#" className="footer__social-btn magnetic" aria-label="Discord">
              <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer__copy">© 2026 YAWMATIC. All rights reserved.</div>
          <div className="footer__credit">THINK FUTURE. BUILD DIFFERENT.</div>
        </div>
      </footer>
    </>
  )
}
