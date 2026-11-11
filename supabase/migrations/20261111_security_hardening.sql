-- ==============================================================================
-- YAWMATIC COLLECTIVE: PRODUCTION SECURITY HARDENING & ISOLATION MIGRATION (V2)
-- Migration: 20261111_security_hardening.sql
-- ==============================================================================

-- 1. Create a dedicated sequence for atomic, concurrent-safe Creator Login IDs
CREATE SEQUENCE IF NOT EXISTS public.creator_login_id_seq START WITH 2;

-- 2. Dedicated Table: creator_activation_tokens
-- Stores cryptographically hashed tokens, single-use states, expiration, and application binding
CREATE TABLE IF NOT EXISTS public.creator_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id BIGINT NOT NULL REFERENCES public.creator_applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_tokens_app_id ON public.creator_activation_tokens(application_id);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_hash ON public.creator_activation_tokens(token_hash);

-- Enable RLS on creator_activation_tokens (Access restricted strictly to service role and admins)
ALTER TABLE public.creator_activation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage activation tokens" ON public.creator_activation_tokens;
CREATE POLICY "Admins manage activation tokens" ON public.creator_activation_tokens
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. Dedicated Table: creator_revisions
-- Separates creator-submitted edits from live profile data; requires admin approval
CREATE TABLE IF NOT EXISTS public.creator_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id BIGINT NOT NULL REFERENCES public.creator_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_type TEXT NOT NULL CHECK (revision_type IN ('profile', 'craft', 'rig', 'showcase')),
  proposed_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_feedback TEXT DEFAULT NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_revisions_app ON public.creator_revisions(application_id);
CREATE INDEX IF NOT EXISTS idx_creator_revisions_status ON public.creator_revisions(status);
CREATE INDEX IF NOT EXISTS idx_creator_revisions_user ON public.creator_revisions(user_id);

ALTER TABLE public.creator_revisions ENABLE ROW LEVEL SECURITY;

-- Creator can insert and view their own revisions
DROP POLICY IF EXISTS "Creators view own revisions" ON public.creator_revisions;
CREATE POLICY "Creators view own revisions" ON public.creator_revisions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Creators submit revisions" ON public.creator_revisions;
CREATE POLICY "Creators submit revisions" ON public.creator_revisions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage revisions" ON public.creator_revisions;
CREATE POLICY "Admins manage revisions" ON public.creator_revisions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. Dedicated Table: login_rate_limits
-- Persistent distributed rate limiting for serverless auth endpoints
CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  key TEXT PRIMARY KEY, -- e.g. "ip:192.168.1.1" or "id:YAW-CRE-0001"
  attempts INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON public.login_rate_limits(blocked_until);

ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
-- login_rate_limits is accessible only via service-role / security-definer RPC functions

