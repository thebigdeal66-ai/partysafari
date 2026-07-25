-- Create check_out_of_venue RPC function for secure check-out
-- This function allows authenticated users to check out of a venue

CREATE OR REPLACE FUNCTION check_out_of_venue(p_venue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_deleted_count int;
BEGIN
  -- Get the current authenticated user
  v_profile_id := auth.uid();
  
  -- Require authentication
  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Delete only the current user's active check-in for this venue
  DELETE FROM venue_checkins
  WHERE 
    venue_id = p_venue_id
    AND profile_id = v_profile_id
    AND expires_at > NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'deleted', v_deleted_count > 0,
    'message', CASE 
      WHEN v_deleted_count > 0 THEN 'Checked out successfully'
      ELSE 'No active check-in found'
    END
  );
END;
$$;
