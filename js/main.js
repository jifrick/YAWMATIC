// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

/* ----------------------------------------------------
   GLOBAL STATE & DETECTION
   ---------------------------------------------------- */
const isMobile = window.innerWidth <= 768;

/* ----------------------------------------------------
   ACTIVE PAGE HIGH LIGHTING
   ---------------------------------------------------- */
function highlightActiveLink() {
  let path = window.location.pathname;
  
  // Clean URL: if pathname ends with .html, replace it in the browser history
  const htmlToClean = {
    '/index.html': '/',
    '/about.html': '/about',
    '/services.html': '/services',
    '/work.html': '/work',
    '/process.html': '/process',
    '/contact.html': '/contact'
  };

  for (const [htmlFile, cleanRoute] of Object.entries(htmlToClean)) {
    if (path === htmlFile || path.endsWith(htmlFile)) {
      window.history.replaceState(null, '', cleanRoute);
      path = cleanRoute;
      break;
    }
  }

  // Normalize path for comparison (handling default root / empty path)
  if (path === '' || path === '/index.html') path = '/';
  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

  const menuLinks = document.querySelectorAll('.navbar__link');
  menuLinks.forEach(link => {
    let href = link.getAttribute('href');
    if (href === '') href = '/';
    
    if (href === path) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Highlight contact button if on contact page
  const contactBtn = document.querySelector('.navbar .btn');
  if (contactBtn) {
    let href = contactBtn.getAttribute('href');
    if (href === '') href = '/';
    
    if (href === path) {
      contactBtn.classList.remove('btn--ghost');
      contactBtn.classList.add('btn--primary');
    } else {
      contactBtn.classList.remove('btn--primary');
      contactBtn.classList.add('btn--ghost');
    }
  }
}

/* ----------------------------------------------------
   SMOOTH PAGE TRANSITIONS
   ---------------------------------------------------- */
function pageTransition(url) {
  const loader = document.getElementById('page-loader');
  const loaderLogo = document.getElementById('loader-logo-svg');
  
  if (loader) {
    loader.style.display = 'flex';
    if (loaderLogo) loaderLogo.style.opacity = '0';
    
    gsap.set(loader, { 
      opacity: 0, 
      y: 100, 
      filter: 'blur(10px)',
      backgroundColor: '#090909'
    });
    gsap.set('#page-loader .loader__grain, #page-loader .loader__glow, #page-loader #loader-particles-canvas', {
      clearProps: 'opacity'
    });
    
    gsap.to(loader, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => {
        window.location.href = url;
      }
    });
  } else {
    window.location.href = url;
  }
}

// Global page transitions setup
document.addEventListener('click', (e) => {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  
  const href = anchor.getAttribute('href');
  if (!href) return;

  // Mapping clean URLs to actual .html files under the hood
  const routes = {
    '/': '/index.html',
    '/about': '/about.html',
    '/services': '/services.html',
    '/work': '/work.html',
    '/process': '/process.html',
    '/contact': '/contact.html'
  };

  // Intercept clicks on internal clean routes or .html files
  if (!href.startsWith('#') && 
      !href.startsWith('mailto:') && 
      !href.startsWith('tel:') && 
      anchor.target !== '_blank' && 
      !href.startsWith('http')) {
        
    if (routes.hasOwnProperty(href)) {
      e.preventDefault();
      pageTransition(routes[href]);
    } else if (href.includes('.html')) {
      e.preventDefault();
      pageTransition(href);
    }
  }
});

/* ----------------------------------------------------
   SMOOTH SCROLLING (Lenis)
   ---------------------------------------------------- */
let lenis;
if (!isMobile) {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  // Connect Lenis to ScrollTrigger (GSAP Ticker loop handles raf, no double RAF)
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
}

// Clean up hash scroll behavior (if still used on a page)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      
      let scrollToTarget = target;
      let useOffset = -100;
      
      // Hero section does not need navbar offset
      if (targetId === '#hero') {
        useOffset = 0;
      }
      
      if (typeof ScrollTrigger !== 'undefined') {
        const st = ScrollTrigger.getAll().find(s => s.trigger === target || s.pin === target);
        if (st) {
          scrollToTarget = st.start;
          if (st.pin) {
            useOffset = 0;
          } else {
            scrollToTarget += useOffset;
            useOffset = 0; 
          }
        }
      }

      if (lenis) {
        lenis.scrollTo(scrollToTarget, { offset: useOffset });
      } else {
        let targetScrollY;
        if (typeof scrollToTarget === 'number') {
          targetScrollY = scrollToTarget;
        } else {
          const elementPosition = target.getBoundingClientRect().top + window.scrollY;
          targetScrollY = elementPosition + useOffset;
        }
        window.scrollTo({
          top: targetScrollY,
          behavior: 'smooth'
        });
      }
    }
  });
});

/* ----------------------------------------------------
   LOADER PARTICLES SIMULATION
   ---------------------------------------------------- */
let loaderParticles = [];
let loaderCanvas, loaderCtx, loaderAnimationId;

function initLoaderParticles() {
  loaderCanvas = document.getElementById('loader-particles-canvas');
  if (!loaderCanvas) return;
  
  loaderCtx = loaderCanvas.getContext('2d');
  resizeLoaderCanvas();
  window.addEventListener('resize', resizeLoaderCanvas);

  const particleCount = 25;
  loaderParticles = [];
  for (let i = 0; i < particleCount; i++) {
    loaderParticles.push({
      x: Math.random() * loaderCanvas.width,
      y: Math.random() * loaderCanvas.height,
      radius: 1 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      opacity: 0.1 + Math.random() * 0.25
    });
  }

  animateLoaderParticles();
}

function resizeLoaderCanvas() {
  if (loaderCanvas) {
    loaderCanvas.width = window.innerWidth;
    loaderCanvas.height = window.innerHeight;
  }
}

function animateLoaderParticles() {
  if (!loaderCanvas || !loaderCtx) return;
  loaderCtx.clearRect(0, 0, loaderCanvas.width, loaderCanvas.height);
  
  loaderParticles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0 || p.x > loaderCanvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > loaderCanvas.height) p.vy *= -1;

    loaderCtx.beginPath();
    loaderCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    loaderCtx.fillStyle = `rgba(255, 90, 31, ${p.opacity})`;
    loaderCtx.shadowBlur = 4;
    loaderCtx.shadowColor = '#FF5A1F';
    loaderCtx.fill();
  });

  loaderCtx.shadowBlur = 0;
  loaderAnimationId = requestAnimationFrame(animateLoaderParticles);
}

function stopLoaderParticles() {
  window.removeEventListener('resize', resizeLoaderCanvas);
  if (loaderAnimationId) {
    cancelAnimationFrame(loaderAnimationId);
  }
}

/* ----------------------------------------------------
   PAGE LOADER / INITIALIZER & SITE ENTRANCE
   ---------------------------------------------------- */
let pageLoaded = false;
let loaderTimelineComplete = false;

document.addEventListener('DOMContentLoaded', () => {
  const navLogo = document.querySelector('.navbar__logo');
  if (navLogo) {
    gsap.set(navLogo, { opacity: 0 });
  }
  initLoaderParticles();
  runLoaderTimeline();
});

// Fallback logic
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  const navLogo = document.querySelector('.navbar__logo');
  if (navLogo && navLogo.style.opacity !== '0') {
    gsap.set(navLogo, { opacity: 0 });
    initLoaderParticles();
    runLoaderTimeline();
  }
}

