-- ============================================================
-- YAWMATIC Control Center is_admin function redefinition
-- ============================================================

-- Redefine public.is_admin to include super_admin role
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role::text IN ('super_admin', 'admin', 'manager', 'project_manager', 'finance', 'moderator')
  );
END;
$$;
