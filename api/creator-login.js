const https = require('https');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nopqslszbntoqewnemby.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vcHFzbHN6Ym50b3Fld25lbWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzI4ODEsImV4cCI6MjA5OTUwODg4MX0.cYeWIUVNQ85rWuj811UpAflUXHAixDR8C0_qSxlD4C4';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// In-memory rate limiting map (IP -> timestamps)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS_PER_WINDOW = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

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

  // Rate limiting check
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ success: false, message: 'Too many login attempts. Please wait a minute and try again.' });
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

    // 1. Resolve Creator Identity server-side by Login ID without exposing registered email to client
    const { data: records, ok: queryOk } = await supabaseFetch(
      `/rest/v1/creator_applications?profile_data->>creator_login_id=eq.${encodeURIComponent(normalizedId)}&select=id,email,status,profile_data,full_name`
    );

    let matchedApp = null;
    if (queryOk && records && records.length > 0) {
      matchedApp = records[0];
    } else {
      // Legacy fallback check on member_id (e.g. YWC-2026-0005)
      const { data: legacyRecords } = await supabaseFetch(
        `/rest/v1/creator_applications?profile_data->>member_id=eq.${encodeURIComponent(normalizedId)}&select=id,email,status,profile_data,full_name`
      );
      if (legacyRecords && legacyRecords.length > 0) {
        matchedApp = legacyRecords[0];
      }
    }

    // Generic error to prevent identifier enumeration
    if (!matchedApp || !matchedApp.email) {
      return res.status(401).json({ success: false, message: 'Invalid Creator Login ID or password. Please verify credentials.' });
    }

    // Status validations
    if (matchedApp.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This creator account has been suspended by administration. Please contact YAWMATIC support.' });
    }

    if (matchedApp.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Your application is still under review or pending administrator approval.' });
    }

    // 2. Perform authentication with Supabase Auth
    const authResult = await authenticateWithSupabase(matchedApp.email, password);

    if (!authResult.ok || !authResult.data || !authResult.data.access_token) {
      return res.status(401).json({ success: false, message: 'Invalid Creator Login ID or password. Please verify credentials.' });
    }

    // 3. Update last login timestamp in profile_data for audit trail
    const pData = matchedApp.profile_data || {};
    pData.last_login_at = new Date().toISOString();
    supabaseFetch(`/rest/v1/creator_applications?id=eq.${matchedApp.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    }).catch(() => {});

    // 4. Return authentication session tokens without exposing registered email address
    return res.status(200).json({
      success: true,
      session: {
        access_token: authResult.data.access_token,
        refresh_token: authResult.data.refresh_token,
        expires_in: authResult.data.expires_in,
        expires_at: authResult.data.expires_at,
        token_type: authResult.data.token_type,
        user: {
          id: authResult.data.user ? authResult.data.user.id : null,
          creator_login_id: normalizedId,
          full_name: matchedApp.full_name
        }
      }
    });

  } catch (err) {
    console.error('[API creator-login] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during authentication.' });
  }
};