window.addEventListener('load', () => {
  pageLoaded = true;
  // Initialize Three.js WebGL hero scene if canvas exists on load
  if (document.getElementById('webgl-cube-canvas')) {
    initHeroWebGL();
  }
  if (loaderTimelineComplete) {
    triggerSiteTransition();
  }
});

let loaderTl;

function runLoaderTimeline() {
  const path = document.getElementById('loader-orbit-path');
  const dot = document.getElementById('loader-orbit-dot');
  const monogram = document.getElementById('loader-y-monogram');
  const clipRect = document.getElementById('clipRect');
  const pulse = document.getElementById('loader-pulse-rect');
  const wordmark = document.getElementById('loader-wordmark');
  
  if (!path || !dot) return;

  const pathLength = path.getTotalLength();
  
  gsap.set(path, { strokeDasharray: pathLength, strokeDashoffset: pathLength });
  gsap.set(dot, { opacity: 0 });
  gsap.set(monogram, { 
    opacity: 0, 
    scale: 0.7, 
    transformOrigin: "50% 50%", 
    filter: 'blur(8px)' 
  });
  if (wordmark) {
    gsap.set(wordmark, { opacity: 0 });
  }
  gsap.set(clipRect, { attr: { width: 0 } });
  gsap.set(pulse, { opacity: 0, x: -150 });

  loaderTl = gsap.timeline({
    onComplete: () => {
      loaderTimelineComplete = true;
      if (pageLoaded) {
        triggerSiteTransition();
      }
    }
  });

  // Step 1: Orange dot appears
  loaderTl.set(dot, { opacity: 1 }, 0.5);
  
  // Step 2 & 3: Orbit starts drawing progressively (0.5s to 2.3s)
  loaderTl.to(path, {
    strokeDashoffset: 0,
    duration: 1.8,
    ease: 'power3.inOut'
  }, 0.5);

  loaderTl.to({ val: 0 }, {
    val: 1,
    duration: 1.8,
    ease: 'power3.inOut',
    onUpdate: function() {
      const progress = this.targets()[0].val;
      const point = path.getPointAtLength(progress * pathLength);
      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);
    }
  }, 0.5);

  // Step 4: Y monogram fades into center (1.2s to 2.2s) while orbit is completing
  loaderTl.to(monogram, {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    duration: 1.0,
    ease: 'power2.out'
  }, 1.2);

  // Step 7: Staged wordmark reveal (only after orbit completes at 2.3s)
  if (wordmark) {
    loaderTl.set(wordmark, { opacity: 1 }, 2.3);
  }

  // Phase 1: Reveal "YAW" (width from 0 to 90)
  loaderTl.to(clipRect, {
    attr: { width: 90 },
    duration: 0.6,
    ease: 'power3.out'
  }, 2.3);

  // Phase 2: Reveal "MATIC" (width from 90 to 230)
  loaderTl.to(clipRect, {
    attr: { width: 230 },
    duration: 0.7,
    ease: 'power2.out'
  }, 2.9);

  // Step 5: Energy pulse travels across the logo (2.5s to 3.5s)
  loaderTl.to(pulse, {
    x: 420,
    opacity: 0.6,
    duration: 1.0,
    ease: 'power2.inOut'
  }, 2.5);

  loaderTl.to(pulse, {
    opacity: 0,
    duration: 0.4,
    ease: 'power2.out'
  }, 3.1);
}

function triggerSiteTransition() {
  document.body.classList.remove('loading');
  stopLoaderParticles();
  highlightActiveLink();
  
  const loader = document.getElementById('page-loader');
  const loaderLogo = document.getElementById('loader-logo-svg');
  const navLogo = document.querySelector('.navbar__logo');
  const navbar = document.querySelector('.navbar');
  
  if (!loader) return;

  const transitionTl = gsap.timeline({
    onComplete: () => {
      if (navLogo) gsap.set(navLogo, { opacity: 1 });
      if (loaderLogo) loaderLogo.style.opacity = '0';
      loader.style.display = 'none';
      loader.style.backgroundColor = '';
      
      ScrollTrigger.refresh();
      setTimeout(() => ScrollTrigger.refresh(), 100);
    }
  });

  gsap.set(navbar, { opacity: 1, y: 0 });
  if (navLogo) gsap.set(navLogo, { opacity: 0 });

  if (loaderLogo && navLogo) {
    const loaderRect = loaderLogo.getBoundingClientRect();
    const navRect = navLogo.getBoundingClientRect();
    
    const scale = navRect.height / loaderRect.height;
    const loaderCenterX = loaderRect.left + loaderRect.width / 2;
    const loaderCenterY = loaderRect.top + loaderRect.height / 2;
    const navCenterX = navRect.left + navRect.width / 2;
    const navCenterY = navRect.top + navRect.height / 2;
    
    const deltaX = navCenterX - loaderCenterX;
    const deltaY = navCenterY - loaderCenterY;

    // Move logo to its navbar position
    transitionTl.to(loaderLogo, {
      x: deltaX,
      y: deltaY,
      duration: 0.85,
      ease: 'power3.inOut'
    }, 0);

    // Smoothly scale down during flight and expand back to final size upon placing
    transitionTl.to(loaderLogo, {
      keyframes: [
        { scale: scale * 0.5, duration: 0.4, ease: 'power2.inOut' },
        { scale: scale, duration: 0.45, ease: 'back.out(1.5)' }
      ]
    }, 0);
  }

  // Fade out loader visual overlays (grain, glow, particles)
  transitionTl.to('#page-loader .loader__grain, #page-loader .loader__glow, #page-loader #loader-particles-canvas', {
    opacity: 0,
    duration: 0.65,
    ease: 'power2.inOut'
  }, 0.1);

  // Dissolve the loader background color to transparent to keep the logo visible during flight
  transitionTl.to(loader, {
    backgroundColor: 'rgba(9, 9, 9, 0)',
    duration: 0.75,
    ease: 'power3.inOut'
  }, 0.1);

  transitionTl.from('.navbar__menu li, .navbar .btn', {
    opacity: 0,
    y: -15,
    stagger: 0.04,
    duration: 0.6,
    ease: 'power3.out'
  }, 0.35);

  if (document.querySelector('.hero__headline')) {
    transitionTl.from('.hero__headline', {
      opacity: 0,
      y: 40,
      duration: 0.8,
      ease: 'power4.out'
    }, 0.25);

    transitionTl.from('.hero__subtext', {
      opacity: 0,
      y: 20,
      duration: 0.7,
      ease: 'power3.out'
    }, 0.35);

    transitionTl.from('.hero__ctas', {
      opacity: 0,
      y: 15,
      duration: 0.6,
      ease: 'power3.out'
    }, 0.45);

    transitionTl.from('.hero__webgl-container, .hero__orbit-overlay', {
      opacity: 0,
      scale: 0.95,
      duration: 1.0,
      ease: 'power2.out'
    }, 0.1);
  }

  const activeSection = document.querySelector('section, .featured-work-container');
  if (activeSection && activeSection.id !== 'hero') {
    transitionTl.from(activeSection, {
      opacity: 0,
      y: 35,
      duration: 0.8,
      ease: 'power3.out'
    }, 0.2);
  }

  if (document.getElementById('horizontal-scroll-container')) {
    initHorizontalScroll();
  }
  if (document.getElementById('about-webgl-canvas')) {
    initAboutWebGL();
  }
  if (document.querySelector('.timeline-container')) {
    initTimelineScroll();
  }
  if (document.querySelector('.stat-card')) {
    initStatsCounter();
  }
}

