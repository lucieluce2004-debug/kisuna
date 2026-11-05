-- Invitations are intentionally inaccessible to every browser role. The
-- narrowly scoped owner definer function retains its existing bootstrap access.
create policy kizuna_admin_invites_no_client_access
on private.kizuna_admin_invites for all to public
using (false) with check (false);
