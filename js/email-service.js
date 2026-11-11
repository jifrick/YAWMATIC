/**
 * YAWMATIC — Web3Forms Centralized Email Dispatch Service
 * Official API Endpoint: https://api.web3forms.com/submit
 * Verified Recipient: yawmatic.in@gmail.com
 */

const WEB3FORMS_CONFIG = {
  endpoint: 'https://api.web3forms.com/submit',
  accessKey: '43189427-c23a-4e86-9c89-6a1044794528',
  defaultFromName: 'YAWMATIC Website'
};

/**
 * Send an email via Web3Forms
 * @param {Object} options
 * @param {string} options.subject - Email subject line
 * @param {string} [options.fromName] - Sender display name
 * @param {string} [options.replyTo] - Submitter email address for reply routing
 * @param {string} [options.botcheck] - Honeypot field value (must be empty)
 * @param {Object} options.data - Key-value map of human-readable form data
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function sendWeb3FormsEmail({
  subject,
  fromName = WEB3FORMS_CONFIG.defaultFromName,
  replyTo,
  botcheck = '',
  data = {}
}) {
  // Honeypot check: If bot filled this field, silently reject
  if (botcheck && botcheck.trim() !== '') {
    console.warn('[Web3Forms] Bot submission rejected via honeypot.');
    return { success: false, message: 'Spam detected.' };
  }

  // Construct submission payload
  const payload = {
    access_key: WEB3FORMS_CONFIG.accessKey,
    subject: subject || 'YAWMATIC Website Submission',
    from_name: fromName,
    ...data
  };

  if (replyTo && replyTo.trim()) {
    payload['replyto'] = replyTo.trim();
  }

  try {
    const response = await fetch(WEB3FORMS_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.success) {
      return { success: true, message: result.message || 'Email sent successfully.' };
    } else {
      console.warn('[Web3Forms] Error dispatching email:', result);
      return {
        success: false,
        message: result.message || `Submission failed with status ${response.status}`
      };
    }
  } catch (err) {
    console.error('[Web3Forms] Network/fetch error:', err);
    return { success: false, message: err.message || 'Network error' };
  }
}

// Expose globally for vanilla scripts
window.YawmaticEmailService = {
  send: sendWeb3FormsEmail,
  config: WEB3FORMS_CONFIG
};