/* ----------------------------------------------------
   CUSTOM CURSOR
   ---------------------------------------------------- */
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');
let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

if (!isMobile && cursorDot && cursorRing) {
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    // Custom cursor tracking
    cursorDot.style.left = mouseX + 'px';
    cursorDot.style.top = mouseY + 'px';
  });

  // Lerp ring loop
  function updateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    
    cursorRing.style.left = ringX + 'px';
    cursorRing.style.top = ringY + 'px';
    
    requestAnimationFrame(updateRing);
  }
  requestAnimationFrame(updateRing);

  // Hover cursor expansions
  const hoverables = document.querySelectorAll('a, button, .magnetic, .insta-card, .floating-card, .work-card, .capability-card, .vision-card');
  hoverables.forEach(item => {
    item.addEventListener('mouseenter', () => {
      cursorRing.style.width = '60px';
      cursorRing.style.height = '60px';
      cursorRing.style.borderColor = 'rgba(255, 90, 31, 0.8)';
      cursorDot.style.width = '12px';
      cursorDot.style.height = '12px';
      cursorDot.style.backgroundColor = '#FFFFFF';
    });
    item.addEventListener('mouseleave', () => {
      cursorRing.style.width = '40px';
      cursorRing.style.height = '40px';
      cursorRing.style.borderColor = 'var(--fire)';
      cursorDot.style.width = '8px';
      cursorDot.style.height = '8px';
      cursorDot.style.backgroundColor = 'var(--fire)';
    });
  });
} else {
  // Hide cursors on mobile or if missing
  if (cursorDot) cursorDot.style.display = 'none';
  if (cursorRing) cursorRing.style.display = 'none';
}

/* ----------------------------------------------------
   MOUSE GLOW SYSTEM
   ---------------------------------------------------- */
const mouseGlow = document.getElementById('mouse-glow');
if (mouseGlow) {
  window.addEventListener('mousemove', (e) => {
    // Smoothly place the light circle overlay centered under the mouse
    gsap.to(mouseGlow, {
      left: e.clientX,
      top: e.clientY,
      duration: 0.5,
      ease: 'power2.out'
    });
  });
}

/* ----------------------------------------------------
   MAGNETIC BUTTONS & NAVIGATION
   ---------------------------------------------------- */
const magneticElements = document.querySelectorAll('.magnetic');
if (magneticElements.length > 0) {
  magneticElements.forEach(elem => {
    elem.addEventListener('mousemove', (e) => {
      const rect = elem.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      gsap.to(elem, {
        x: x * 0.35,
        y: y * 0.35,
        duration: 0.3,
        ease: 'power2.out'
      });
      
      if (!isMobile && cursorRing) {
        gsap.to(cursorRing, {
          width: rect.width + 16,
          height: rect.height + 16,
          left: rect.left + rect.width / 2,
          top: rect.top + rect.height / 2,
          duration: 0.15,
          overwrite: 'auto'
        });
      }
    });

    elem.addEventListener('mouseleave', () => {
      gsap.to(elem, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'elastic.out(1, 0.3)'
      });
      
      if (!isMobile && cursorRing) {
        gsap.to(cursorRing, {
          width: 40,
          height: 40,
          duration: 0.2
        });
      }
    });
  });
}

/* ----------------------------------------------------
   SCROLL REVEAL (FADE + TRANSLATEY)
   ---------------------------------------------------- */
const revealItems = document.querySelectorAll('.reveal-item');
if (revealItems.length > 0) {
  gsap.set(revealItems, { y: 40 });
  
  revealItems.forEach(item => {
    gsap.to(item, {
      scrollTrigger: {
        trigger: item,
        start: 'top 85%',
        toggleActions: 'play none none none'
      },
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      clearProps: 'transform'
    });
  });
}

/* ----------------------------------------------------
   INITIAL ENTER ANIMATIONS
   ---------------------------------------------------- */
function initEnterAnimations() {
  // Navbar slide-down
  gsap.from('.navbar', {
    y: -50,
    opacity: 0,
    duration: 1,
    ease: 'power3.out'
  });

  // Hero Content items reveal (if present)
  if (document.querySelector('.hero__headline')) {
    gsap.from('.hero__headline', {
      opacity: 0,
      y: 50,
      duration: 1.2,
      ease: 'power4.out',
      delay: 0.2
    });

    gsap.from('.hero__subtext', {
      opacity: 0,
      y: 30,
      duration: 1,
      ease: 'power3.out',
      delay: 0.4
    });

    gsap.from('.hero__ctas', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      ease: 'power3.out',
      delay: 0.6
    });
  }
}

/* ----------------------------------------------------
   3D TILT EFFECT (MANUAL TRANSFORM FOR PERFORMANCE)
   ---------------------------------------------------- */
const tiltCards = document.querySelectorAll('.vision-card, .capability-card');
if (tiltCards.length > 0) {
  tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const mouseXInCard = e.clientX - rect.left;
      const mouseYInCard = e.clientY - rect.top;
      
      const xOffset = (mouseXInCard / rect.width) - 0.5;
      const yOffset = (mouseYInCard / rect.height) - 0.5;
      
      const tiltX = -yOffset * 15;
      const tiltY = xOffset * 15;
      
      gsap.to(card, {
        rotateX: tiltX,
        rotateY: tiltY,
        transformPerspective: 1000,
        scale: 1.02,
        duration: 0.2,
        ease: 'power2.out'
      });
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        duration: 0.5,
        ease: 'power2.out'
      });
    });
  });
}

/* ----------------------------------------------------
   01. HERO THREE.JS SCENE CREATION
   ---------------------------------------------------- */
let heroRenderer, heroScene, heroCamera;
let cubeParentGroup, cubeGroup;
let torus1, torusMat1, torus2, torusMat2, orbitParticles = [];
const settleRotateSpeed = { value: 0 };
const scrollOrbitSpeed = { value: 0 };
const scrollEmissive = { value: 0.0 };
let innerCoreLight;
let yCoreGroup, goldCoreLight;

