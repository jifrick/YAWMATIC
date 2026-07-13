import { db, initDB } from './db.js';
import url from 'url';

// Initialize the database on startup
initDB();

// Helper to parse JSON body
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({}); // Default to empty object on parse error
      }
    });
  });
}

// Helper to send JSON response
function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// Helper to generate a unique slug
function generateUniqueSlug(fullName) {
  let baseSlug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  
  if (!baseSlug) baseSlug = 'creator';

  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM creators WHERE slug = ?');
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const res = checkStmt.get(slug);
    if (res.count === 0) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

export async function handleAPI(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // ------------------------------------------------
    // PUBLIC ENDPOINTS
    // ------------------------------------------------

    // 1. GET /api/creators - Search & Filter directory
    if (pathname === '/api/creators' && method === 'GET') {
      const {
        category,
        city,
        availability,
        experience_min,
        experience_max,
        rating_min,
        verified_only,
        featured,
        search,
        sort,
        page = 1,
        limit = 12
      } = parsedUrl.query;

      let sql = 'FROM creators WHERE status = "approved"';
      const params = [];

      if (city) {
        sql += ' AND city = ?';
        params.push(city);
      }
      if (availability) {
        sql += ' AND availability = ?';
        params.push(availability);
      }
      if (verified_only === 'true') {
        sql += ' AND verified = 1';
      }
      if (featured === 'true') {
        sql += ' AND featured = 1';
      }
      if (experience_min) {
        sql += ' AND years_experience >= ?';
        params.push(parseInt(experience_min, 10));
      }
      if (experience_max) {
        sql += ' AND years_experience <= ?';
        params.push(parseInt(experience_max, 10));
      }
      if (rating_min) {
        sql += ' AND rating >= ?';
        params.push(parseFloat(rating_min));
      }
      if (search) {
        sql += ' AND (full_name LIKE ? OR bio LIKE ? OR categories LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (category) {
        const cats = category.split(',');
        sql += ' AND (' + cats.map(() => 'categories LIKE ?').join(' OR ') + ')';
        cats.forEach(c => params.push(`%${c}%`));
      }

      // Count total matching items
      const countQuery = db.prepare(`SELECT COUNT(*) as count ${sql}`);
      const countResult = countQuery.get(...params);
      const totalCount = countResult.count;

      // Add Sorting
      let orderSql = ' ORDER BY featured DESC, rating DESC, id DESC'; // Default sort
      if (sort === 'newest') {
        orderSql = ' ORDER BY created_at DESC, id DESC';
      } else if (sort === 'experience') {
        orderSql = ' ORDER BY years_experience DESC, id DESC';
      } else if (sort === 'rating') {
        orderSql = ' ORDER BY rating DESC, id DESC';
      }

      // Pagination
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      const offset = (pageNum - 1) * limitNum;

      const selectSql = `SELECT * ${sql} ${orderSql} LIMIT ? OFFSET ?`;
      const selectParams = [...params, limitNum, offset];

      const creatorsQuery = db.prepare(selectSql);
      const creators = creatorsQuery.all(...selectParams).map(c => {
        // Parse JSON fields
        c.categories = JSON.parse(c.categories || '[]');
        c.equipment = JSON.parse(c.equipment || '[]');
        c.languages = JSON.parse(c.languages || '[]');
        return c;
      });

      const totalPages = Math.ceil(totalCount / limitNum);

      return sendJSON(res, {
        creators,
        totalCount,
        page: pageNum,
        totalPages
      });
    }

    // 2. GET /api/creators/:slug - Single Creator Profile
    if (pathname.startsWith('/api/creators/') && method === 'GET') {
      const slug = pathname.substring(14); // Remove "/api/creators/"
      if (!slug || slug.includes('/')) return nextRoute(res); // Ignore path traversals

      const creatorQuery = db.prepare('SELECT * FROM creators WHERE slug = ? AND status = "approved"');
      const creator = creatorQuery.get(slug);

      if (!creator) {
        return sendJSON(res, { error: 'Creator not found' }, 404);
      }

      creator.categories = JSON.parse(creator.categories || '[]');
      creator.equipment = JSON.parse(creator.equipment || '[]');
      creator.languages = JSON.parse(creator.languages || '[]');

      // Fetch reviews
      const reviewsQuery = db.prepare('SELECT * FROM reviews WHERE creator_id = ? AND status = "approved" ORDER BY created_at DESC');
      const reviews = reviewsQuery.all(creator.id);

      return sendJSON(res, { creator, reviews });
    }

    // 3. POST /api/creators/apply - Create Application
    if (pathname === '/api/creators/apply' && method === 'POST') {
      const body = await getRequestBody(req);
      const {
        fullName,
        email,
        phone,
        city,
        country,
        categories = [],
        yearsExperience = 0,
        equipment = [],
        languages = [],
        bio = '',
        instagram = '',
        portfolioUrl = '',
        behance = '',
        dribbble = '',
        youtube = '',
        vimeo = '',
        website = '',
        availability = 'available'
      } = body;

      if (!fullName || !email) {
        return sendJSON(res, { error: 'Full Name and Email are required' }, 400);
      }

      // Check if email already exists
      const checkEmail = db.prepare('SELECT id FROM creators WHERE email = ?');
      const existing = checkEmail.get(email);
      if (existing) {
        return sendJSON(res, { error: 'An application with this email already exists' }, 400);
      }

      const slug = generateUniqueSlug(fullName);

      const insertStmt = db.prepare(`
        INSERT INTO creators (
          slug, full_name, email, phone, city, country, categories, years_experience, 
          equipment, languages, bio, profile_image, cover_image, instagram, 
          portfolio_url, behance, dribbble, youtube, vimeo, website, availability, 
          verified, featured, status, rating
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pending', 5.0)
      `);

      // Use placeholder images
      const profile_image = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&h=300&fit=crop`;
      const cover_image = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&h=675&fit=crop`;

      const info = insertStmt.run(
        slug,
        fullName,
        email,
        phone || '',
        city || '',
        country || '',
        JSON.stringify(categories),
        parseInt(yearsExperience, 10) || 0,
        JSON.stringify(equipment),
        JSON.stringify(languages),
        bio || '',
        profile_image,
        cover_image,
        instagram || '',
        portfolioUrl || '',
        behance || '',
        dribbble || '',
        youtube || '',
        vimeo || '',
        website || '',
        availability
      );

      return sendJSON(res, { success: true, creatorId: info.lastInsertRowid, slug });
    }

    // 4. POST /api/inquiries - Submit general or creator inquiry
    if (pathname === '/api/inquiries' && method === 'POST') {
      const body = await getRequestBody(req);
      const { creatorId, name, email, projectDetails } = body;

      if (!name || !email || !projectDetails) {
        return sendJSON(res, { error: 'Name, email, and project details are required' }, 400);
      }

      const insertStmt = db.prepare(`
        INSERT INTO inquiries (creator_id, name, email, project_details, status) 
        VALUES (?, ?, ?, ?, 'new')
      `);

      const info = insertStmt.run(creatorId || null, name, email, projectDetails);

      return sendJSON(res, { success: true, inquiryId: info.lastInsertRowid });
    }

    // 5. POST /api/reviews - Clients post reviews (pending moderation)
    if (pathname === '/api/reviews' && method === 'POST') {
      const body = await getRequestBody(req);
      const { creatorId, clientName, rating, text } = body;

      if (!creatorId || !clientName || !rating || !text) {
        return sendJSON(res, { error: 'Creator ID, Client Name, Rating, and Review text are required' }, 400);
      }

      const insertStmt = db.prepare(`
        INSERT INTO reviews (creator_id, client_name, rating, text, status) 
        VALUES (?, ?, ?, ?, 'pending')
      `);

      const info = insertStmt.run(
        parseInt(creatorId, 10),
        clientName,
        parseFloat(rating) || 5.0,
        text
      );

      return sendJSON(res, { success: true, reviewId: info.lastInsertRowid });
    }

    // 6. GET /api/categories - Fetch categories list
    if (pathname === '/api/categories' && method === 'GET') {
      const listQuery = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM creators WHERE status="approved" AND categories LIKE "%" || c.slug || "%") as creator_count FROM categories c ORDER BY order_index ASC');
      const categories = listQuery.all();
      return sendJSON(res, categories);
    }

    // 7. GET /api/locations - Fetch locations list
    if (pathname === '/api/locations' && method === 'GET') {
      const listQuery = db.prepare('SELECT l.*, (SELECT COUNT(*) FROM creators WHERE status="approved" AND city = l.city) as creator_count FROM locations l ORDER BY order_index ASC');
      const locations = listQuery.all();
      return sendJSON(res, locations);
    }

    // ------------------------------------------------
    // ADMIN ENDPOINTS (Assuming Auth Passed/Scaffolded)
    // ------------------------------------------------

    // 8. GET /api/admin/creators - Full list of creators for dashboard
    if (pathname === '/api/admin/creators' && method === 'GET') {
      const listQuery = db.prepare('SELECT * FROM creators ORDER BY status = "pending" DESC, created_at DESC');
      const creators = listQuery.all().map(c => {
        c.categories = JSON.parse(c.categories || '[]');
        c.equipment = JSON.parse(c.equipment || '[]');
        c.languages = JSON.parse(c.languages || '[]');
        return c;
      });
      return sendJSON(res, creators);
    }

    // 9. POST /api/admin/creators/:id/approve - Approve creator application
    if (pathname.startsWith('/api/admin/creators/') && pathname.endsWith('/approve') && method === 'POST') {
      const idStr = pathname.split('/')[4];
      const id = parseInt(idStr, 10);
      
      const updateStmt = db.prepare('UPDATE creators SET status = "approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.run(id);

      return sendJSON(res, { success: true });
    }

    // 10. POST /api/admin/creators/:id/reject - Reject creator application
    if (pathname.startsWith('/api/admin/creators/') && pathname.endsWith('/reject') && method === 'POST') {
      const idStr = pathname.split('/')[4];
      const id = parseInt(idStr, 10);

      const updateStmt = db.prepare('UPDATE creators SET status = "rejected", updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.run(id);

      return sendJSON(res, { success: true });
    }

    // 11. PUT /api/admin/creators/:id - Edit Creator Profile
    if (pathname.startsWith('/api/admin/creators/') && method === 'PUT') {
      const idStr = pathname.split('/')[4];
      const id = parseInt(idStr, 10);
      const body = await getRequestBody(req);

      const {
        full_name,
        email,
        phone,
        city,
        country,
        categories = [],
        years_experience = 0,
        equipment = [],
        languages = [],
        bio = '',
        availability = 'available',
        verified = 0,
        featured = 0,
        rating = 5.0,
        internal_notes = ''
      } = body;

      const updateStmt = db.prepare(`
        UPDATE creators SET 
          full_name = ?, email = ?, phone = ?, city = ?, country = ?, 
          categories = ?, years_experience = ?, equipment = ?, languages = ?, 
          bio = ?, availability = ?, verified = ?, featured = ?, rating = ?, 
          internal_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateStmt.run(
        full_name,
        email,
        phone || '',
        city || '',
        country || '',
        JSON.stringify(categories),
        parseInt(years_experience, 10) || 0,
        JSON.stringify(equipment),
        JSON.stringify(languages),
        bio || '',
        availability,
        parseInt(verified, 10) ? 1 : 0,
        parseInt(featured, 10) ? 1 : 0,
        parseFloat(rating) || 5.0,
        internal_notes || '',
        id
      );

      return sendJSON(res, { success: true });
    }

    // 12. GET /api/admin/projects - Projects Pipeline
    if (pathname === '/api/admin/projects' && method === 'GET') {
      const projectsQuery = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
      const projects = projectsQuery.all().map(p => {
        p.assigned_creator_ids = JSON.parse(p.assigned_creator_ids || '[]');
        return p;
      });
      return sendJSON(res, projects);
    }

    // 13. POST /api/admin/projects - Create internal project assignment
    if (pathname === '/api/admin/projects' && method === 'POST') {
      const body = await getRequestBody(req);
      const { clientName, description, category, assignedCreatorIds = [], timeline, budget } = body;

      if (!clientName) {
        return sendJSON(res, { error: 'Client Name is required' }, 400);
      }

      const insertStmt = db.prepare(`
        INSERT INTO projects (client_name, description, category, assigned_creator_ids, status, timeline, budget) 
        VALUES (?, ?, ?, ?, 'assigned', ?, ?)
      `);

      const info = insertStmt.run(
        clientName,
        description || '',
        category || '',
        JSON.stringify(assignedCreatorIds),
        timeline || '',
        budget || ''
      );

      return sendJSON(res, { success: true, projectId: info.lastInsertRowid });
    }

    // 14. PUT /api/admin/projects/:id - Edit project assignment
    if (pathname.startsWith('/api/admin/projects/') && method === 'PUT') {
      const idStr = pathname.split('/')[4];
      const id = parseInt(idStr, 10);
      const body = await getRequestBody(req);

      const { client_name, description, category, assigned_creator_ids = [], status, timeline, budget } = body;

      const updateStmt = db.prepare(`
        UPDATE projects SET 
          client_name = ?, description = ?, category = ?, 
          assigned_creator_ids = ?, status = ?, timeline = ?, budget = ?
        WHERE id = ?
      `);

      updateStmt.run(
        client_name,
        description || '',
        category || '',
        JSON.stringify(assigned_creator_ids),
        status,
        timeline || '',
        budget || '',
        id
      );

      return sendJSON(res, { success: true });
    }

    // 15. GET /api/admin/reviews - Review Moderation Queue
    if (pathname === '/api/admin/reviews' && method === 'GET') {
      const reviewsQuery = db.prepare(`
        SELECT r.*, c.full_name as creator_name 
        FROM reviews r 
        JOIN creators c ON r.creator_id = c.id 
        ORDER BY r.status = 'pending' DESC, r.created_at DESC
      `);
      const reviews = reviewsQuery.all();
      return sendJSON(res, reviews);
    }

    // 16. POST /api/admin/reviews/:id/moderate - Moderate review
    if (pathname.startsWith('/api/admin/reviews/') && pathname.endsWith('/moderate') && method === 'POST') {
      const idStr = pathname.split('/')[4];
      const id = parseInt(idStr, 10);
      const body = await getRequestBody(req);
      const { status } = body; // 'approved' or 'hidden'

      if (!status || !['approved', 'hidden'].includes(status)) {
        return sendJSON(res, { error: 'Invalid status' }, 400);
      }

      const updateStmt = db.prepare('UPDATE reviews SET status = ? WHERE id = ?');
      updateStmt.run(status, id);

      return sendJSON(res, { success: true });
    }

    // 17. GET /api/admin/analytics - Dashboard stats
    if (pathname === '/api/admin/analytics' && method === 'GET') {
      const approvedCount = db.prepare('SELECT COUNT(*) as count FROM creators WHERE status="approved"').get().count;
      const pendingCount = db.prepare('SELECT COUNT(*) as count FROM creators WHERE status="pending"').get().count;
      const inquiryCount = db.prepare('SELECT COUNT(*) as count FROM inquiries').get().count;
      
      const categoryDistribution = db.prepare(`
        SELECT name, slug, (SELECT COUNT(*) FROM creators WHERE status="approved" AND categories LIKE "%" || slug || "%") as count 
        FROM categories
      `).all();

      const cityDistribution = db.prepare(`
        SELECT city, COUNT(*) as count FROM creators WHERE status="approved" GROUP BY city
      `).all();

      // Return premium analytical dashboard mock statistics combined with real DB counts
      return sendJSON(res, {
        stats: {
          approvedCreators: approvedCount,
          pendingApplications: pendingCount,
          totalInquiries: inquiryCount,
          profileViews: 1450 + approvedCount * 12, // simulated organic traffic
          conversionRate: inquiryCount > 0 ? ((inquiryCount / (1450 + approvedCount * 12)) * 100).toFixed(1) + '%' : '0.0%',
        },
        categoryDistribution,
        cityDistribution
      });
    }

    // 18. GET /api/admin/inquiries - List inquiries
    if (pathname === '/api/admin/inquiries' && method === 'GET') {
      const listQuery = db.prepare(`
        SELECT i.*, c.full_name as creator_name 
        FROM inquiries i
        LEFT JOIN creators c ON i.creator_id = c.id
        ORDER BY i.created_at DESC
      `);
      const inquiries = listQuery.all();
      return sendJSON(res, inquiries);
    }

    // Default 404 for unmatched /api paths
    return sendJSON(res, { error: 'API route not found' }, 404);

  } catch (error) {
    console.error('API Error:', error);
    return sendJSON(res, { error: error.message || 'Internal Server Error' }, 500);
  }
}

function nextRoute(res) {
  res.writeHead(404);
  res.end();
}
