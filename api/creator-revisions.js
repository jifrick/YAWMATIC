const https = require('https');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nopqslszbntoqewnemby.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseFetch(path, options = {}) {
  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    return Promise.reject(new Error('SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'));
  }

  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const headers = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
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
    const serviceKey = getServiceRoleKey() || '';
    const req = https.request(url, {
      headers: {
        'apikey': serviceKey,
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

  // Fail closed if service role key is not configured
  if (!getServiceRoleKey()) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_MISCONFIGURED',
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'
    });
  }

  // 1. Authenticate user session
  const authUser = await verifyUserSession(req.headers.authorization);
  if (!authUser || !authUser.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Authenticated session required.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { revisionType, data } = body || {};

    const allowedRevisionTypes = ['profile', 'craft', 'rig', 'showcase'];
    if (!revisionType || !allowedRevisionTypes.includes(revisionType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid revisionType. Allowed types: ${allowedRevisionTypes.join(', ')}.`
      });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Missing revision payload data.' });
    }

    // 2. Derive creator identity exclusively from verified session (Never trust client-supplied ID)
    const { data: records, ok: queryOk } = await supabaseFetch(
      `/rest/v1/creator_applications?or=(email.eq.${encodeURIComponent(authUser.email)},profile_data->>auth_user_id.eq.${authUser.id})&select=id,full_name,email,status,profile_data,portfolio_links`
    );

    if (!queryOk || !records || records.length === 0) {
      return res.status(404).json({ success: false, message: 'No creator application found matching this authenticated user.' });
    }

    const appRecord = records[0];

    // 3. Require account to be approved and active
    if (appRecord.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Application is not approved.' });
    }

    const pData = appRecord.profile_data || {};
    if (pData.account_status === 'suspended' || appRecord.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This creator account is suspended.' });
    }

    // 4. Sanitize and validate based on explicit allowlist (Strip all privileged fields)
    let sanitizedProposed = {};

    if (revisionType === 'profile') {
      sanitizedProposed = {
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
      pData.pending_profile_revision = sanitizedProposed;

    } else if (revisionType === 'craft') {
      sanitizedProposed = {
        primary_specialization: (data.primary_specialization || '').slice(0, 80).trim(),
        additional_skills: Array.isArray(data.additional_skills)
          ? data.additional_skills.map(s => String(s).slice(0, 50).trim()).filter(Boolean)
          : [],
        submitted_at: new Date().toISOString()
      };
      pData.pending_craft_revision = sanitizedProposed;

    } else if (revisionType === 'rig') {
      sanitizedProposed = {
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
      pData.pending_rig_revision = sanitizedProposed;

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
      sanitizedProposed = newItem;

      await supabaseFetch(`/rest/v1/creator_applications?id=eq.${appRecord.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { portfolio_links: showcaseItems }
      });
    }

    // 5. Insert revision entry into dedicated creator_revisions table
    await supabaseFetch(`/rest/v1/creator_revisions`, {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: {
        application_id: appRecord.id,
        user_id: authUser.id,
        revision_type: revisionType,
        proposed_data: sanitizedProposed,
        status: 'pending'
      }
    }).catch(() => null);

    // 6. Stage revision within profile_data for dashboard & admin visibility
    await supabaseFetch(`/rest/v1/creator_applications?id=eq.${appRecord.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    return res.status(200).json({
      success: true,
      message: 'Revision successfully staged for administrator moderation.',
      revisionType
    });

  } catch (err) {
    console.error('[API creator-revisions] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error staging revision.' });
  }
};
