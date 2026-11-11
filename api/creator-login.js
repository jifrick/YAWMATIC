const https = require('https');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nopqslszbntoqewnemby.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vcHFzbHN6Ym50b3Fld25lbWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzI4ODEsImV4cCI6MjA5OTUwODg4MX0.cYeWIUVNQ85rWuj811UpAflUXHAixDR8C0_qSxlD4C4';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Persistent distributed rate limiting using DB RPC with resilient fallback
async function checkDistributedRateLimit(key, maxAttempts = 10, windowSecs = 60, blockSecs = 900) {
  const serviceKey = getServiceRoleKey();
  if (serviceKey) {
    try {
      const { data, ok } = await supabaseFetch('/rest/v1/rpc/check_and_record_rate_limit', {
        method: 'POST',
        body: {
          p_key: key,
          p_max_attempts: maxAttempts,
          p_window_seconds: windowSecs,
          p_block_duration_seconds: blockSecs
        }
      });
      if (ok && data) {
        return data; // { allowed: boolean, blocked?: boolean, retry_after_seconds?: number }
      }
    } catch (e) {
      // If table/rpc doesn't exist yet, fall back to in-memory protection
    }
  }

  // Resilient memory cache
  return memoryRateLimit(key, maxAttempts, windowSecs * 1000);
}

const memoryMap = new Map();
function memoryRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const timestamps = (memoryMap.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxAttempts) {
    return { allowed: false, blocked: true, retry_after_seconds: Math.ceil(windowMs / 1000) };
  }
  timestamps.push(now);
  memoryMap.set(key, timestamps);
  return { allowed: true, remaining: maxAttempts - timestamps.length };
}

function clearRateLimit(key) {
  memoryMap.delete(key);
  if (getServiceRoleKey()) {
    supabaseFetch('/rest/v1/rpc/reset_rate_limit', {
      method: 'POST',
      body: { p_key: key }
    }).catch(() => null);
  }
}

function supabaseFetch(path, options = {}) {
  const key = getServiceRoleKey();
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
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

function authenticateWithSupabase(email, password) {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/auth/v1/token?grant_type=password`);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ status: res.statusCode, ok: res.statusCode === 200, data });
        } catch (e) {
          resolve({ status: res.statusCode, ok: false, data: null });
        }
      });
    });

    req.on('error', () => resolve({ status: 500, ok: false, data: null }));
    req.write(JSON.stringify({ email, password }));
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // Fail closed if service role key is unconfigured
  if (!getServiceRoleKey()) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_MISCONFIGURED',
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'
    });
  }

  // 1. IP & ID Rate Limiting
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
  const ipCheck = await checkDistributedRateLimit(`ip:${clientIp}`, 10, 60, 900);
  if (!ipCheck.allowed) {
    return res.status(429).json({
      success: false,
      message: `Too many login attempts from this network. Please wait ${ipCheck.retry_after_seconds || 60} seconds before retrying.`
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { loginId, password } = body || {};

    if (!loginId || typeof loginId !== 'string' || !loginId.trim()) {
      return res.status(400).json({ success: false, message: 'Creator Login ID is required.' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    const normalizedId = loginId.trim().toUpperCase();

    // Check account-scoped rate limiting (prevents password brute forcing on single ID)
    const idCheck = await checkDistributedRateLimit(`id:${normalizedId}`, 5, 300, 1800);
    if (!idCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts for this Creator ID. Access temporarily blocked for 30 minutes.'
      });
    }

    // 2. Locate creator application matching Creator Login ID or legacy Member ID
    let matchedApp = null;
    const { data: appsByCid, ok: cidOk } = await supabaseFetch(
      `/rest/v1/creator_applications?profile_data->>creator_login_id=eq.${encodeURIComponent(normalizedId)}&select=id,email,status,profile_data,full_name`
    );

    if (cidOk && appsByCid && appsByCid.length > 0) {
      matchedApp = appsByCid[0];
    } else {
      const { data: appsByMid, ok: midOk } = await supabaseFetch(
        `/rest/v1/creator_applications?profile_data->>member_id=eq.${encodeURIComponent(normalizedId)}&select=id,email,status,profile_data,full_name`
      );
      if (midOk && appsByMid && appsByMid.length > 0) {
        matchedApp = appsByMid[0];
      }
    }

    // Generic error to prevent enumeration of existing vs non-existing IDs
    if (!matchedApp || !matchedApp.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Creator Login ID or password. Please verify your credentials.'
      });
    }

    // 3. Status checks
    const pData = matchedApp.profile_data || {};
    if (matchedApp.status === 'suspended' || pData.account_status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'This creator account has been suspended by administration. Please contact YAWMATIC.'
      });
    }

    if (matchedApp.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'This creator application is currently pending review or has not been approved.'
      });
    }

    // 4. Authenticate credentials with Supabase Auth
    const authResult = await authenticateWithSupabase(matchedApp.email, password);

    if (!authResult.ok || !authResult.data || !authResult.data.access_token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Creator Login ID or password. Please verify your credentials.'
      });
    }

    // 5. Successful login: clear rate limits
    clearRateLimit(`ip:${clientIp}`);
    clearRateLimit(`id:${normalizedId}`);

    // Update last_login_at in profile_data for audit logging
    pData.last_login_at = new Date().toISOString();
    supabaseFetch(`/rest/v1/creator_applications?id=eq.${matchedApp.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    }).catch(() => null);

    // 6. Return session tokens without exposing registered email
    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      creator: {
        id: matchedApp.id,
        loginId: normalizedId,
        fullName: matchedApp.full_name
      },
      session: {
        access_token: authResult.data.access_token,
        token_type: authResult.data.token_type || 'bearer',
        expires_in: authResult.data.expires_in,
        refresh_token: authResult.data.refresh_token,
        user: {
          id: authResult.data.user ? authResult.data.user.id : null,
          role: 'creator'
        }
      }
    });

  } catch (err) {
    console.error('[API creator-login] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during authentication.' });
  }
};
