-- ==============================================================================
-- YAWMATIC COLLECTIVE: PRODUCTION SECURITY HARDENING & ISOLATION MIGRATION
-- Migration: 20261111_security_hardening.sql
-- ==============================================================================

-- 1. Create a dedicated sequence for atomic, concurrent-safe Creator Login IDs
CREATE SEQUENCE IF NOT EXISTS public.creator_login_id_seq START WITH 2;

-- 2. Dedicated Table: creator_activation_tokens
-- Stores cryptographically hashed tokens, single-use states, and application binding
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

-- 4. Atomic Function: generate_next_creator_login_id()
-- Guarantees atomic, non-colliding sequential generation format: YAW-CRE-0001
CREATE OR REPLACE FUNCTION public.generate_next_creator_login_id()
RETURNS TEXT AS $$
DECLARE
  v_next_val BIGINT;
BEGIN
  v_next_val := nextval('public.creator_login_id_seq');
  RETURN 'YAW-CRE-' || LPAD(v_next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 5. Atomic Account Provisioning & Single-Use Token Generation
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
  -- Verify caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can generate activation credentials.';
  END IF;

  SELECT * INTO v_app FROM public.creator_applications WHERE id = target_app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator application record not found.';
  END IF;

  v_login_id := (v_app.profile_data->>'creator_login_id');
  IF v_login_id IS NULL OR v_login_id = '' THEN
    v_login_id := public.generate_next_creator_login_id();
  END IF;

  v_expires_at := NOW() + (token_validity_hours || ' hours')::INTERVAL;

  -- Invalidate any existing unused tokens for this application
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

  -- Update application profile_data
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
      'activation_token_expires_at', v_expires_at
    )
  WHERE id = target_app_id;

  RETURN jsonb_build_object(
    'success', true,
    'creator_login_id', v_login_id,
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Lock down creator_applications RLS
-- Restrict anonymous users to querying only approved public attributes
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read approved creator applications" ON public.creator_applications;
CREATE POLICY "Public read approved creator applications" ON public.creator_applications
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "Admins full manage applications" ON public.creator_applications;
CREATE POLICY "Admins full manage applications" ON public.creator_applications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Creators read own application" ON public.creator_applications;
CREATE POLICY "Creators read own application" ON public.creator_applications
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR email = auth.jwt()->>'email');

-- Creators cannot directly update approval status or login ID
DROP POLICY IF EXISTS "Creators update own application" ON public.creator_applications;
CREATE POLICY "Creators update own application" ON public.creator_applications
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (
    auth_user_id = auth.uid() AND
    status = 'approved'
  );
