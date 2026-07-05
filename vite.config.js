export default {
  server: {
    // Rewrite clean URLs to their .html equivalents for local development
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Strip query strings or hashes for matching
        const urlPath = req.url.split('?')[0].split('#')[0];
        const cleanRoutes = ['/about', '/services', '/work', '/process', '/contact'];
        
        if (cleanRoutes.includes(urlPath)) {
          req.url = urlPath + '.html';
        } else if (urlPath === '/' || urlPath === '') {
          req.url = '/index.html';
        }
        next();
      });
    }
  }
};
