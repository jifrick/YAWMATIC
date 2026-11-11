const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.TRANSACTIONAL_EMAIL_KEY;
const FROM_EMAIL = process.env.CREATOR_PORTAL_FROM_EMAIL || 'YAWMATIC Collective <collective@yawmatic.online>';
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

// Strictly verify administrator session & role from token
async function verifyAdminSessionAndRole(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'Authorization header missing or malformed.' };
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, configError: true, error: 'Server configuration missing SUPABASE_SERVICE_ROLE_KEY.' };
  }

  const token = authHeader.replace('Bearer ', '').trim();

  // 1. Authenticate user identity with Supabase Auth
  const user = await new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/auth/v1/user`);
    const req = https.request(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
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

  if (!user) {
    return { ok: false, error: 'Invalid or expired user session.' };
  }

  // 2. Query public.profiles to verify administrator role
  try {
    const { data: profile, ok } = await supabaseFetch(`/rest/v1/profiles?id=eq.${user.id}&select=id,role`);
    if (!ok || !profile || !profile[0]) {
      return { ok: false, error: 'No profile record found for user.' };
    }

    const role = profile[0].role;
    const allowedAdminRoles = ['super_admin', 'admin', 'project_manager', 'manager'];
    if (!allowedAdminRoles.includes(role)) {
      return { ok: false, error: `Access denied. Caller role '${role}' is not authorized as administrator.` };
    }

    return { ok: true, user, role };
  } catch (err) {
    return { ok: false, error: 'Error validating administrator permissions.' };
  }
}

function sendViaResend(to, subject, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text
    });

    const req = https.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(b);
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data });
        } catch (e) {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: b });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  // 1. Fail closed if SUPABASE_SERVICE_ROLE_KEY is unconfigured
  if (!getServiceRoleKey()) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_MISCONFIGURED',
      message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.'
    });
  }

  // 2. Strict administrator session and role verification
  const adminCheck = await verifyAdminSessionAndRole(req.headers.authorization);
  if (!adminCheck.ok) {
    return res.status(403).json({
      success: false,
      message: adminCheck.error || 'Access denied: Valid administrator credentials required.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { appId, activationUrl } = body || {};

    if (!appId) {
      return res.status(400).json({ success: false, message: 'Application ID (appId) is required.' });
    }

    // 3. Fetch application record using privileged client
    const { data: apps, ok: appOk } = await supabaseFetch(
      `/rest/v1/creator_applications?id=eq.${encodeURIComponent(appId)}&select=id,full_name,email,status,profile_data`
    );

    if (!appOk || !apps || apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application record not found.' });
    }

    const app = apps[0];

    // 4. Require approved application status
    if (app.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Cannot send activation email. Application status is '${app.status}'. Applications must be approved first.`
      });
    }

    const pData = app.profile_data || {};
    const creatorLoginId = pData.creator_login_id || pData.member_id || `YAW-CRE-${String(app.id).padStart(4, '0')}`;
    const targetEmail = app.email;

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Target creator has no valid email address on file.' });
    }

    // 5. Verify / sanitize activation URL
    let safeUrl = activationUrl;
    if (!safeUrl || !safeUrl.includes('/creator-activate')) {
      const token = pData.activation_token_hash || '';
      safeUrl = `https://yawmatic.online/creator-activate?email=${encodeURIComponent(targetEmail)}&cid=${encodeURIComponent(creatorLoginId)}&token=${encodeURIComponent(token)}`;
    }

    // 6. Check if transactional email provider key is configured
    if (!RESEND_API_KEY) {
      return res.status(200).json({
        success: false,
        missingConfig: true,
        message: 'RESEND_API_KEY is not configured in server environment. Activation link generated for manual delivery.',
        manualUrl: safeUrl,
        creatorLoginId,
        recipient: targetEmail
      });
    }

    // 7. Dispatch activation email
    const emailSubject = `Welcome to YAWMATIC Collective — Activate Your Account (${creatorLoginId})`;
    const emailBody = `Hello ${app.full_name},

Congratulations! Your application to join the YAWMATIC Collective has been approved by our curatorial team.

Your Creator Account Details:
- Creator Login ID: ${creatorLoginId}
- Associated Email: ${targetEmail}

Please click the secure activation link below to set your password and access your Creator Dashboard:
${safeUrl}

Important Notes:
1. This activation link is unique to your application and can only be used once.
2. The link will expire in 7 days.
3. Once activated, sign in to your Creator Dashboard using your Creator Login ID (${creatorLoginId}) and password at:
https://yawmatic.online/creator-login

Welcome to the collective!

Best regards,
YAWMATIC Collective Team
https://yawmatic.online`;

    const resendResult = await sendViaResend(targetEmail, emailSubject, emailBody);

    if (!resendResult.ok) {
      console.error('[send-activation-email] Resend API error:', resendResult.data);
      return res.status(502).json({
        success: false,
        message: 'Email service provider rejected the delivery request.',
        details: resendResult.data
      });
    }

    // 8. Record audit timestamp on application profile_data
    pData.invitation_sent_at = new Date().toISOString();
    pData.email_dispatch_id = resendResult.data && resendResult.data.id ? resendResult.data.id : null;

    await supabaseFetch(`/rest/v1/creator_applications?id=eq.${app.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { profile_data: pData }
    });

    return res.status(200).json({
      success: true,
      message: `Activation email successfully dispatched to ${targetEmail}.`,
      dispatchId: pData.email_dispatch_id,
      creatorLoginId
    });

  } catch (err) {
    console.error('[API send-activation-email] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error dispatching activation email.' });
  }
};
