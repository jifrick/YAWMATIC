import { handleAPI } from './js/api.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  server: {
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip query strings or hashes for matching
        const urlPath = req.url.split('?')[0].split('#')[0];
        
        // 1. Route API requests to our SQLite API router
        if (urlPath.startsWith('/api/') || urlPath === '/api') {
          handleAPI(req, res);
          return;
        }

        // 2. Rewrite clean URLs to their physical .html files
        const cleanRoutes = {
          '/about': '/about.html',
          '/services': '/services.html',
          '/work': '/work.html',
          '/process': '/process.html',
          '/contact': '/contact.html',
          '/creators': '/creators.html',
          '/creators/browse': '/creators-browse.html',
          '/creators/apply': '/creators-apply.html',
          '/creators/success-stories': '/creators-browse.html' // Success stories can display featured in browse or similar
        };

        if (cleanRoutes.hasOwnProperty(urlPath)) {
          req.url = req.url.replace(urlPath, cleanRoutes[urlPath]);
        } else if (urlPath === '/' || urlPath === '') {
          req.url = '/index.html';
        } else if (urlPath.startsWith('/creators/')) {
          // Dynamic category or profile slug
          const slug = urlPath.substring(10); // get what is after /creators/
          const categories = [
            'photography', 'videography', 'drone-operator', 'video-editor', 'motion-designer',
            'graphic-designer', 'brand-designer', 'ui-ux-designer', 'web-designer', '3d-artist',
            'content-creator', 'social-media-manager', 'copywriter', 'ai-creative-specialist'
          ];
          
          if (categories.includes(slug)) {
            req.url = req.url.replace(urlPath, '/creators-category.html');
          } else {
            req.url = req.url.replace(urlPath, '/creators-profile.html');
          }
        } else if (urlPath.startsWith('/admin')) {
          // Dynamic admin views (creators, projects, categories, locations, reviews, analytics)
          req.url = req.url.replace(urlPath, '/admin.html');
        }

        next();
      });
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        about: path.resolve(__dirname, 'about.html'),
        services: path.resolve(__dirname, 'services.html'),
        work: path.resolve(__dirname, 'work.html'),
        process: path.resolve(__dirname, 'process.html'),
        contact: path.resolve(__dirname, 'contact.html'),
        creators: path.resolve(__dirname, 'creators.html'),
        creatorsBrowse: path.resolve(__dirname, 'creators-browse.html'),
        creatorsCategory: path.resolve(__dirname, 'creators-category.html'),
        creatorsProfile: path.resolve(__dirname, 'creators-profile.html'),
        creatorsApply: path.resolve(__dirname, 'creators-apply.html'),
        admin: path.resolve(__dirname, 'admin.html')
      }
    }
  }
};