function initHeroWebGL() {
  const container = document.getElementById('hero');
  const canvas = document.getElementById('webgl-cube-canvas');
  if (!canvas || !container) return;

  let heroTl;

  // Renderer
  heroRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  heroRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  heroRenderer.shadowMap.enabled = true;
  heroRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene
  heroScene = new THREE.Scene();

  // Camera
  const initialIsMob = window.innerWidth <= 768;
  const initialCamX = initialIsMob ? 0 : -3.0;
  heroCamera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  heroCamera.position.set(initialCamX, 0.3, 8.5);
  heroCamera.lookAt(initialCamX, 0.3, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.06);
  heroScene.add(ambientLight);

  const topKeyLight = new THREE.DirectionalLight(0xc8d0dc, 0.5);
  topKeyLight.position.set(2, 6, 4);
  heroScene.add(topKeyLight);

  innerCoreLight = new THREE.PointLight(0xff6a00, 0.0, 2.8);
  innerCoreLight.position.set(0, 0, 0);
  heroScene.add(innerCoreLight);

  // Cube Groups
  cubeParentGroup = new THREE.Group();
  cubeGroup = new THREE.Group();
  cubeParentGroup.add(cubeGroup);
  heroScene.add(cubeParentGroup);

  cubeParentGroup.rotation.x = Math.PI * 0.18;
  cubeParentGroup.rotation.y = -Math.PI * 0.22;

  function makeCubieMat(isCorner, isEdge, isCenter) {
    const col = isCenter ? 0x181210 : (isEdge ? 0x111111 : 0x0f0f10);
    return new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.82,
      metalness: 0.12,
      emissive: 0xff5a1f,
      emissiveIntensity: isCenter ? 0.005 : 0.0,
      envMapIntensity: 0.15
    });
  }

  function makeEdgeMat(isCorner, isEdge, isCenter) {
    const opacity = isCenter ? 0.95 : isEdge ? 0.88 : 0.72;
    return new THREE.LineBasicMaterial({
      color: 0xff6a00,
      transparent: true,
      opacity: opacity
    });
  }

  function createYCoreSymbol() {
    const group = new THREE.Group();

    const yMat = new THREE.MeshStandardMaterial({
      color:              0xffb84d,
      emissive:           0xffd66b,
      emissiveIntensity:  1.2,
      roughness:          0.18,
      metalness:          0.82
    });

    const strutMat = new THREE.MeshStandardMaterial({
      color:              0x121213,
      roughness:          0.85,
      metalness:          0.15
    });

    const cageGeo = new THREE.OctahedronGeometry(0.42, 0);
    const cageEdges = new THREE.EdgesGeometry(cageGeo);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0x333335,
      transparent: true,
      opacity: 0.7
    });
    const cage = new THREE.LineSegments(cageEdges, cageMat);
    group.add(cage);

    const st = 0.025;
    const sl = 0.375;

    const strutXGeo = new THREE.BoxGeometry(sl, st, st);
    const strutX1 = new THREE.Mesh(strutXGeo, strutMat);
    strutX1.position.set(sl/2, 0, 0);
    const strutX2 = new THREE.Mesh(strutXGeo, strutMat);
    strutX2.position.set(-sl/2, 0, 0);
    group.add(strutX1);
    group.add(strutX2);

    const strutYGeo = new THREE.BoxGeometry(st, sl, st);
    const strutY1 = new THREE.Mesh(strutYGeo, strutMat);
    strutY1.position.set(0, sl/2, 0);
    const strutY2 = new THREE.Mesh(strutYGeo, strutMat);
    strutY2.position.set(0, -sl/2, 0);
    group.add(strutY1);
    group.add(strutY2);

    const strutZGeo = new THREE.BoxGeometry(st, st, sl);
    const strutZ1 = new THREE.Mesh(strutZGeo, strutMat);
    strutZ1.position.set(0, 0, sl/2);
    const strutZ2 = new THREE.Mesh(strutZGeo, strutMat);
    strutZ2.position.set(0, 0, -sl/2);
    group.add(strutZ1);
    group.add(strutZ2);

    const glyphGroup = new THREE.Group();
    glyphGroup.position.set(0, 0, 0.18);
    group.add(glyphGroup);

    const sw    = 0.13;
    const sd    = 0.13;
    const armL  = 0.35;
    const stemL = 0.33;
    const angle = Math.PI / 4;

    const stemGeo = new THREE.BoxGeometry(sw, stemL, sd);
    const stem    = new THREE.Mesh(stemGeo, yMat);
    stem.position.set(0, -(stemL / 2) - 0.006, 0);
    glyphGroup.add(stem);

    const armGeo = new THREE.BoxGeometry(sw, armL, sd);
    const offX   = (armL / 2) * Math.sin(angle);
    const offY   = (armL / 2) * Math.cos(angle);

    const leftArm = new THREE.Mesh(armGeo, yMat.clone());
    leftArm.position.set(-offX, offY + 0.006, 0);
    leftArm.rotation.z = angle;
    glyphGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, yMat.clone());
    rightArm.position.set(offX, offY + 0.006, 0);
    rightArm.rotation.z = -angle;
    glyphGroup.add(rightArm);

    const nodeGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({
      color:              0xffd66b,
      emissive:           0xff9a1f,
      emissiveIntensity:  1.5,
      roughness:          0.1,
      metalness:          0.9
    });
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.set(0, 0, 0);
    glyphGroup.add(node);

    goldCoreLight = new THREE.PointLight(0xffb84d, 1.2, 3.0);
    goldCoreLight.position.set(0, 0, 0);
    glyphGroup.add(goldCoreLight);

    const haloGeo = new THREE.SphereGeometry(0.20, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color:       0xff9a1f,
      transparent: true,
      opacity:     0.08
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    glyphGroup.add(halo);
    group.userData.haloMat = haloMat;

    return group;
  }

  const CUBIE_SIZE  = 0.75;
  const CUBIE_GAP   = 0.035;
  const CUBIE_STEP  = CUBIE_SIZE + CUBIE_GAP;
  const gridPos     = [-CUBIE_STEP, 0, CUBIE_STEP];

  const subCubeGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
  const edgesGeometry   = new THREE.EdgesGeometry(subCubeGeometry);
  const subCubes = [];
  const MAX_DIST = CUBIE_STEP * Math.sqrt(3);

  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const cx = xi - 1, cy = yi - 1, cz = zi - 1;
        const axesOccupied = Math.abs(cx) + Math.abs(cy) + Math.abs(cz);
        const isCenter = axesOccupied === 0;
        const isFace   = axesOccupied === 1;
        const isMid    = axesOccupied === 2;
        const isCorner = axesOccupied === 3;
        const isEdge   = isFace;

        const pos = new THREE.Vector3(gridPos[xi], gridPos[yi], gridPos[zi]);

        if (isCenter) {
          yCoreGroup = createYCoreSymbol();
          yCoreGroup.position.set(0, 0, 0.18);
          cubeParentGroup.add(yCoreGroup);
          continue;
        }

        const mat  = makeCubieMat(isCorner, isEdge, false);
        const mesh = new THREE.Mesh(subCubeGeometry, mat);
        mesh.position.copy(pos);

        const openFactor = isFace ? 0.95 : isMid ? 1.45 : 2.10;
        const openPos = new THREE.Vector3(
          pos.x * (1.0 + openFactor),
          pos.y * (1.0 + openFactor),
          pos.z * (1.0 + openFactor)
        );

        mesh.userData = {
          originalPos: pos.clone(),
          openPos,
          isFace, isMid, isCorner,
          isEdge,
          dist: pos.length(),
          mat,
          cx, cy, cz
        };

        const edgeMat = makeEdgeMat(isCorner, isEdge, false);
        mesh.userData.edgeMat = edgeMat;
        const wireframe = new THREE.LineSegments(edgesGeometry, edgeMat);
        mesh.add(wireframe);

        cubeGroup.add(mesh);
        subCubes.push(mesh);
      }
    }
  }

  // Torus Orbits
  const torusGeo1 = new THREE.TorusGeometry(2.55, 0.005, 6, 96);
  torusMat1 = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.22 });
  torus1 = new THREE.Mesh(torusGeo1, torusMat1);
  torus1.rotation.set(Math.PI * 0.28, Math.PI * 0.08, 0);
  heroScene.add(torus1);

  const torusGeo2 = new THREE.TorusGeometry(2.0, 0.004, 6, 96);
  torusMat2 = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.15 });
  torus2 = new THREE.Mesh(torusGeo2, torusMat2);
  torus2.rotation.set(Math.PI * 0.55, Math.PI * 0.25, 0);
  heroScene.add(torus2);

  // Particles
  const pGeo   = new THREE.SphereGeometry(0.009, 5, 5);
  const pMat70 = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.45 });
  const pMat30 = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.35 });
  const particles = [];

  for (let i = 0; i < 40; i++) {
    const mat = i < 28 ? pMat70 : pMat30;
    const p   = new THREE.Mesh(pGeo, mat);

    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 2.8 + Math.random() * 2.7;
    p.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.0018,
        (Math.random() - 0.5) * 0.0018,
        (Math.random() - 0.5) * 0.0018
      ),
      boundR: r
    };
    heroScene.add(p);
    particles.push(p);
  }

  let mouseTargetX = 0, mouseTargetY = 0;
  container.addEventListener('mousemove', (e) => {
    const rect  = container.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width)  - 0.5;
    const normY = ((e.clientY - rect.top)  / rect.height) - 0.5;
    mouseTargetY = normX * 0.28;
    mouseTargetX = normY * 0.18;
  });

  const resizeHandler = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const isMob = window.innerWidth <= 768;
    const camX = isMob ? 0 : -3.0;
    heroCamera.position.x = camX;
    heroCamera.lookAt(camX, 0.3, 0);
    heroCamera.aspect = w / h;
    heroCamera.updateProjectionMatrix();
    heroRenderer.setSize(w, h);
  };
  window.addEventListener('resize', resizeHandler);

  function animateHeroScene() {
    if (document.hidden) { requestAnimationFrame(animateHeroScene); return; }

    const elapsed = Date.now() * 0.001;

    const floatTime = elapsed * (Math.PI * 2 / 4.5);
    cubeGroup.position.y = Math.sin(floatTime) * 0.022;

    cubeGroup.rotation.y += 0.0008 + settleRotateSpeed.value;

    cubeGroup.rotation.x += (mouseTargetX - cubeGroup.rotation.x) * 0.04;
    cubeGroup.rotation.y += (mouseTargetY - cubeGroup.rotation.y) * 0.04;

    const pulsePeriod = 8.0;
    const cycleT      = elapsed % pulsePeriod;
    const pulseEnv    = cycleT < 2.0 ? Math.sin((cycleT / 2.0) * Math.PI) : 0.0;
    const coreIntensity = scrollEmissive.value + pulseEnv * 0.07;

    subCubes.forEach(c => {
      c.userData.mat.emissiveIntensity = coreIntensity * 0.35;
      const edgeBase = c.userData.isEdge ? 0.88 : 0.72;
      c.userData.edgeMat.opacity = Math.min(1.0, edgeBase * (0.70 + coreIntensity * 3.5));
    });

    innerCoreLight.intensity = 0.22 + coreIntensity * 3.2;

    if (yCoreGroup) {
      yCoreGroup.position.y = cubeGroup.position.y;
      yCoreGroup.rotation.x += (mouseTargetX - yCoreGroup.rotation.x) * 0.04;
      yCoreGroup.rotation.y += (mouseTargetY + Math.PI * 0.22 - yCoreGroup.rotation.y) * 0.04;
      yCoreGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.04;

      const yEmissive = 1.20 + pulseEnv * 0.70 + scrollEmissive.value * 0.60;
      yCoreGroup.traverse(child => {
        if (child.isMesh && child.material && child.material.emissive) {
          child.material.emissiveIntensity = Math.min(2.2, yEmissive);
        }
      });

      if (yCoreGroup.userData.haloMat) {
        yCoreGroup.userData.haloMat.opacity = 0.05 + pulseEnv * 0.08 + scrollEmissive.value * 0.05;
      }
    }

    if (goldCoreLight) {
      goldCoreLight.intensity = 0.60 + pulseEnv * 1.50 + scrollEmissive.value * 0.90;
    }

    if (torus1) torus1.rotation.z += 0.0014 + scrollOrbitSpeed.value;
    if (torus2) torus2.rotation.z -= 0.0022 + scrollOrbitSpeed.value * 1.4;

    particles.forEach(p => {
      p.position.add(p.userData.vel);
      if (p.position.length() > p.userData.boundR + 1.2) {
        p.userData.vel.negate();
      }
    });

    heroRenderer.render(heroScene, heroCamera);
    requestAnimationFrame(animateHeroScene);
  }

  // GSAP SCROLL TIMELINE
  heroTl = gsap.timeline({
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: '+=200%',
      pin: true,
      scrub: 1.5
    }
  });

  heroTl
    .to(scrollEmissive, { value: 0.05, duration: 0.15, ease: 'power1.in' }, 0)
    .to(torusMat1,       { opacity: 0.30, duration: 0.15 }, 0)
    .to(torusMat2,       { opacity: 0.22, duration: 0.15 }, 0)
    .to('.floating-card', { opacity: 1, x: 0, stagger: 0.06, duration: 0.15, ease: 'power2.out' }, 0);

  subCubes.forEach(mesh => {
    if (mesh.userData.isCenter) return;
    const normDist = mesh.userData.dist / MAX_DIST;
    const delay    = 0.15 + (1.0 - normDist) * 0.10;

    heroTl.to(mesh.position, {
      x: mesh.userData.openPos.x,
      y: mesh.userData.openPos.y,
      z: mesh.userData.openPos.z,
      duration: 0.40,
      ease: 'power3.out'
    }, delay);
  });

  heroTl
    .to(scrollEmissive,  { value: 0.65, duration: 0.40, ease: 'power2.in'    }, 0.15)
    .to(innerCoreLight,  { distance: 4.5, duration: 0.40, ease: 'power2.out' }, 0.15);

  heroTl
    .to(scrollOrbitSpeed, { value: 0.025, duration: 0.15, ease: 'power1.inOut' }, 0.55)
    .to(torusMat1, { opacity: 0.55, duration: 0.15 }, 0.55)
    .to(torusMat2, { opacity: 0.42, duration: 0.15 }, 0.55);

  subCubes.forEach(mesh => {
    if (mesh.userData.isCenter) return;
    const normDist = mesh.userData.dist / MAX_DIST;
    const delay    = 0.70 + normDist * 0.08;

    heroTl.to(mesh.position, {
      x: mesh.userData.originalPos.x,
      y: mesh.userData.originalPos.y,
      z: mesh.userData.originalPos.z,
      duration: 0.30,
      ease: 'power2.inOut'
    }, delay);
  });

  heroTl
    .to(settleRotateSpeed, { value: 0.0012,  duration: 0.30, ease: 'power2.inOut' }, 0.70)
    .to(scrollOrbitSpeed,  { value: 0,        duration: 0.30, ease: 'power2.inOut' }, 0.70)
    .to(scrollEmissive,    { value: 0.04,     duration: 0.30, ease: 'power2.out'   }, 0.70)
    .to(innerCoreLight,    { distance: 2.8,   duration: 0.30, ease: 'power2.out'   }, 0.70)
    .to(torusMat1,         { opacity: 0.22,   duration: 0.30, ease: 'power2.inOut' }, 0.70)
    .to(torusMat2,         { opacity: 0.15,   duration: 0.30, ease: 'power2.inOut' }, 0.70);

  animateHeroScene();

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('resize', resizeHandler);
    if (heroRenderer) heroRenderer.dispose();
    ScrollTrigger.getAll().forEach(t => { if (t.vars.trigger === '#hero') t.kill(); });
  });
}

function createCircleParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(255, 106, 0, 1)');
  grad.addColorStop(0.2, 'rgba(255, 90, 31, 0.8)');
  grad.addColorStop(0.5, 'rgba(255, 90, 31, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  return new THREE.CanvasTexture(canvas);
}

/* ----------------------------------------------------
   03. ABOUT WORD-BY-WORD REVEAL ANIMATION
   ---------------------------------------------------- */
const splitTextContainer = document.getElementById('about-reveal-text');
if (splitTextContainer) {
  const words = splitTextContainer.innerText.split(' ');
  splitTextContainer.innerHTML = '';
  words.forEach((word) => {
    const span = document.createElement('span');
    span.innerText = word;
    
    if (word.toLowerCase().includes('digital') || word.toLowerCase().includes('experience')) {
      span.classList.add('orange');
    } else if (word.toLowerCase().includes('content') || word.toLowerCase().includes('systems')) {
      span.classList.add('mist');
    } else if (word.toLowerCase().includes('creative') || word.toLowerCase().includes('execution.')) {
      span.classList.add('orange');
    }
    
    splitTextContainer.appendChild(span);
    splitTextContainer.appendChild(document.createTextNode(' '));
  });

  const aboutSpans = document.querySelectorAll('#about-reveal-text span');
  if (aboutSpans.length > 0) {
    const scrollTl = gsap.timeline({
      scrollTrigger: {
        trigger: '#about-reveal-text',
        start: 'top 75%',
        end: 'bottom 45%',
        scrub: 0.2
      }
    });
    aboutSpans.forEach((span) => {
      scrollTl.to(span, {
        opacity: 1,
        duration: 0.1
      });
    });
  }
}

