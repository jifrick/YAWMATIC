import React, { useState, useEffect } from 'react'

// Layout Component
import Layout from './components/Layout'

// Page Components
import Home from './pages/Home'
import About from './pages/About'
import Services from './pages/Services'
import Work from './pages/Work'
import Process from './pages/Process'
import Contact from './pages/Contact'
import CreatorsHub from './pages/CreatorsHub'
import BrowseCreators from './pages/BrowseCreators'
import CreatorsCategory from './pages/CreatorsCategory'
import CreatorsProfile from './pages/CreatorsProfile'
import CreatorsApply from './pages/CreatorsApply'
import AdminDashboard from './pages/AdminDashboard'

// Custom Navigation Helper
export function navigateTo(href: string) {
  // Trigger transition out first, then resolve route
  const loader = document.getElementById('page-loader')
  const win = window as any
  if (loader && win.gsap) {
    loader.style.display = 'flex'
    win.gsap.set(loader, { 
      opacity: 0, 
      y: 100, 
      filter: 'blur(10px)',
      backgroundColor: '#090909'
    })
    win.gsap.to(loader, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => {
        window.history.pushState(null, '', href)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    })
  } else {
    window.history.pushState(null, '', href)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname)

  // ── Initial page load: remove body.loading after React mounts ──────────
  useEffect(() => {
    const win = window as any
    const loader = document.getElementById('page-loader')
    const loaderLogo = document.getElementById('loader-logo-svg')

    // If main.js already ran triggerSiteTransition (loader hidden), do nothing
    if (loader && loader.style.display === 'none') return

    // Remove body.loading so the page content is no longer hidden by CSS
    document.body.classList.remove('loading')

    if (loader && win.gsap) {
      // Slide loader out
      win.gsap.timeline({
        onComplete: () => {
          loader.style.display = 'none'
          if (loaderLogo) loaderLogo.style.opacity = '0'
          // Reveal any items already in viewport
          document.querySelectorAll('.reveal-item').forEach((item: Element) => {
            const rect = (item as HTMLElement).getBoundingClientRect()
            if (rect.top < window.innerHeight * 0.95) {
              win.gsap.to(item, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                ease: 'power3.out',
                clearProps: 'transform',
                overwrite: 'auto'
              })
            }
          })
        }
      })
      .to(loader, {
        opacity: 0,
        y: -60,
        filter: 'blur(8px)',
        duration: 0.55,
        ease: 'power2.inOut',
        delay: 0.1
      })
    } else if (loader) {
      loader.style.display = 'none'
      document.querySelectorAll('.reveal-item').forEach((item: Element) => {
        ;(item as HTMLElement).style.opacity = '1'
      })
    }
  }, []) // runs once on mount

  // ── Route change transition ──────────────────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
      
      // Trigger slide-in transition after route changes
      const loader = document.getElementById('page-loader')
      const loaderLogo = document.getElementById('loader-logo-svg')
      const win = window as any
      
      if (loader && win.gsap) {
        // Run slide-out transition
        document.body.classList.remove('loading')
        
        win.gsap.timeline({
          onComplete: () => {
            loader.style.display = 'none'
            if (loaderLogo) loaderLogo.style.opacity = '0'
            if (typeof win.ScrollTrigger !== 'undefined') {
              win.ScrollTrigger.refresh()
            }
          }
        })
        .set(loader, { backgroundColor: '#090909', opacity: 1, y: 0 })
        .to('#page-loader .loader__grain, #page-loader .loader__glow, #page-loader #loader-particles-canvas', {
          opacity: 0,
          duration: 0.45,
          ease: 'power2.inOut'
        }, 0)
        .to(loader, {
          y: -100,
          opacity: 0,
          filter: 'blur(10px)',
          duration: 0.45,
          ease: 'power2.inOut'
        }, 0)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Resolve Route component
  const renderRoute = () => {
    let path = currentPath
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1)
    }

    if (path === '/' || path === '/index.html') return <Home />
    if (path === '/about') return <About />
    if (path === '/services') return <Services />
    if (path === '/work') return <Work />
    if (path === '/process') return <Process />
    if (path === '/contact') return <Contact />
    if (path === '/creators') return <CreatorsHub />
    if (path === '/creators/browse') return <BrowseCreators />
    if (path === '/creators/apply') return <CreatorsApply />

    if (path.startsWith('/creators/')) {
      const slug = path.substring(10)
      const categories = [
        'photography', 'videography', 'drone-operator', 'video-editor', 'motion-designer',
        'graphic-designer', 'brand-designer', 'ui-ux-designer', 'web-designer', '3d-artist',
        'content-creator', 'social-media-manager', 'copywriter', 'ai-creative-specialist'
      ]
      if (categories.includes(slug)) {
        return <CreatorsCategory categorySlug={slug} />
      } else {
        return <CreatorsProfile profileSlug={slug} />
      }
    }

    if (path.startsWith('/admin')) {
      return <AdminDashboard />
    }

    return (
      <div style={{ textAlign: 'center', padding: '160px 20px', minHeight: '100vh' }}>
        <h1 className="heading-large">404</h1>
        <p style={{ color: 'var(--mist)' }}>The requested creative page does not exist.</p>
        <button onClick={() => navigateTo('/')} className="btn btn--primary" style={{ marginTop: '20px', marginInline: 'auto' }}>
          Return Home
        </button>
      </div>
    )
  }

  return (
    <Layout currentPath={currentPath}>
      {renderRoute()}
    </Layout>
  )
}
