-- ============================================================
-- HUE Studio - 0008: make a deliberate, permanent delete possible
--
-- Suspending and archiving stay the everyday tools. This is for the case the
-- agency actually wants the record gone - a client that was entered twice, a
-- freelancer who asked to be removed.
--
-- The distinction this migration encodes: deleting a PERSON must not delete
-- the WORK. Their name is attribution, so it becomes null and the shoot
-- survives. Deleting a CLIENT is different - their shoots are theirs, and the
-- application removes them explicitly, in order, inside one transaction.
--
-- Everything here only changes what happens ON a delete. Nothing is deleted.
-- ============================================================

-- Who filed the request. Losing the name must not take the request with it,
-- so the column has to be able to hold null at all.
alter table shoots alter column created_by drop not null;

alter table shoots drop constraint shoots_created_by_fkey;
alter table shoots add constraint shoots_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;

alter table shoots drop constraint shoots_confirmed_by_fkey;
alter table shoots add constraint shoots_confirmed_by_fkey
  foreign key (confirmed_by) references users(id) on delete set null;

-- A studio or a camera can be retired out of existence without erasing the
-- shoots that happened in it; the address and the times stay on the shoot.
alter table shoots drop constraint shoots_location_resource_id_fkey;
alter table shoots add constraint shoots_location_resource_id_fkey
  foreign key (location_resource_id) references resources(id) on delete set null;

-- Who issued an invite is attribution too.
alter table invites drop constraint invites_created_by_fkey;
alter table invites add constraint invites_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;

-- shoot_resources keeps ON DELETE RESTRICT deliberately. A resource that was
-- ever booked cannot vanish by accident; the application removes its
-- assignments first, and only when someone has confirmed they mean it.
