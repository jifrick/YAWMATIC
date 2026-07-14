import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
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
