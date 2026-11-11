const https = require('https');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nopqslszbntoqewnemby.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vcHFzbHN6Ym50b3Fld25lbWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzI4ODEsImV4cCI6MjA5OTUwODg4MX0.cYeWIUVNQ85rWuj811UpAflUXHAixDR8C0_qSxlD4C4';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

function supabaseFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const headers = {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const req = https.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function verifyUserSession(authHeader) {
  return new Promise((resolve) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return resolve(null);
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const url = new URL(`${SUPABASE_URL}/auth/v1/user`);
    const req = https.request(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const user = JSON.parse(b);
          if (res.statusCode === 200 && user && user.id) {
            resolve(user);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // 1. Authenticate user session
  const authUser = await verifyUserSession(req.headers.authorization);
  if (!authUser || !authUser.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Authenticated session required.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { revisionType, data } = body || {};

    if (!revisionType || !data) {
      return res.status(400).json({ success: false, message: 'Missing revisionType or payload data.' });
    }

    // 2. Locate creator application belonging to this user
    const { data: records, ok: queryOk } = await supabaseFetch(
      `/rest/v1/creator_applications?or=(auth_user_id.eq.${authUser.id},email.eq.${encodeURIComponent(authUser.email)})&select=id,profile_data,portfolio_links`
    );

    if (!queryOk || !records || records.length === 0) {
      return res.status(404).json({ success: false, message: 'No creator application linked to this authenticated user.' });
    }

    const appRecord = records[0];
    const pData = appRecord.profile_data || {};

    // 3. Process sanitized revision based on type
    if (revisionType === 'profile') {
      const sanitized = {
        full_name: (data.full_name || '').slice(0, 100).trim(),
        city: (data.city || '').slice(0, 50).trim(),
        country: (data.country || '').slice(0, 50).trim(),
        bio: (data.bio || '').slice(0, 1000).trim(),
        portfolio_url: (data.portfolio_url || '').slice(0, 255).trim(),
        instagram: (data.instagram || '').slice(0, 100).trim(),
        behance: (data.behance || '').slice(0, 255).trim(),
        dribbble: (data.dribbble || '').slice(0, 255).trim(),
        github: (data.github || '').slice(0, 255).trim(),
        linkedin: (data.linkedin || '').slice(0, 255).trim(),
        submitted_at: new Date().toISOString()
      };
      pData.pending_profile_revision = sanitized;

    } else if (revisionType === 'craft') {
      const sanitized = {
        primary_specialization: (data.primary_specialization || '').slice(0, 80).trim(),
        additional_skills: Array.isArray(data.additional_skills)
          ? data.additional_skills.map(s => String(s).slice(0, 50).trim()).filter(Boolean)
          : [],
        submitted_at: new Date().toISOString()
      };
      pData.pending_craft_revision = sanitized;

    } else if (revisionType === 'rig') {
      const sanitized = {
        years_experience: Math.min(Math.max(parseInt(data.years_experience, 10) || 1, 0), 50),
        availability: ['available', 'limited', 'booked'].includes(data.availability) ? data.availability : 'available',
        equipment: Array.isArray(data.equipment)
          ? data.equipment.map(e => String(e).slice(0, 100).trim()).filter(Boolean)
          : [],
        languages: Array.isArray(data.languages)
          ? data.languages.map(l => String(l).slice(0, 50).trim()).filter(Boolean)
          : [],
        submitted_at: new Date().toISOString()
      };
      pData.pending_rig_revision = sanitized;

    } else if (revisionType === 'showcase') {
      let showcaseItems = [];
      if (Array.isArray(appRecord.portfolio_links)) showcaseItems = [...appRecord.portfolio_links];
      else if (typeof appRecord.portfolio_links === 'string') {
        try { showcaseItems = JSON.parse(appRecord.portfolio_links) || []; } catch(e){}
      }

      const newItem = {
        title: (data.title || 'Untitled Project').slice(0, 100).trim(),
        type: data.type === 'video' ? 'video' : 'image',
        url: (data.url || '').slice(0, 500).trim(),
        wide: Boolean(data.wide),
        approved: false, // Mandatory: unapproved until vetted by Admin
        submitted_at: new Date().toISOString()
      };

      showcaseItems.push(newItem);

      await supabaseFetch(`/rest/v1/creator_applications?id=eq.${appRecord.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { portfolio_links: showcaseItems }
      });

      return res.status(200).json({ success: true, message: 'Showcase item staged for admin moderation.' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid revisionType.' });
    }

    // Update profile_data with the staged revision
    await supabaseFetch(`/rest/v1/creator_applications?id=eq.${appRecord.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    return res.status(200).json({ success: true, message: 'Revision staged for administrator review.' });

  } catch (err) {
    console.error('[API creator-revisions] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error staging revision.' });
  }
};
