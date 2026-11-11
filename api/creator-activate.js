const crypto = require('crypto');
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

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

// Securely provisions or updates the user in Supabase Auth via Admin API
async function provisionAuthUser(email, password) {
  // Check if user already exists in auth.users
  const listRes = await supabaseFetch(`/auth/v1/admin/users?page=1&per_page=50`, {
    method: 'GET'
  }).catch(() => null);

  let existingUser = null;
  if (listRes && listRes.ok && listRes.data && Array.isArray(listRes.data.users)) {
    existingUser = listRes.data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  }

  if (existingUser) {
    // Update existing user password and confirmed status
    const updateRes = await supabaseFetch(`/auth/v1/admin/users/${existingUser.id}`, {
      method: 'PUT',
      body: {
        password: password,
        email_confirm: true,
        user_metadata: { role: 'creator' }
      }
    });

    if (!updateRes.ok) {
      throw new Error((updateRes.data && updateRes.data.message) || 'Failed to update user password in authentication provider.');
    }
    return existingUser.id;
  } else {
    // Create new confirmed auth user
    const createRes = await supabaseFetch(`/auth/v1/admin/users`, {
      method: 'POST',
      body: {
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'creator' }
      }
    });

    if (!createRes.ok || !createRes.data || !createRes.data.id) {
      throw new Error((createRes.data && createRes.data.message) || 'Failed to create user account in authentication provider.');
    }
    return createRes.data.id;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // Fail closed if server service-role key is unconfigured
  if (!getServiceRoleKey()) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_MISCONFIGURED',
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { token, email, password } = body || {};

    // 1. Mandatory token, email, password validation
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
      `/rest/v1/creator_applications?email=eq.${encodeURIComponent(cleanEmail)}&select=id,full_name,status,profile_data`
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

    // 4. Token validation: check dedicated creator_activation_tokens table first
    const { data: tokenRows, ok: tokenQueryOk } = await supabaseFetch(
      `/rest/v1/creator_activation_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,application_id,expires_at,used_at`
    );

    let matchedTokenRecord = null;
    if (tokenQueryOk && Array.isArray(tokenRows) && tokenRows.length > 0) {
      matchedTokenRecord = tokenRows[0];
    }

    if (matchedTokenRecord) {
      // Bound to this specific application
      if (String(matchedTokenRecord.application_id) !== String(app.id)) {
        return res.status(400).json({ success: false, message: 'Activation token does not belong to this creator application.' });
      }

      // Check if already used
      if (matchedTokenRecord.used_at) {
        return res.status(400).json({ success: false, message: 'This activation token has already been used. Please request a new link.' });
      }

      // Check if expired
      const expiresAt = new Date(matchedTokenRecord.expires_at).getTime();
      if (Date.now() > expiresAt) {
        return res.status(400).json({ success: false, message: 'This activation token has expired. Please contact administration for a new link.' });
      }
    } else {
      // Check profile_data fallback for hashed token (strictly rejecting raw tokens)
      const pData = app.profile_data || {};
      const storedHash = pData.activation_token_hash;

      if (!storedHash || storedHash !== tokenHash) {
        return res.status(400).json({ success: false, message: 'Invalid activation token. Please ensure you are using the exact link provided.' });
      }

      if (pData.activation_token_expires_at) {
        const expiresAt = new Date(pData.activation_token_expires_at).getTime();
        if (Date.now() > expiresAt) {
          return res.status(400).json({ success: false, message: 'Activation link has expired. Please contact administration for a new link.' });
        }
      }
    }

    // 5. Provision / update Supabase Auth user BEFORE consuming token
    // (If auth fails, token remains valid and account is NOT marked active)
    let authUserId;
    try {
      authUserId = await provisionAuthUser(cleanEmail, password);
    } catch (authErr) {
      console.error('[API creator-activate] Auth provisioning failure:', authErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to provision user credentials with authentication provider. Please try again.'
      });
    }

    // 6. Atomically consume token and update creator account to active
    const nowIso = new Date().toISOString();

    // Invalidate in dedicated table
    if (matchedTokenRecord) {
      await supabaseFetch(`/rest/v1/creator_activation_tokens?id=eq.${matchedTokenRecord.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { used_at: nowIso }
      });
    }

    // Update application record
    const pData = app.profile_data || {};
    delete pData.activation_token;
    delete pData.activation_token_hash;
    delete pData.activation_token_expires_at;
    pData.account_status = 'active';
    pData.activated_at = nowIso;
    pData.auth_user_id = authUserId;
    pData.last_password_change_at = nowIso;

    const patchRes = await supabaseFetch(`/rest/v1/creator_applications?id=eq.${app.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    if (!patchRes.ok) {
      return res.status(500).json({ success: false, message: 'Failed to update account activation status.' });
    }

    // Also update public.profiles role to 'creator'
    await supabaseFetch(`/rest/v1/profiles?id=eq.${authUserId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { role: 'creator', full_name: app.full_name }
    }).catch(() => null);

    return res.status(200).json({
      success: true,
      message: 'Account activation verified and completed successfully.',
      creatorLoginId: pData.creator_login_id,
      fullName: app.full_name,
      appId: app.id,
      authUserId
    });

  } catch (err) {
    console.error('[API creator-activate] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during account activation.' });
  }
};
