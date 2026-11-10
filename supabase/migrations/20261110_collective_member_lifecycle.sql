-- ============================================================
-- YAWMATIC Collective: Member Lifecycle, Auth Linking & Creator Dashboard Migration
-- Migration: 20261110_collective_member_lifecycle.sql
-- ============================================================

-- 1. Extend public.creator_applications with structured member and lifecycle fields
ALTER TABLE public.creator_applications 
  ADD COLUMN IF NOT EXISTS primary_specialization TEXT,
  ADD COLUMN IF NOT EXISTS additional_skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS member_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'unprovisioned', -- 'unprovisioned', 'invitation_pending', 'active', 'suspended'
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS pending_revisions JSONB DEFAULT NULL;

-- 2. Create index on member_id and auth_user_id for high-performance lookup
CREATE INDEX IF NOT EXISTS idx_creator_apps_member_id ON public.creator_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_creator_apps_auth_user_id ON public.creator_applications(auth_user_id);

-- 3. Function to generate sequential unique Member IDs (e.g. YWC-2026-0005)
CREATE OR REPLACE FUNCTION public.generate_member_id(app_id BIGINT)
RETURNS TEXT AS $$
BEGIN
  RETURN 'YWC-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(app_id::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Automatically populate member_id for existing approved application (Sinan K - ID 5)
UPDATE public.creator_applications
SET 
  member_id = COALESCE(member_id, public.generate_member_id(id)),
  primary_specialization = COALESCE(primary_specialization, 'UI/UX Designer'),
  additional_skills = COALESCE(additional_skills, ARRAY['Web Design', '3D Design', 'AI Creative Work']),
  account_status = COALESCE(account_status, 'invitation_pending')
WHERE id = 5;

-- 5. Update public safe view for approved collective talent to include primary_specialization and additional_skills
CREATE OR REPLACE VIEW public.approved_creators_public AS
SELECT 
  id,
  full_name,
  city,
  country,
  categories,
  primary_specialization,
  additional_skills,
  years_experience,
  availability,
  verified,
  featured,
  rating,
  profile_image,
  cover_image,
  bio,
  equipment,
  portfolio_links,
  slug,
  submitted_at,
  member_id
FROM public.creator_applications
WHERE status = 'approved';

GRANT SELECT ON public.approved_creators_public TO anon, authenticated;

-- 6. Row-Level Security for Authenticated Creators:
-- An authenticated member can SELECT and UPDATE only their own record in creator_applications
DROP POLICY IF EXISTS "creators_read_own_application" ON public.creator_applications;
CREATE POLICY "creators_read_own_application" ON public.creator_applications
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid() OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "creators_submit_revisions" ON public.creator_applications;
CREATE POLICY "creators_submit_revisions" ON public.creator_applications
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid() OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auth_user_id = auth.uid() OR public.is_admin(auth.uid())
  );

-- 7. Secure function for admin to link newly provisioned auth user to creator application
CREATE OR REPLACE FUNCTION public.admin_provision_creator_account(
  target_app_id BIGINT,
  target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app RECORD;
  v_member_id TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can provision creator accounts.';
  END IF;

  SELECT * INTO v_app FROM public.creator_applications WHERE id = target_app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator application not found.';
  END IF;

  v_member_id := COALESCE(v_app.member_id, public.generate_member_id(v_app.id));

  UPDATE public.creator_applications
  SET 
    auth_user_id = target_user_id,
    member_id = v_member_id,
    account_status = 'invitation_pending',
    invitation_sent_at = NOW()
  WHERE id = target_app_id;

  -- Ensure profile role is set to creator
  UPDATE public.profiles
  SET role = 'creator'
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'app_id', target_app_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_provision_creator_account TO authenticated;
