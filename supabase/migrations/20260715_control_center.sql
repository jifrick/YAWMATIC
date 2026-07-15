-- ============================================================
-- YAWMATIC Control Center Database Migration (Updated)
-- ============================================================

-- 1. Ensure columns exist on creator_applications
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 5.0;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.creator_applications ADD COLUMN IF NOT EXISTS changes_requested_details TEXT;

-- 2. Create project_creators join table
CREATE TABLE IF NOT EXISTS public.project_creators (
  project_id bigint REFERENCES public.projects(id) ON DELETE CASCADE,
  creator_id bigint REFERENCES public.creator_applications(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (project_id, creator_id)
);

-- 3. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id text NOT NULL,
  receiver_id text,
  project_id bigint REFERENCES public.projects(id) ON DELETE SET NULL,
  message_text text NOT NULL,
  attachments text[] DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Create activity_log table
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_name text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Create page_views table
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  path text NOT NULL,
  referrer text,
  created_at timestamp with time zone DEFAULT now()
);

-- 7. Alter projects table to ensure all necessary admin fields exist
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS invoices jsonb DEFAULT '[]';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS files jsonb DEFAULT '[]';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS comments jsonb DEFAULT '[]';

-- 8. Enable Row Level Security on new tables
ALTER TABLE public.project_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- 9. Recreate all dropped public RLS policies
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public read cities" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Admins full access cities" ON public.cities FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Public read approved creator profiles" ON public.creator_profiles FOR SELECT USING (approval_status = 'approved'::approval_status);
CREATE POLICY "Creators read own profile" ON public.creator_profiles FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Admins/Managers full read creator profiles" ON public.creator_profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Creators update own profile" ON public.creator_profiles FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "Admins/Managers manage creator profiles" ON public.creator_profiles FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT USING (approved = true);
CREATE POLICY "Anonymous insert reviews" ON public.reviews FOR INSERT WITH CHECK (true);

CREATE POLICY "Anonymous insert inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Creators read own inquiries" ON public.inquiries FOR SELECT USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = inquiries.creator_id AND cp.profile_id = auth.uid()));

CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Public read creator_categories" ON public.creator_categories FOR SELECT USING (true);
CREATE POLICY "Creators manage own categories" ON public.creator_categories FOR ALL USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_categories.creator_id AND cp.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_categories.creator_id AND cp.profile_id = auth.uid()));
CREATE POLICY "Admins manage creator_categories" ON public.creator_categories FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Public read creator languages" ON public.creator_languages FOR SELECT USING (true);
CREATE POLICY "Creators manage own languages" ON public.creator_languages FOR ALL USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_languages.creator_id AND cp.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_languages.creator_id AND cp.profile_id = auth.uid()));

CREATE POLICY "Public read creator equipment" ON public.creator_equipment FOR SELECT USING (true);
CREATE POLICY "Creators manage own equipment" ON public.creator_equipment FOR ALL USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_equipment.creator_id AND cp.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = creator_equipment.creator_id AND cp.profile_id = auth.uid()));

CREATE POLICY "Public read portfolio items of approved creators" ON public.portfolio_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = portfolio_items.creator_id AND cp.approval_status = 'approved'::approval_status));
CREATE POLICY "Creators read own portfolio items" ON public.portfolio_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = portfolio_items.creator_id AND cp.profile_id = auth.uid()));
CREATE POLICY "Creators manage own portfolio items" ON public.portfolio_items FOR ALL USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = portfolio_items.creator_id AND cp.profile_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = portfolio_items.creator_id AND cp.profile_id = auth.uid()));

CREATE POLICY "Creators read own projects" ON public.projects FOR SELECT USING (EXISTS (SELECT 1 FROM public.creator_profiles cp WHERE cp.id = projects.creator_id AND cp.profile_id = auth.uid()));

-- 10. Grant full access policies to anon/public roles for front-end management
CREATE POLICY "anon_all_project_creators" ON public.project_creators FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_messages" ON public.messages FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_activity_log" ON public.activity_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_notifications" ON public.notifications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_page_views" ON public.page_views FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_profiles" ON public.profiles FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_projects" ON public.projects;
CREATE POLICY "anon_all_projects" ON public.projects FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_reviews" ON public.reviews;
CREATE POLICY "anon_all_reviews" ON public.reviews FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_all_inquiries" ON public.inquiries;
CREATE POLICY "anon_all_inquiries" ON public.inquiries FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_applications" ON public.creator_applications;
CREATE POLICY "anon_update_applications" ON public.creator_applications FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_insert_applications" ON public.creator_applications;
CREATE POLICY "anon_insert_applications" ON public.creator_applications FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_applications" ON public.creator_applications;
CREATE POLICY "anon_select_applications" ON public.creator_applications FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage reviews" ON public.reviews FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins/Managers read inquiries" ON public.inquiries FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins/Managers modify inquiries" ON public.inquiries FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins/Managers read applications" ON public.creator_applications FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins/Managers modify applications" ON public.creator_applications FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins/Managers manage projects" ON public.projects FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage portfolio items" ON public.portfolio_items FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage creator equipment" ON public.creator_equipment FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage creator languages" ON public.creator_languages FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
