const https = require('https');

const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.TRANSACTIONAL_EMAIL_KEY;
const FROM_EMAIL = process.env.CREATOR_PORTAL_FROM_EMAIL || 'YAWMATIC Collective <collective@yawmatic.online>';
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

function verifyAdminSession(authHeader) {
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

  // 1. Verify administrator session
  const adminUser = await verifyAdminSession(req.headers.authorization);
  if (!adminUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin session required.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { appId, activationUrl } = body || {};

    if (!appId) {
      return res.status(400).json({ success: false, message: 'Application ID is required.' });
    }

    // 2. Fetch application record
    const { data: apps, ok: appOk } = await supabaseFetch(
      `/rest/v1/creator_applications?id=eq.${encodeURIComponent(appId)}&select=id,full_name,email,status,profile_data`
    );

    if (!appOk || !apps || apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application record not found.' });
    }

    const app = apps[0];
    const pData = app.profile_data || {};
    const creatorLoginId = pData.creator_login_id || `YAW-CRE-${String(app.id).padStart(4, '0')}`;

    // Verify email credentials exist
    if (!RESEND_API_KEY) {
      return res.status(200).json({
        success: false,
        missingConfig: true,
        message: 'RESEND_API_KEY is not configured in server environment variables. Automated email delivery skipped. Provide activation URL directly to candidate.'
      });
    }

    // 3. Compose email
    const subject = 'YAWMATIC Collective — Your Creator Account Is Approved';
    const textBody = `Hello ${app.full_name},

Your application to join YAWMATIC Collective has been approved.

Welcome to the YAWMATIC creative network.

Your Creator Login ID:
${creatorLoginId}

Activate your account using the secure link below:
${activationUrl}

After opening the activation link:
1. Verify your account.
2. Create your own password.
3. Confirm your password.
4. Complete your creator profile.
5. Log in using your Creator ID and password.

Login Page:
https://yawmatic.online/creator-login

Your account gives you access to your private Creator Dashboard, where you can update your professional bio, skills, portfolio links, equipment details, and other permitted profile information.

Your profile changes will be reviewed and approved by YAWMATIC administrators before appearing publicly.

Thank you,
YAWMATIC Team`;

    // 4. Dispatch via Resend
    const result = await sendViaResend(app.email, subject, textBody);

    if (result.ok) {
      // Record acceptance
      pData.invitation_email_status = 'accepted';
      pData.invitation_email_id = (result.data && result.data.id) || null;
      pData.invitation_sent_at = new Date().toISOString();

      await supabaseFetch(`/rest/v1/creator_applications?id=eq.${app.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { profile_data: pData }
      });

      return res.status(200).json({
        success: true,
        message: 'Activation email accepted by provider and dispatched to applicant.',
        emailId: (result.data && result.data.id) || null
      });
    } else {
      return res.status(502).json({
        success: false,
        message: (result.data && result.data.message) || 'Email provider rejected delivery request.'
      });
    }

  } catch (err) {
    console.error('[API send-activation-email] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error dispatching activation email.' });
  }
};
