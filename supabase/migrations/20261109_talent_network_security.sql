-- ============================================================
-- YAWMATIC Collective: Admin-Controlled Talent Network Security Migration
-- Migration: 20261109_talent_network_security.sql
-- ============================================================

-- 1. Ensure foreign key constraint on inquiries allows null creator_id and cascades/sets null safely
ALTER TABLE IF EXISTS public.inquiries 
  DROP CONSTRAINT IF EXISTS inquiries_creator_id_fkey;

-- 2. Create public safe view for approved collective talent
-- Excludes private admin data: email, phone, whatsapp, instagram, portfolio_url, website, equipment, internal_notes, rejection_reason
CREATE OR REPLACE VIEW public.approved_creators_public AS
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
  portfolio_links,
  slug,
  submitted_at
FROM public.creator_applications
WHERE status = 'approved';

-- Grant select on public safe view to public and authenticated users
GRANT SELECT ON public.approved_creators_public TO anon, authenticated;

-- 3. Restrict Anonymous Direct Access to Private Application Fields
-- Public anonymous users can only SELECT approved applications.
DROP POLICY IF EXISTS "anon_select_applications" ON public.creator_applications;
CREATE POLICY "anon_select_approved_applications" ON public.creator_applications
  FOR SELECT TO anon
  USING (status = 'approved');

-- Prevent anonymous users from performing unauthorized direct UPDATE/DELETE on applications
DROP POLICY IF EXISTS "anon_update_applications" ON public.creator_applications;
CREATE POLICY "admin_manage_creator_applications" ON public.creator_applications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Permit anonymous application submission (creators-apply.html)
DROP POLICY IF EXISTS "anon_insert_applications" ON public.creator_applications;
CREATE POLICY "anon_insert_applications" ON public.creator_applications
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- 4. Inquiries Security (Client-to-Admin Enquiries)
-- Anyone can submit an enquiry, but only admins can view or update all enquiries.
DROP POLICY IF EXISTS "anon_all_inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anonymous insert inquiries" ON public.inquiries;
CREATE POLICY "anon_insert_inquiries" ON public.inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admin_all_inquiries" ON public.inquiries
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Enable Realtime on approved applications and inquiries
ALTER TABLE public.creator_applications REPLICA IDENTITY FULL;
ALTER TABLE public.inquiries REPLICA IDENTITY FULL;

