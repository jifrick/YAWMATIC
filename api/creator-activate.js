const crypto = require('crypto');
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

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { token, email, password } = body || {};

    // 1. Mandatory token verification
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, message: 'Activation token is required. Missing or malformed token.' });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Account email is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = hashToken(token);

    // 2. Fetch target application record
    const { data: apps, ok: appOk } = await supabaseFetch(
      `/rest/v1/creator_applications?email=eq.${encodeURIComponent(cleanEmail)}&select=id,full_name,status,profile_data,auth_user_id`
    );

    if (!appOk || !apps || apps.length === 0) {
      return res.status(404).json({ success: false, message: 'No creator application found matching this email address.' });
    }

    const app = apps[0];

    // 3. Status checks
    if (app.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This creator account has been suspended by administration.' });
    }

    if (app.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Your application is not approved yet. Only approved creators can activate an account.' });
    }

    const pData = app.profile_data || {};

    // 4. Token validation against hashed token
    const storedHash = pData.activation_token_hash;
    const storedRaw = pData.activation_token;

    if (!storedHash && !storedRaw) {
      return res.status(400).json({ success: false, message: 'Activation link has already been used or was not generated. Please request a new link.' });
    }

    let isValidToken = false;
    if (storedHash && storedHash === tokenHash) {
      isValidToken = true;
    } else if (storedRaw && storedRaw === token.trim()) {
      isValidToken = true;
    }

    if (!isValidToken) {
      return res.status(400).json({ success: false, message: 'Invalid activation token. Please ensure you are using the exact link provided.' });
    }

    // 5. Expiry check
    if (pData.activation_token_expires_at) {
      const expiresAt = new Date(pData.activation_token_expires_at).getTime();
      if (Date.now() > expiresAt) {
        return res.status(400).json({ success: false, message: 'Activation link has expired (validity: 7 days). Please contact administration for a new activation link.' });
      }
    }

    // 6. Atomically invalidate token & activate profile_data
    delete pData.activation_token;
    delete pData.activation_token_hash;
    delete pData.activation_token_expires_at;
    pData.account_status = 'active';
    pData.activated_at = new Date().toISOString();
    pData.last_password_change_at = new Date().toISOString();

    const patchRes = await supabaseFetch(`/rest/v1/creator_applications?id=eq.${app.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    if (!patchRes.ok) {
      return res.status(500).json({ success: false, message: 'Failed to update account activation status.' });
    }

    // Return success authorization
    return res.status(200).json({
      success: true,
      message: 'Account activation verified and completed successfully.',
      creatorLoginId: pData.creator_login_id,
      fullName: app.full_name,
      appId: app.id
    });

  } catch (err) {
    console.error('[API creator-activate] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during account activation.' });
  }
};
