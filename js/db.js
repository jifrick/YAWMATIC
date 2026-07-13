import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../yawmatic.db');
const db = new DatabaseSync(dbPath);

// Initialize DB schema
export function initDB() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT,
      order_index INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      UNIQUE(city, country)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      categories TEXT NOT NULL, -- JSON array of category slugs
      years_experience INTEGER DEFAULT 0,
      equipment TEXT, -- JSON array of strings
      languages TEXT, -- JSON array of strings
      bio TEXT,
      profile_image TEXT,
      cover_image TEXT,
      instagram TEXT,
      portfolio_url TEXT,
      behance TEXT,
      dribbble TEXT,
      youtube TEXT,
      vimeo TEXT,
      website TEXT,
      availability TEXT DEFAULT 'available', -- 'available', 'limited', 'booked'
      verified INTEGER DEFAULT 0, -- boolean (0 or 1)
      featured INTEGER DEFAULT 0, -- boolean (0 or 1)
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'inactive'
      rating REAL DEFAULT 5.0,
      internal_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      assigned_creator_ids TEXT, -- JSON array of creator IDs
      status TEXT DEFAULT 'assigned', -- 'assigned', 'in_progress', 'delivered', 'paid'
      timeline TEXT,
      budget TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      rating REAL DEFAULT 5.0,
      text TEXT,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'hidden'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER, -- NULL if general collective inquiry
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      project_details TEXT NOT NULL,
      status TEXT DEFAULT 'new', -- 'new', 'reviewed', 'contacted', 'closed'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE SET NULL
    );
  `);

  // Create indexes for performance & scalability
  db.exec(`CREATE INDEX IF NOT EXISTS idx_creators_status ON creators(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_creators_slug ON creators(slug);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_creators_city ON creators(city);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_creators_availability ON creators(availability);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_creator ON reviews(creator_id, status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inquiries_creator ON inquiries(creator_id);`);

  // Seed Categories
  const categoryCountStmt = db.prepare('SELECT COUNT(*) as count FROM categories');
  const catCount = categoryCountStmt.get();
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, slug, icon, order_index) VALUES (?, ?, ?, ?)');
    const seedCats = [
      ['Photography', 'photography', 'camera', 1],
      ['Videography', 'videography', 'video', 2],
      ['Drone Operator', 'drone-operator', 'navigation', 3],
      ['Video Editor', 'video-editor', 'film', 4],
      ['Motion Designer', 'motion-designer', 'activity', 5],
      ['Graphic Designer', 'graphic-designer', 'pen-tool', 6],
      ['Brand Designer', 'brand-designer', 'layers', 7],
      ['UI/UX Designer', 'ui-ux-designer', 'layout', 8],
      ['Web Designer', 'web-designer', 'globe', 9],
      ['3D Artist', '3d-artist', 'box', 10],
      ['Content Creator', 'content-creator', 'hash', 11],
      ['Social Media Manager', 'social-media-manager', 'instagram', 12],
      ['Copywriter', 'copywriter', 'edit-3', 13],
      ['AI Creative Specialist', 'ai-creative-specialist', 'cpu', 14]
    ];
    for (const cat of seedCats) {
      insertCat.run(cat[0], cat[1], cat[2], cat[3]);
    }
  }

  // Seed Locations
  const locCountStmt = db.prepare('SELECT COUNT(*) as count FROM locations');
  const locCount = locCountStmt.get();
  if (locCount.count === 0) {
    const insertLoc = db.prepare('INSERT INTO locations (city, country, order_index) VALUES (?, ?, ?)');
    const seedLocs = [
      ['Kochi', 'India', 1],
      ['Bangalore', 'India', 2],
      ['Mumbai', 'India', 3],
      ['Dubai', 'UAE', 4]
    ];
    for (const loc of seedLocs) {
      insertLoc.run(loc[0], loc[1], loc[2]);
    }
  }

  // Seed Creators (15 creators: 11 approved, 3 pending, 1 rejected)
  const creatorCountStmt = db.prepare('SELECT COUNT(*) as count FROM creators');
  const creatorCount = creatorCountStmt.get();
  if (creatorCount.count === 0) {
    const insertCreator = db.prepare(`
      INSERT INTO creators (
        slug, full_name, email, phone, city, country, categories, years_experience, 
        equipment, languages, bio, profile_image, cover_image, instagram, 
        portfolio_url, behance, dribbble, youtube, vimeo, website, availability, 
        verified, featured, status, rating, internal_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const creators = [
      {
        slug: 'amal-krishna',
        full_name: 'Amal Krishna',
        email: 'amal@yawmatic.com',
        phone: '+91 98460 12345',
        city: 'Kochi',
        country: 'India',
        categories: JSON.stringify(['photography', 'drone-operator']),
        years_experience: 6,
        equipment: JSON.stringify(['Sony A7R V', 'Sony FX3', 'DJI Mavic 3 Pro', '24-70mm GMaster II', '85mm f/1.4']),
        languages: JSON.stringify(['English', 'Malayalam', 'Tamil']),
        bio: 'Cinematographer and photographer based in Kochi. Specializing in high-end architecture, luxury resorts, and landscape photography. Capturing the interplay of light and structure with surgical precision.',
        profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1200&h=675&fit=crop',
        instagram: 'amal_krishna_clicks',
        portfolio_url: 'https://amalclicks.myportfolio.com',
        behance: 'amal_krishna',
        dribbble: '',
        youtube: 'amal_krishna_films',
        vimeo: '',
        website: 'https://amalclicks.com',
        availability: 'available',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 4.9,
        internal_notes: 'Exceptional drone and landscape work. Highly recommended for premium hospitality gigs.'
      },
      {
        slug: 'sara-cherian',
        full_name: 'Sara Cherian',
        email: 'sara@yawmatic.com',
        phone: '+91 99955 67890',
        city: 'Kochi',
        country: 'India',
        categories: JSON.stringify(['brand-designer', 'graphic-designer']),
        years_experience: 5,
        equipment: JSON.stringify(['MacBook Pro M3 Max', 'iPad Pro (Apple Pencil)', 'Wacom Intuos Pro']),
        languages: JSON.stringify(['English', 'Malayalam']),
        bio: 'Brand identity designer and typographer. Passionate about minimalism, architectural layouts, and editorial design system design. Believes that a brand is a promise kept.',
        profile_image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&h=675&fit=crop',
        instagram: 'sara_designs',
        portfolio_url: 'https://behance.net/saracherian',
        behance: 'saracherian',
        dribbble: 'sara_cherian',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'limited',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 5.0,
        internal_notes: 'Incredible typography skills. Built the identity system for WEBINVITE.IN.'
      },
      {
        slug: 'rohan-kapoor',
        full_name: 'Rohan Kapoor',
        email: 'rohan@yawmatic.com',
        phone: '+91 98950 54321',
        city: 'Mumbai',
        country: 'India',
        categories: JSON.stringify(['videography', 'video-editor']),
        years_experience: 7,
        equipment: JSON.stringify(['RED V-Raptor', 'Sony FX6', 'DaVinci Resolve Studio', 'Zeiss Supreme Primes']),
        languages: JSON.stringify(['English', 'Hindi']),
        bio: 'Award-winning narrative videographer and editor. Crafting luxury brand campaigns and high-octane commercial advertisements. Heavy emphasis on sound design and pacing.',
        profile_image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?q=80&w=1200&h=675&fit=crop',
        instagram: 'rohan_films',
        portfolio_url: 'https://vimeo.com/rohankapoor',
        behance: '',
        dribbble: '',
        youtube: 'rohan_cuts',
        vimeo: 'rohankapoor',
        website: 'https://rohankapoor.com',
        availability: 'booked',
        verified: 1,
        featured: 0,
        status: 'approved',
        rating: 4.8,
        internal_notes: 'High-end cinema specialist. Currently booked on a feature project until August.'
      },
      {
        slug: 'priya-sharma',
        full_name: 'Priya Sharma',
        email: 'priya@yawmatic.com',
        phone: '+91 97444 88888',
        city: 'Bangalore',
        country: 'India',
        categories: JSON.stringify(['ui-ux-designer', 'web-designer']),
        years_experience: 8,
        equipment: JSON.stringify(['Figma', 'Framer', 'Webflow', 'MacBook Pro M3']),
        languages: JSON.stringify(['English', 'Hindi', 'Kannada']),
        bio: 'Product designer focusing on premium web experiences, design systems, and responsive interface architectures. Merging extreme functional hierarchy with rich creative layouts.',
        profile_image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?q=80&w=1200&h=675&fit=crop',
        instagram: 'priya_ux',
        portfolio_url: 'https://dribbble.com/priyasharma',
        behance: 'priya_sharma_ux',
        dribbble: 'priyasharma',
        youtube: '',
        vimeo: '',
        website: 'https://priyadesign.co',
        availability: 'available',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 5.0,
        internal_notes: 'Stellar portfolio. Ex-Linear designer. Excellent communication skills.'
      },
      {
        slug: 'marcus-dubai',
        full_name: 'Marcus Vance',
        email: 'marcus@yawmatic.com',
        phone: '+971 50 123 4567',
        city: 'Dubai',
        country: 'UAE',
        categories: JSON.stringify(['3d-artist', 'motion-designer']),
        years_experience: 10,
        equipment: JSON.stringify(['Cinema 4D', 'Octane Render', 'After Effects', 'Houdini', 'Dual RTX 4090 Station']),
        languages: JSON.stringify(['English', 'French']),
        bio: 'Creative director and 3D visual artist based in Dubai. Designing surrealist CGI loops, futuristic product installations, and luxury brand simulations.',
        profile_image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?q=80&w=1200&h=675&fit=crop',
        instagram: 'marcus_cgi',
        portfolio_url: 'https://behance.net/marcusvance',
        behance: 'marcusvance',
        dribbble: 'marcus_v',
        youtube: '',
        vimeo: 'marcus_vance',
        website: 'https://vance3d.com',
        availability: 'available',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 4.9,
        internal_notes: 'Tier-1 3D CGI artist. Perfect for high-budget commercial campaigns in the GCC region.'
      },
      {
        slug: 'sneha-menon',
        full_name: 'Sneha Menon',
        email: 'sneha@yawmatic.com',
        phone: '+91 94470 99900',
        city: 'Kochi',
        country: 'India',
        categories: JSON.stringify(['content-creator', 'social-media-manager']),
        years_experience: 4,
        equipment: JSON.stringify(['iPhone 15 Pro Max', 'DJI Osmo Pocket 3', 'Sony ZV-E1', 'Rode Wireless PRO']),
        languages: JSON.stringify(['English', 'Malayalam']),
        bio: 'Social strategist and content creator. Specializing in lifestyle, tech, and cultural media campaigns that bridge the gap between creative visual assets and active user engagement.',
        profile_image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?q=80&w=1200&h=675&fit=crop',
        instagram: 'sneha_creates',
        portfolio_url: 'https://snehamenon.content.co',
        behance: '',
        dribbble: '',
        youtube: 'snehamenon',
        vimeo: '',
        website: '',
        availability: 'available',
        verified: 0,
        featured: 0,
        status: 'approved',
        rating: 4.7,
        internal_notes: 'Superb short-form content producer. Directs and hosts. Great local influence.'
      },
      {
        slug: 'alex-koval',
        full_name: 'Alex Koval',
        email: 'alex@yawmatic.com',
        phone: '+971 52 987 6543',
        city: 'Dubai',
        country: 'UAE',
        categories: JSON.stringify(['videography', 'drone-operator']),
        years_experience: 9,
        equipment: JSON.stringify(['RED Komodo 6K', 'Freefly Alta X Heavy Lift', 'DJI Inspire 3', 'Arri Signature Primes']),
        languages: JSON.stringify(['English', 'Russian']),
        bio: 'Heavy-lift drone operator and cinematographer. Delivering cinematic, high-speed aerial tracking shots for luxury automotive shoots and mega-infrastructure campaigns.',
        profile_image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?q=80&w=1200&h=675&fit=crop',
        instagram: 'koval_drones',
        portfolio_url: 'https://kovalfilms.com',
        behance: '',
        dribbble: '',
        youtube: 'kovalaerials',
        vimeo: 'kovalaerials',
        website: 'https://kovalfilms.com',
        availability: 'limited',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 4.9,
        internal_notes: 'Licensed heavy drone pilot in UAE. Owns high-end RED/Arri-capable drone rigs.'
      },
      {
        slug: 'ananya-iyer',
        full_name: 'Ananya Iyer',
        email: 'ananya@yawmatic.com',
        phone: '+91 98860 33445',
        city: 'Bangalore',
        country: 'India',
        categories: JSON.stringify(['copywriter', 'ai-creative-specialist']),
        years_experience: 6,
        equipment: JSON.stringify(['GPT-4 API Systems', 'Midjourney v6', 'Claude 3.5 Sonnet', 'MacBook Pro M2']),
        languages: JSON.stringify(['English', 'Tamil', 'Sanskrit']),
        bio: 'Editorial copywriter and generative AI creative engineer. Bridging structured linguistic styling with generative media pipelines to build high-converting editorial campaigns.',
        profile_image: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&h=675&fit=crop',
        instagram: 'ananya_writes',
        portfolio_url: 'https://ananyaiyer.com',
        behance: 'ananyaiyer',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: 'https://ananyaiyer.com',
        availability: 'available',
        verified: 1,
        featured: 0,
        status: 'approved',
        rating: 4.8,
        internal_notes: 'Expert in combining AI tools with premium copywriting. Writes high-quality copy.'
      },
      {
        slug: 'vikram-rathore',
        full_name: 'Vikram Rathore',
        email: 'vikram@yawmatic.com',
        phone: '+91 91234 56789',
        city: 'Mumbai',
        country: 'India',
        categories: JSON.stringify(['photography']),
        years_experience: 12,
        equipment: JSON.stringify(['Phase One XF 150MP', 'Hasselblad H6D-100c', 'Profoto Pro-11 Studio Lighting Pack']),
        languages: JSON.stringify(['English', 'Hindi', 'Punjabi']),
        bio: 'High-fashion and portrait photographer. Regular contributor to international design catalogs and editorial features. Crafting bold, expressive lighting narratives.',
        profile_image: 'https://images.unsplash.com/photo-1489980508314-941910ded1f4?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=1200&h=675&fit=crop',
        instagram: 'vikram_fashion',
        portfolio_url: 'https://vikramrathore.com',
        behance: 'vikramfashion',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: 'https://vikramrathore.com',
        availability: 'limited',
        verified: 1,
        featured: 1,
        status: 'approved',
        rating: 5.0,
        internal_notes: 'Legendary fashion photographer. Brings major brand connections to the agency.'
      },
      {
        slug: 'riya-sen',
        full_name: 'Riya Sen',
        email: 'riya@yawmatic.com',
        phone: '+91 97766 55443',
        city: 'Kochi',
        country: 'India',
        categories: JSON.stringify(['motion-designer', 'video-editor']),
        years_experience: 4,
        equipment: JSON.stringify(['Adobe Creative Cloud', 'DaVinci Resolve Studio', 'MacBook Pro M2 Max']),
        languages: JSON.stringify(['English', 'Malayalam']),
        bio: 'Motion graphics specialist focusing on kinetic typography, clean SVG vector layouts, and high-fidelity product explainers. Seamless transitions are my signature.',
        profile_image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&h=675&fit=crop',
        instagram: 'riya_motion',
        portfolio_url: 'https://behance.net/riyasen_motion',
        behance: 'riyasen_motion',
        dribbble: 'riyasen',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'available',
        verified: 0,
        featured: 0,
        status: 'approved',
        rating: 4.6,
        internal_notes: 'Fast delivery turnaround. Excellent vector rigging and logo animation skills.'
      },
      {
        slug: 'tariq-ahmed',
        full_name: 'Tariq Ahmed',
        email: 'tariq@yawmatic.com',
        phone: '+971 55 555 4321',
        city: 'Dubai',
        country: 'UAE',
        categories: JSON.stringify(['web-designer', 'ui-ux-designer']),
        years_experience: 7,
        equipment: JSON.stringify(['Figma', 'Webflow', 'React', 'Three.js']),
        languages: JSON.stringify(['English', 'Arabic']),
        bio: 'Front-end designer specializing in WebGL canvas creations, responsive interface design, and Webflow micro-portals for luxury properties and premium real estate in Dubai.',
        profile_image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&h=675&fit=crop',
        instagram: 'tariq_designs',
        portfolio_url: 'https://dribbble.com/tariqahmed',
        behance: 'tariq_ahmed',
        dribbble: 'tariqahmed',
        youtube: '',
        vimeo: '',
        website: 'https://tariq.design',
        availability: 'available',
        verified: 1,
        featured: 0,
        status: 'approved',
        rating: 4.8,
        internal_notes: 'Bilingual designer. Excellent for high-end real estate web projects.'
      },
      // PENDING APPLICATIONS
      {
        slug: 'daniel-kim',
        full_name: 'Daniel Kim',
        email: 'daniel@example.com',
        phone: '+82 10 1234 5678',
        city: 'Seoul',
        country: 'South Korea',
        categories: JSON.stringify(['3d-artist', 'motion-designer']),
        years_experience: 5,
        equipment: JSON.stringify(['Blender', 'Substance Painter', 'DaVinci Resolve']),
        languages: JSON.stringify(['Korean', 'English']),
        bio: '3D asset designer and cyberpunk environment builder. Creating hyper-realistic virtual spaces and visual looping videos.',
        profile_image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1200&h=675&fit=crop',
        instagram: 'daniel_3d',
        portfolio_url: 'https://artstation.com/danielkim',
        behance: '',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'available',
        verified: 0,
        featured: 0,
        status: 'pending',
        rating: 5.0,
        internal_notes: 'Pending review. Portfolio looks promising, but need to check client references.'
      },
      {
        slug: 'lara-croft',
        full_name: 'Lara Croft',
        email: 'lara@tomb.com',
        phone: '+44 7911 123456',
        city: 'London',
        country: 'UK',
        categories: JSON.stringify(['photography']),
        years_experience: 15,
        equipment: JSON.stringify(['Leica M11', 'Sony A9 III', 'Extreme Expedition Rig']),
        languages: JSON.stringify(['English', 'Greek', 'Latin']),
        bio: 'Adventure photographer capturing hidden historical sights, deep caverns, and lost ruins in remote corners of the globe.',
        profile_image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&h=675&fit=crop',
        instagram: 'lara_adventures',
        portfolio_url: 'https://laracroft.com',
        behance: '',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'limited',
        verified: 0,
        featured: 0,
        status: 'pending',
        rating: 5.0,
        internal_notes: 'High-profile submitter, needs background verification. Excentric bio.'
      },
      {
        slug: 'kavya-nair',
        full_name: 'Kavya Nair',
        email: 'kavya@gmail.com',
        phone: '+91 96543 21098',
        city: 'Kochi',
        country: 'India',
        categories: JSON.stringify(['copywriter', 'content-creator']),
        years_experience: 3,
        equipment: JSON.stringify(['MacBook Air M2', 'Figma']),
        languages: JSON.stringify(['English', 'Malayalam']),
        bio: 'Creative copy and social scriptwriter. Developing brand messaging for local startups, visual storytellers, and tech businesses.',
        profile_image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=1200&h=675&fit=crop',
        instagram: 'kavya_writes',
        portfolio_url: 'https://kavyanair.com',
        behance: '',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'available',
        verified: 0,
        featured: 0,
        status: 'pending',
        rating: 5.0,
        internal_notes: 'Local writer. Portfolio has good commercial copy examples.'
      },
      // REJECTED APPLICATION (to show queue reject state)
      {
        slug: 'john-doe',
        full_name: 'John Doe',
        email: 'john@junk.com',
        phone: '+1 555 0199',
        city: 'New York',
        country: 'USA',
        categories: JSON.stringify(['graphic-designer']),
        years_experience: 1,
        equipment: JSON.stringify(['Laptop', 'Canva']),
        languages: JSON.stringify(['English']),
        bio: 'Novice designer looking for remote projects. Vibe curator.',
        profile_image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&h=400&fit=crop',
        cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&h=675&fit=crop',
        instagram: 'johndoe',
        portfolio_url: '',
        behance: '',
        dribbble: '',
        youtube: '',
        vimeo: '',
        website: '',
        availability: 'available',
        verified: 0,
        featured: 0,
        status: 'rejected',
        rating: 1.0,
        internal_notes: 'Junk submission. Mostly uses Canva templates. Does not meet agency quality bar.'
      }
    ];

    for (const c of creators) {
      insertCreator.run(
        c.slug, c.full_name, c.email, c.phone, c.city, c.country, c.categories, c.years_experience,
        c.equipment, c.languages, c.bio, c.profile_image, c.cover_image, c.instagram,
        c.portfolio_url, c.behance, c.dribbble, c.youtube, c.vimeo, c.website, c.availability,
        c.verified, c.featured, c.status, c.rating, c.internal_notes
      );
    }
  }

  // Seed Reviews (for Amal Krishna, Sara Cherian, Priya Sharma)
  const reviewCountStmt = db.prepare('SELECT COUNT(*) as count FROM reviews');
  const revCount = reviewCountStmt.get();
  if (revCount.count === 0) {
    const insertReview = db.prepare(`
      INSERT INTO reviews (creator_id, client_name, rating, text, status) 
      VALUES (?, ?, ?, ?, ?)
    `);

    // Amal Krishna is ID 1
    insertReview.run(1, 'Aman luxury Resorts', 5.0, 'Amal delivered breathtaking architectural shots of our Munnar property. His eye for timing and natural lighting is unmatched. Absolute professional.', 'approved');
    insertReview.run(1, 'CGH Earth Hotels', 4.8, 'High-fidelity aerial drone footage. Amal managed local clearances seamlessly and got the exact sunset shots we envisioned.', 'approved');

    // Sara Cherian is ID 2
    insertReview.run(2, 'Vercel Inc.', 5.0, 'Sara has an exquisite editorial touch. She re-designed our developer handbook guidelines with absolute precision. High typographic quality.', 'approved');
    
    // Priya Sharma is ID 4
    insertReview.run(4, 'Linear App', 5.0, 'Priya helped draft our new desktop onboarding flows. Generous whitespace, perfect Swiss grid discipline, and incredibly clean interactive details.', 'approved');
  }

  // Seed Projects
  const projectCountStmt = db.prepare('SELECT COUNT(*) as count FROM projects');
  const projCount = projectCountStmt.get();
  if (projCount.count === 0) {
    const insertProject = db.prepare(`
      INSERT INTO projects (client_name, description, category, assigned_creator_ids, status, timeline, budget) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertProject.run('Aman luxury Resorts Campaign', 'Architecture and lifestyle visual asset collection for Munnar property launch.', 'Photography', JSON.stringify([1]), 'delivered', '4 weeks', '$15,000');
    insertProject.run('WEBINVITE.IN Redesign', 'Revamping the event creation interface with custom WebGL animations.', 'UI/UX Design', JSON.stringify([4, 2]), 'in_progress', '8 weeks', '$25,000');
    insertProject.run('Futuristic VFX Campaign', 'Creating CGI 3D loops for Dubai real estate catalog panels.', '3D Art', JSON.stringify([5]), 'assigned', '6 weeks', '$40,000');
  }
  
  console.log('YAWMATIC Collective Database Initialized & Seeded.');
}

export { db };