/* ----------------------------------------------------
   05. FEATURED WORK HORIZONTAL SCROLL SCENE
   ---------------------------------------------------- */
function initHorizontalScroll() {
  const container = document.getElementById('horizontal-scroll-container');
  if (!container) return;

  const existingTrigger = ScrollTrigger.getById('work-scroll-trigger');
  if (existingTrigger) {
    existingTrigger.kill(true);
  }

  gsap.to(container, {
    x: () => -(container.scrollWidth - window.innerWidth),
    ease: 'none',
    scrollTrigger: {
      id: 'work-scroll-trigger',
      trigger: '#work',
      start: 'top top',
      end: () => "+=" + (container.scrollWidth - window.innerWidth),
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      scrub: true,
      invalidateOnRefresh: true
    }
  });
}

/* ----------------------------------------------------
   06. PROCESS TIMELINE FILL & STEPS SYNC
   ---------------------------------------------------- */
function adjustTimelineLine() {
  const track = document.querySelector('.timeline-line-track');
  const markers = document.querySelectorAll('.timeline-step__marker');
  const timelineContainer = document.querySelector('.timeline-container');
  const timelineSteps = document.querySelectorAll('.timeline-step');
  if (!timelineContainer || !track || markers.length < 2 || timelineSteps.length < 2) return;

  const firstStep = timelineSteps[0];
  const lastStep = timelineSteps[timelineSteps.length - 1];
  const firstMarker = markers[0];
  const lastMarker = markers[markers.length - 1];

  const firstCenterY = firstStep.offsetTop + firstMarker.offsetTop + firstMarker.offsetHeight / 2;
  const lastCenterY = lastStep.offsetTop + lastMarker.offsetTop + lastMarker.offsetHeight / 2;

  track.style.top = `${firstCenterY}px`;
  track.style.height = `${lastCenterY - firstCenterY}px`;
}

function initTimelineScroll() {
  const timelineContainer = document.querySelector('.timeline-container');
  const timelineFill = document.getElementById('timeline-line-fill');
  const timelineSteps = document.querySelectorAll('.timeline-step');

  if (!timelineContainer || !timelineFill || timelineSteps.length === 0) return;

  adjustTimelineLine();

  gsap.to(timelineFill, {
    height: '100%',
    ease: 'none',
    scrollTrigger: {
      trigger: timelineContainer,
      start: () => {
        const firstStep = timelineSteps[0];
        const firstMarker = firstStep ? firstStep.querySelector('.timeline-step__marker') : null;
        if (firstStep && firstMarker) {
          const offset = firstStep.offsetTop + firstMarker.offsetTop + firstMarker.offsetHeight / 2;
          return `top+=${offset} 50%`;
        }
        return 'top 50%';
      },
      end: () => {
        const lastStep = timelineSteps[timelineSteps.length - 1];
        const lastMarker = lastStep.querySelector('.timeline-step__marker');
        if (lastStep && lastMarker) {
          const offset = lastStep.offsetTop + lastMarker.offsetTop + lastMarker.offsetHeight / 2;
          return `top+=${offset} 50%`;
        }
        return 'bottom 50%';
      },
      scrub: true,
      invalidateOnRefresh: true
    }
  });

  timelineSteps.forEach((step, idx) => {
    ScrollTrigger.create({
      trigger: step,
      start: () => {
        const marker = step.querySelector('.timeline-step__marker');
        if (marker) {
          const offset = marker.offsetTop + marker.offsetHeight / 2;
          return `top+=${offset} 50%`;
        }
        return 'top 50%';
      },
      end: 'bottom 50%',
      onEnter: () => {
        step.classList.add('active');
        timelineSteps.forEach(s => s.classList.remove('current'));
        step.classList.add('current');
      },
      onEnterBack: () => {
        timelineSteps.forEach(s => s.classList.remove('current'));
        step.classList.add('current');
      },
      onLeave: () => {
        if (idx === timelineSteps.length - 1) {
          step.classList.remove('current');
        }
      },
      onLeaveBack: () => {
        step.classList.remove('active');
        step.classList.remove('current');
        if (idx > 0) {
          timelineSteps.forEach(s => s.classList.remove('current'));
          timelineSteps[idx - 1].classList.add('current');
        }
      },
      invalidateOnRefresh: true
    });
  });

  window.addEventListener('resize', () => {
    adjustTimelineLine();
    ScrollTrigger.refresh();
  });
}

/* ----------------------------------------------------
   08. WEBGL PARTICLE FIELD SHOWCASE
   ---------------------------------------------------- */
let techRenderer, techScene, techCamera;
let techPoints;
const techCanvas = document.getElementById('tech-particles-canvas');

