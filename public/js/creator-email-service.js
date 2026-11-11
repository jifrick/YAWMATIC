/**
 * YAWMATIC COLLECTIVE — Creator Transactional Email Delivery Gateway
 * 
 * Supports:
 * - Resend API (via process.env / window.YAWMATIC_RESEND_KEY or Supabase Edge Function)
 * - Safe graceful reporting if transactional credentials are not yet configured in environment.
 * 
 * NOTE: As per security requirements, never falsely report emails as sent if credentials are missing.
 */

const CREATOR_EMAIL_CONFIG = {
  fromAddress: 'YAWMATIC Collective <collective@yawmatic.online>',
  fallbackAdminRecipient: 'yawmatic.in@gmail.com'
};

/**
 * Interface to send the Creator Account Activation Email
 * @param {Object} params
 * @param {string} params.creatorName - Name of the creator
 * @param {string} params.creatorEmail - Recipient email address
 * @param {string} params.creatorLoginId - Assigned login ID (e.g. YAW-CRE-0001)
 * @param {string} params.activationUrl - One-time activation URL
 * @returns {Promise<{success: boolean, message: string, simulated?: boolean}>}
 */
async function sendCreatorActivationEmail({ creatorName, creatorEmail, creatorLoginId, activationUrl }) {
  const emailSubject = 'YAWMATIC Collective — Your Creator Account Is Approved';
  
  const textBody = `Hello ${creatorName},

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

  // Check if Resend or transactional key is available in runtime
  const apiKey = (typeof process !== 'undefined' && process.env && (process.env.RESEND_API_KEY || process.env.TRANSACTIONAL_EMAIL_KEY))
    || (typeof window !== 'undefined' && window.YAWMATIC_TRANSACTIONAL_KEY);

  if (!apiKey) {
    console.warn('[CreatorEmailGateway] No transactional email provider key configured in runtime environment.');
    return {
      success: false,
      missingConfig: true,
      message: 'Transactional email provider key not configured in environment (RESEND_API_KEY / TRANSACTIONAL_EMAIL_KEY). Provide activation link directly to applicant or configure transactional email credentials.'
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CREATOR_EMAIL_CONFIG.fromAddress,
        to: [creatorEmail],
        subject: emailSubject,
        text: textBody
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { success: true, message: 'Activation email delivered successfully to candidate.' };
    } else {
      return { success: false, message: data.message || `Delivery error (Status ${res.status})` };
    }
  } catch (err) {
    return { success: false, message: err.message || 'Network error delivering email.' };
  }
}

// Global exposure
if (typeof window !== 'undefined') {
  window.CreatorEmailGateway = {
    sendActivation: sendCreatorActivationEmail
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sendCreatorActivationEmail };
}