-- 5. Atomic Function: generate_next_creator_login_id()
-- Guarantees atomic, non-colliding sequential generation format: YAW-CRE-0001
CREATE OR REPLACE FUNCTION public.generate_next_creator_login_id()
RETURNS TEXT AS $$
DECLARE
  v_next_val BIGINT;
  v_login_id TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_next_val := nextval('public.creator_login_id_seq');
    v_login_id := 'YAW-CRE-' || LPAD(v_next_val::TEXT, 4, '0');
    
    -- Verify no collision in existing records
    SELECT EXISTS (
      SELECT 1 FROM public.creator_applications 
      WHERE (profile_data->>'creator_login_id') = v_login_id
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      RETURN v_login_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 6. Rate Limit Enforcer Function
CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(
  p_key TEXT,
  p_max_attempts INT DEFAULT 10,
  p_window_seconds INT DEFAULT 60,
  p_block_duration_seconds INT DEFAULT 900 -- 15 mins
)
RETURNS JSONB AS $$
DECLARE
  v_rec RECORD;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_window_start TIMESTAMP WITH TIME ZONE := v_now - (p_window_seconds || ' seconds')::INTERVAL;
BEGIN
  SELECT * INTO v_rec FROM public.login_rate_limits WHERE key = p_key;

  IF FOUND THEN
    -- Check if currently blocked
    IF v_rec.blocked_until IS NOT NULL AND v_rec.blocked_until > v_now THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'blocked', true,
        'retry_after_seconds', EXTRACT(EPOCH FROM (v_rec.blocked_until - v_now))::INT
      );
    END IF;

    -- If past window, reset count
    IF v_rec.last_attempt_at < v_window_start THEN
      UPDATE public.login_rate_limits
      SET attempts = 1, first_attempt_at = v_now, last_attempt_at = v_now, blocked_until = NULL
      WHERE key = p_key;
      RETURN jsonb_build_object('allowed', true, 'remaining', p_max_attempts - 1);
    ELSE
      -- Within window: increment
      IF v_rec.attempts + 1 > p_max_attempts THEN
        UPDATE public.login_rate_limits
        SET attempts = v_rec.attempts + 1, last_attempt_at = v_now,
            blocked_until = v_now + (p_block_duration_seconds || ' seconds')::INTERVAL
        WHERE key = p_key;
        RETURN jsonb_build_object(
          'allowed', false,
          'blocked', true,
          'retry_after_seconds', p_block_duration_seconds
        );
      ELSE
        UPDATE public.login_rate_limits
        SET attempts = v_rec.attempts + 1, last_attempt_at = v_now
        WHERE key = p_key;
        RETURN jsonb_build_object('allowed', true, 'remaining', p_max_attempts - (v_rec.attempts + 1));
      END IF;
    END IF;
  ELSE
    -- First attempt
    INSERT INTO public.login_rate_limits (key, attempts, first_attempt_at, last_attempt_at)
    VALUES (p_key, 1, v_now, v_now);
    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_attempts - 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Reset rate limit upon successful login
CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_key TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.login_rate_limits WHERE key = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atomic Token Generation & Account Pre-provisioning Function (Admin-Only)
CREATE OR REPLACE FUNCTION public.admin_generate_activation_token(
  target_app_id BIGINT,
  raw_token_hash TEXT,
  token_validity_hours INT DEFAULT 168 -- 7 days
)
RETURNS JSONB AS $$
DECLARE
  v_app RECORD;
  v_login_id TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Strict server-side admin verification
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can generate activation credentials.';
  END IF;

  SELECT * INTO v_app FROM public.creator_applications WHERE id = target_app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator application record not found.';
  END IF;

  IF v_app.status NOT IN ('approved', 'pending') THEN
    RAISE EXCEPTION 'Only pending or approved creator applications can be activated.';
  END IF;

  -- Reuse existing Creator Login ID or allocate atomically
  v_login_id := (v_app.profile_data->>'creator_login_id');
  IF v_login_id IS NULL OR v_login_id = '' THEN
    v_login_id := public.generate_next_creator_login_id();
  END IF;

  v_expires_at := NOW() + (token_validity_hours || ' hours')::INTERVAL;

  -- Atomically invalidate any previous unused tokens for this application
  UPDATE public.creator_activation_tokens
  SET used_at = NOW()
  WHERE application_id = target_app_id AND used_at IS NULL;

  -- Insert new hashed token
  INSERT INTO public.creator_activation_tokens (
    application_id,
    token_hash,
    expires_at
  ) VALUES (
    target_app_id,
    raw_token_hash,
    v_expires_at
  );

  -- Update application record
  UPDATE public.creator_applications
  SET 
    status = 'approved',
    profile_data = jsonb_set(
      COALESCE(profile_data, '{}'::JSONB),
      '{creator_login_id}',
      to_jsonb(v_login_id)
    ) || jsonb_build_object(
      'account_status', 'pending_activation',
      'activation_token_hash', raw_token_hash,
      'activation_token_expires_at', v_expires_at,
      'invitation_sent_at', NOW()
    )
  WHERE id = target_app_id;

  RETURN jsonb_build_object(
    'success', true,
    'creator_login_id', v_login_id,
    'expires_at', v_expires_at,
    'app_id', target_app_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Atomic Token Consumption & Activation Completion Function
CREATE OR REPLACE FUNCTION public.consume_activation_token_atomic(
  p_token_hash TEXT,
  p_auth_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_token RECORD;
  v_app RECORD;
BEGIN
  -- 1. Locate valid, unexpired, unused token
  SELECT * INTO v_token 
  FROM public.creator_activation_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE; -- Lock row to prevent race conditions

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid activation token.');
  END IF;

  IF v_token.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This activation token has already been used.');
  END IF;

  IF v_token.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This activation token has expired.');
  END IF;

  -- 2. Verify application record
  SELECT * INTO v_app
  FROM public.creator_applications
  WHERE id = v_token.application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Associated creator application not found.');
  END IF;

  IF v_app.status = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This creator account has been suspended by administration.');
  END IF;

  IF v_app.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This application is not approved.');
  END IF;

  -- 3. Atomically consume token
  UPDATE public.creator_activation_tokens
  SET used_at = NOW()
  WHERE id = v_token.id;

  -- 4. Update application status, link auth user ID, update profile_data
  UPDATE public.creator_applications
  SET
    status = 'approved',
    profile_data = (
      COALESCE(profile_data, '{}'::JSONB) - 'activation_token_hash' - 'activation_token_expires_at' - 'activation_token'
    ) || jsonb_build_object(
      'account_status', 'active',
      'activated_at', NOW(),
      'auth_user_id', p_auth_user_id,
      'last_password_change_at', NOW()
    )
  WHERE id = v_app.id;

  RETURN jsonb_build_object(
    'success', true,
    'app_id', v_app.id,
    'full_name', v_app.full_name,
    'creator_login_id', v_app.profile_data->>'creator_login_id'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Public Dedicated Creator Profile Safe View (Data Privacy & Column Security)
-- Exposes ONLY explicitly approved, non-sensitive public creator fields
CREATE OR REPLACE VIEW public.public_creator_profiles AS
SELECT 
  id,
  full_name,
  city,
  country,
  categories,
  years_experience,
  availability,
  verified,
  featured,
  rating,
  profile_image,
  cover_image,
  bio,
  equipment,
  languages,
  portfolio_links,
  uploaded_files,
  slug,
  submitted_at,
  COALESCE(profile_data->>'creator_login_id', profile_data->>'member_id') AS creator_login_id,
  profile_data->>'primary_specialization' AS primary_specialization,
  profile_data->'additional_skills' AS additional_skills
FROM public.creator_applications
WHERE status = 'approved' AND (profile_data->>'account_status') IS DISTINCT FROM 'suspended';

-- Grant SELECT access to the safe public view
GRANT SELECT ON public.public_creator_profiles TO anon, authenticated;

-- 11. Lock Down creator_applications Table (Private Data Isolation)
-- Anonymous users CANNOT read raw creator_applications (prevents email, phone, token leaks)
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read approved creator applications" ON public.creator_applications;
DROP POLICY IF EXISTS "Public read creator applications" ON public.creator_applications;
DROP POLICY IF EXISTS "Anyone can insert creator application" ON public.creator_applications;
DROP POLICY IF EXISTS "Admins full manage applications" ON public.creator_applications;
DROP POLICY IF EXISTS "Creators read own application" ON public.creator_applications;
DROP POLICY IF EXISTS "Creators update own application" ON public.creator_applications;
DROP POLICY IF EXISTS "creators_read_own_application" ON public.creator_applications;
DROP POLICY IF EXISTS "creators_submit_revisions" ON public.creator_applications;

-- Anonymous users may ONLY submit new creator applications
CREATE POLICY "Public submit creator application" ON public.creator_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Admins retain full management over creator applications
CREATE POLICY "Admins full manage applications" ON public.creator_applications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Creators can ONLY select their own record (bound to auth.jwt()->>'email' or auth_user_id in profile_data)
CREATE POLICY "Creators read own application" ON public.creator_applications
  FOR SELECT TO authenticated
  USING (
    email = (auth.jwt()->>'email') OR
    (profile_data->>'auth_user_id') = (auth.uid())::TEXT OR
    public.is_admin(auth.uid())
  );

-- Creators CANNOT directly update raw creator_applications (must use creator_revisions)
-- (No UPDATE policy for creators: updates are restricted to admin or service role via /api/creator-revisions)