function initTechWebGL() {
  if (!techCanvas) return;
  
  techRenderer = new THREE.WebGLRenderer({ canvas: techCanvas, antialias: true, alpha: true });
  techRenderer.setSize(techCanvas.clientWidth, techCanvas.clientHeight);
  techRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  techScene = new THREE.Scene();

  techCamera = new THREE.PerspectiveCamera(60, techCanvas.clientWidth / techCanvas.clientHeight, 0.1, 100);
  techCamera.position.z = 8;

  const pCount = isMobile ? 80 : 300;
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(pCount * 3);

  for (let i = 0; i < pCount; i++) {
    const idx = i * 3;
    pos[idx] = (Math.random() - 0.5) * 15;
    pos[idx+1] = (Math.random() - 0.5) * 10;
    pos[idx+2] = (Math.random() - 0.5) * 5;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  
  const texture = createCircleParticleTexture();
  const mat = new THREE.PointsMaterial({
    color: 0xFF5A1F,
    size: 0.14,
    transparent: true,
    opacity: 0.45,
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  techPoints = new THREE.Points(geom, mat);
  techScene.add(techPoints);

  const resizeTechHandler = () => {
    if (!techRenderer) return;
    techCamera.aspect = techCanvas.clientWidth / techCanvas.clientHeight;
    techCamera.updateProjectionMatrix();
    techRenderer.setSize(techCanvas.clientWidth, techCanvas.clientHeight);
  };
  window.addEventListener('resize', resizeTechHandler);

  let clock = new THREE.Clock();
  function renderTechScene() {
    if (document.hidden) {
      requestAnimationFrame(renderTechScene);
      return;
    }

    const elapsed = clock.getElapsedTime();
    
    const positions = techPoints.geometry.attributes.position.array;
    for (let i = 0; i < pCount; i++) {
      const idx = i * 3;
      positions[idx+1] += Math.sin(elapsed + positions[idx]) * 0.005;
    }
    techPoints.geometry.attributes.position.needsUpdate = true;
    
    techPoints.rotation.y = elapsed * 0.03;
    techPoints.rotation.x = elapsed * 0.015;

    techRenderer.render(techScene, techCamera);
    requestAnimationFrame(renderTechScene);
  }
  renderTechScene();

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('resize', resizeTechHandler);
    if (techRenderer) techRenderer.dispose();
  });
}

if (techCanvas) {
  ScrollTrigger.create({
    trigger: '#tech-showcase',
    start: 'top 80%',
    onEnter: () => {
      if (!techRenderer) initTechWebGL();
    }
  });
}

/* ----------------------------------------------------
   10. TRUST / STATS COUNTERS (CountUp on view)
   ---------------------------------------------------- */
function initStatsCounter() {
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach((card, index) => {
    const targetNum = parseInt(card.getAttribute('data-target-num'));
    const numElem = card.querySelector('.stat-card__number');

    ScrollTrigger.create({
      trigger: card,
      start: 'top 85%',
      onEnter: () => {
        let count = 0;
        const duration = 2000; 
        const steps = 60;
        const increment = targetNum / steps;
        const stepTime = duration / steps;
        
        const counterInterval = setInterval(() => {
          count += increment;
          if (count >= targetNum) {
            count = targetNum;
            clearInterval(counterInterval);
          }
          
          if (index === 0) {
            numElem.innerText = Math.floor(count) + '+';
          } else if (index === 1) {
            numElem.innerText = Math.floor(count) + '%';
          } else {
            numElem.innerText = Math.floor(count);
          }
        }, stepTime);
      },
      once: true
    });
  });
}

/* ----------------------------------------------------
   03. ABOUT SECTION INTERACTIVE WEBGL ENERGY CORE
   ---------------------------------------------------- */
let aboutRenderer, aboutScene, aboutCamera;
let aboutSceneGroup;
let aboutOrbit1, aboutOrbit2, aboutOrbit3;
let particle1, particle2, particle3;
let trail1 = [], trail2 = [], trail3 = [];
const maxTrailPoints = 14;
let trailMeshes1 = [], trailMeshes2 = [], trailMeshes3 = [];
let sparks = [];
let pulseRing;
let pulseTime = 0;

const curve1 = new THREE.EllipseCurve(0, 0, 1.25, 0.85, 0, 2 * Math.PI, false, 0);
const curve2 = new THREE.EllipseCurve(0, 0, 1.75, 1.2, 0, 2 * Math.PI, false, 0);
const curve3 = new THREE.EllipseCurve(0, 0, 2.25, 1.55, 0, 2 * Math.PI, false, 0);

function initAboutWebGL() {
  const container = document.getElementById('about-interactive-logo');
  const canvas = document.getElementById('about-webgl-canvas');
  if (!canvas || !container) return;

  // Renderer
  aboutRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  aboutRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
  aboutRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Scene
  aboutScene = new THREE.Scene();
  aboutScene.fog = new THREE.FogExp2(0x0f0f10, 0.07);

  // Camera
  aboutCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  aboutCamera.position.z = 7.2;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
  aboutScene.add(ambientLight);

  const corePointLight = new THREE.PointLight(0xFF5A1F, 2.5, 15);
  corePointLight.position.set(0, 0, -0.2);
  aboutScene.add(corePointLight);

  // Master Group
  aboutSceneGroup = new THREE.Group();
  aboutScene.add(aboutSceneGroup);

  // Center Logo
  const yLogoTexture = createYLogoTexture2D();
  const spriteMaterial = new THREE.SpriteMaterial({
    map: yLogoTexture,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  const yLogoSprite = new THREE.Sprite(spriteMaterial);
  yLogoSprite.scale.set(2.2, 2.2, 1);
  yLogoSprite.position.set(0, 0, 0.2);
  aboutSceneGroup.add(yLogoSprite);

  // Bloom Background
  const bloomTexture = createBloomAuraTexture2D();
  const bloomMaterial = new THREE.SpriteMaterial({
    map: bloomTexture,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending
  });
  const bloomSprite = new THREE.Sprite(bloomMaterial);
  bloomSprite.scale.set(3.8, 3.8, 1);
  bloomSprite.position.set(0, 0, -0.4);
  aboutSceneGroup.add(bloomSprite);

  // Orbit 1
  aboutOrbit1 = new THREE.Group();
  aboutOrbit1.rotation.x = Math.PI * 0.38;
  aboutOrbit1.rotation.y = -Math.PI * 0.1;
  aboutOrbit1.position.z = -0.3;
  aboutSceneGroup.add(aboutOrbit1);

  const points1 = curve1.getPoints(64);
  const geo1 = new THREE.BufferGeometry().setFromPoints(points1);
  const mat1 = new THREE.LineBasicMaterial({ color: 0xFF5A1F, transparent: true, opacity: 0.1 });
  const line1 = new THREE.LineLoop(geo1, mat1);
  aboutOrbit1.add(line1);

  const pGeo1 = new THREE.SphereGeometry(0.045, 12, 12);
  const pMat1 = new THREE.MeshBasicMaterial({ color: 0xFF5A1F });
  particle1 = new THREE.Mesh(pGeo1, pMat1);
  aboutOrbit1.add(particle1);

  for(let i=0; i<maxTrailPoints; i++) {
    const scale = 1.0 - (i / maxTrailPoints);
    const opacity = (1.0 - (i / maxTrailPoints)) * 0.45;
    const trailGeo = new THREE.SphereGeometry(0.045 * scale, 8, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xFF5A1F,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    aboutOrbit1.add(trailMesh);
    trailMeshes1.push(trailMesh);
  }

  // Orbit 2
  aboutOrbit2 = new THREE.Group();
  aboutOrbit2.rotation.x = Math.PI * 0.28;
  aboutOrbit2.rotation.y = Math.PI * 0.18;
  aboutOrbit2.position.z = 0.5;
  aboutSceneGroup.add(aboutOrbit2);

  const points2 = curve2.getPoints(64);
  const geo2 = new THREE.BufferGeometry().setFromPoints(points2);
  const mat2 = new THREE.LineBasicMaterial({ color: 0xFF6A00, transparent: true, opacity: 0.08 });
  const line2 = new THREE.LineLoop(geo2, mat2);
  aboutOrbit2.add(line2);

  const pGeo2 = new THREE.SphereGeometry(0.05, 12, 12);
  const pMat2 = new THREE.MeshBasicMaterial({ color: 0xFF6A00 });
  particle2 = new THREE.Mesh(pGeo2, pMat2);
  aboutOrbit2.add(particle2);

  for(let i=0; i<maxTrailPoints; i++) {
    const scale = 1.0 - (i / maxTrailPoints);
    const opacity = (1.0 - (i / maxTrailPoints)) * 0.45;
    const trailGeo = new THREE.SphereGeometry(0.05 * scale, 8, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xFF6A00,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    aboutOrbit2.add(trailMesh);
    trailMeshes2.push(trailMesh);
  }

  // Orbit 3
  aboutOrbit3 = new THREE.Group();
  aboutOrbit3.rotation.x = Math.PI * 0.48;
  aboutOrbit3.rotation.y = Math.PI * 0.05;
  aboutOrbit3.rotation.z = -Math.PI * 0.15;
  aboutOrbit3.position.z = 0.0;
  aboutSceneGroup.add(aboutOrbit3);

  const points3 = curve3.getPoints(64);
  const geo3 = new THREE.BufferGeometry().setFromPoints(points3);
  const mat3 = new THREE.LineBasicMaterial({ color: 0xFF8C5A, transparent: true, opacity: 0.06 });
  const line3 = new THREE.LineLoop(geo3, mat3);
  aboutOrbit3.add(line3);

  const pGeo3 = new THREE.SphereGeometry(0.075, 16, 16);
  const pMat3 = new THREE.MeshBasicMaterial({ color: 0xffffff });
  particle3 = new THREE.Mesh(pGeo3, pMat3);
  aboutOrbit3.add(particle3);

  for(let i=0; i<maxTrailPoints; i++) {
    const scale = 1.0 - (i / maxTrailPoints);
    const opacity = (1.0 - (i / maxTrailPoints)) * 0.65;
    const trailGeo = new THREE.SphereGeometry(0.075 * scale, 8, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xFF5A1F,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    aboutOrbit3.add(trailMesh);
    trailMeshes3.push(trailMesh);
  }

  // Sparks
  const sparkCount = 12;
  const sGeo = new THREE.SphereGeometry(0.018, 6, 6);
  const sMat = new THREE.MeshBasicMaterial({
    color: 0xFF6A00,
    transparent: true,
    opacity: 0.85
  });
  for(let i=0; i<sparkCount; i++) {
    const spark = new THREE.Mesh(sGeo, sMat.clone());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = 0.8 + Math.random() * 1.5;
    spark.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    spark.userData = {
      angle: Math.random() * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.015,
      amplitude: 0.12 + Math.random() * 0.18,
      basePos: spark.position.clone()
    };
    aboutSceneGroup.add(spark);
    sparks.push(spark);
  }

  // Energy Pulse Wave
  const pulseGeo = new THREE.RingGeometry(0.1, 0.12, 32);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xFF5A1F,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
  });
  pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
  pulseRing.rotation.x = Math.PI * 0.35;
  pulseRing.rotation.y = Math.PI * 0.1;
  pulseRing.position.z = 0.1;
  aboutSceneGroup.add(pulseRing);

  // Mouse Parallax
  let targetRotX = 0;
  let targetRotY = 0;
  const parentCol = document.querySelector('.about__right');
  if (parentCol) {
    parentCol.addEventListener('mousemove', (e) => {
      const rect = parentCol.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) - 0.5;
      const normY = ((e.clientY - rect.top) / rect.height) - 0.5;
      
      targetRotY = normX * 0.45;
      targetRotX = normY * 0.45;
    });

    parentCol.addEventListener('mouseleave', () => {
      targetRotX = 0;
      targetRotY = 0;
    });
  }

  const resizeAboutHandler = () => {
    if (!aboutRenderer) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    aboutCamera.aspect = w / h;
    aboutCamera.updateProjectionMatrix();
    aboutRenderer.setSize(w, h);
  };
  window.addEventListener('resize', resizeAboutHandler);

  let t1 = 0, t2 = 0.3, t3 = 0.6;
  function animateAboutScene() {
    if (document.hidden) {
      requestAnimationFrame(animateAboutScene);
      return;
    }

    aboutSceneGroup.rotation.x += (targetRotX - aboutSceneGroup.rotation.x) * 0.08;
    aboutSceneGroup.rotation.y += (targetRotY - aboutSceneGroup.rotation.y) * 0.08;

    t1 += 0.0022;
    t2 -= 0.0016;
    t3 += 0.0012;

    if (t1 > 1.0) t1 -= 1.0;
    if (t2 < 0.0) t2 += 1.0;
    if (t3 > 1.0) t3 -= 1.0;

    const p1 = curve1.getPointAt(t1);
    const p2 = curve2.getPointAt(t2);
    const p3 = curve3.getPointAt(t3);

    particle1.position.set(p1.x, p1.y, 0);
    particle2.position.set(p2.x, p2.y, 0);
    particle3.position.set(p3.x, p3.y, 0);

    updateTrailHistory(trail1, particle1.position, trailMeshes1);
    updateTrailHistory(trail2, particle2.position, trailMeshes2);
    updateTrailHistory(trail3, particle3.position, trailMeshes3);

    sparks.forEach(spark => {
      spark.userData.angle += spark.userData.speed;
      spark.position.x = spark.userData.basePos.x + Math.sin(spark.userData.angle) * spark.userData.amplitude;
      spark.position.y = spark.userData.basePos.y + Math.cos(spark.userData.angle * 1.4) * spark.userData.amplitude;
      spark.position.z = spark.userData.basePos.z + Math.sin(spark.userData.angle * 0.8) * (spark.userData.amplitude * 0.5);
      
      spark.material.opacity = 0.3 + Math.sin(spark.userData.angle * 2.2) * 0.5;
    });

    pulseTime += 0.0042;
    if (pulseTime > 1.0) pulseTime = 0;
    if (pulseTime < 0.5) {
      const progress = pulseTime / 0.5;
      const scale = 0.5 + progress * 3.6;
      pulseRing.scale.set(scale, scale, scale);
      pulseRing.material.opacity = (1.0 - progress) * 0.7;
    } else {
      pulseRing.material.opacity = 0;
    }

    aboutRenderer.render(aboutScene, aboutCamera);
    requestAnimationFrame(animateAboutScene);
  }
  animateAboutScene();

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('resize', resizeAboutHandler);
    if (aboutRenderer) aboutRenderer.dispose();
  });
}

function updateTrailHistory(historyArray, currentPos, meshesArray) {
  historyArray.unshift(currentPos.clone());
  if (historyArray.length > maxTrailPoints) {
    historyArray.pop();
  }
  for (let i = 0; i < historyArray.length; i++) {
    meshesArray[i].position.copy(historyArray[i]);
    meshesArray[i].visible = true;
  }
  for (let i = historyArray.length; i < maxTrailPoints; i++) {
    meshesArray[i].visible = false;
  }
}

function createYLogoTexture2D() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.strokeStyle = '#FF5A1F';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.shadowColor = '#FF5A1F';
  ctx.shadowBlur = 32;

  ctx.beginPath();
  ctx.moveTo(48, 32);
  ctx.lineTo(128, 128);
  ctx.lineTo(208, 32);
  ctx.moveTo(128, 128);
  ctx.lineTo(128, 224);
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#FF8C5A';
  ctx.lineWidth = 6;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

function createBloomAuraTexture2D() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(255, 90, 31, 0.45)');
  grad.addColorStop(0.3, 'rgba(255, 106, 0, 0.15)');
  grad.addColorStop(0.7, 'rgba(255, 90, 31, 0.02)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

/* ----------------------------------------------------
   GLOBAL TAB VISIBILITY MONITOR
   ---------------------------------------------------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ScrollTrigger.getAll().forEach(trigger => trigger.disable());
  } else {
    ScrollTrigger.getAll().forEach(trigger => trigger.enable());
    ScrollTrigger.refresh();
  }
});
