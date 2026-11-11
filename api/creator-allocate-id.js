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

async function verifyAdminRole(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.replace('Bearer ', '').trim();

  // 1. Get user identity
  const user = await new Promise(resolve => {
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
          const u = JSON.parse(b);
          if (res.statusCode === 200 && u && u.id) resolve(u);
          else resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });

  if (!user) return false;

  // 2. Check profile role
  try {
    const { data: profiles, ok } = await supabaseFetch(`/rest/v1/profiles?id=eq.${user.id}&select=role`);
    if (!ok || !profiles || !profiles[0]) return false;
    const role = profiles[0].role;
    return ['super_admin', 'admin', 'project_manager', 'manager'].includes(role);
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // Fail closed if service role key is missing
  if (!getServiceRoleKey()) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_MISCONFIGURED',
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'
    });
  }

  // Administrator authorization verification
  const isAdmin = await verifyAdminRole(req.headers.authorization);
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: 'Access denied: Administrator authorization required.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { appId } = body || {};

    if (!appId) {
      return res.status(400).json({ success: false, message: 'Application ID is required.' });
    }

    // 1. Fetch application record
    const { data: apps, ok: appOk } = await supabaseFetch(
      `/rest/v1/creator_applications?id=eq.${encodeURIComponent(appId)}&select=id,profile_data,status`
    );

    if (!appOk || !apps || apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application record not found.' });
    }

    const app = apps[0];
    const pData = app.profile_data || {};

    // 2. Idempotency: If already has Creator Login ID, return existing
    if (pData.creator_login_id && /^YAW-CRE-\d+$/i.test(pData.creator_login_id)) {
      return res.status(200).json({
        success: true,
        creatorLoginId: pData.creator_login_id,
        isExisting: true
      });
    }

    // 3. Attempt DB-side atomic generator RPC first
    let allocatedId = null;
    try {
      const rpcRes = await supabaseFetch('/rest/v1/rpc/generate_next_creator_login_id', {
        method: 'POST'
      });
      if (rpcRes.ok && rpcRes.data && typeof rpcRes.data === 'string') {
        allocatedId = rpcRes.data;
      }
    } catch (e) {
      // RPC may not be present in migration cache yet
    }

    // 4. Server-side atomic collision-free allocation fallback
    if (!allocatedId) {
      const { data: existingApps } = await supabaseFetch(
        '/rest/v1/creator_applications?select=profile_data'
      );

      let maxNum = 1; // Start sequence after YAW-CRE-0001
      if (Array.isArray(existingApps)) {
        for (const row of existingApps) {
          const cid = (row.profile_data && row.profile_data.creator_login_id) || '';
          const match = cid.match(/YAW-CRE-(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      allocatedId = `YAW-CRE-${String(maxNum + 1).padStart(4, '0')}`;
    }

    // 5. Update application profile_data
    pData.creator_login_id = allocatedId;
    await supabaseFetch(`/rest/v1/creator_applications?id=eq.${app.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    return res.status(200).json({
      success: true,
      creatorLoginId: allocatedId,
      isExisting: false
    });

  } catch (err) {
    console.error('[API creator-allocate-id] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error allocating Creator Login ID.' });
  }
};
