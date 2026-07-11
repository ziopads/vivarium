-- Vivarium catalog schema (v1)
-- Single items table with array columns for subjects/places.
-- Simple to query now; normalizes cleanly into Items/Authors/Subjects/Loans later.

create table if not exists items (
  id           integer primary key,
  item_type    text    not null default 'Book',
  title        text    not null,
  author       text    default '',
  publisher    text    default '',
  place_of_publication text default '',
  year         text    default '',
  edition      text    default '',
  printing     text    default '',
  isbn         text    default '',
  format       text    default '',
  description  text    default '',
  blurb        text    default '',
  discussion   text    default '',
  cover        text    default '',
  signed       boolean default false,
  inscription  text    default '',
  genres       text[]  default '{}',
  shelf        text    default '',
  images       jsonb   default '[]',
  subjects     text[]  default '{}',
  places       text[]  default '{}',
  condition    text    default '',
  location     text    default '',
  owner        text    default '',
  notes        text    default '',
  image        text
);

create index if not exists items_title_idx    on items (lower(title));
create index if not exists items_genres_idx   on items using gin (genres);
create index if not exists items_subjects_idx on items using gin (subjects);
create index if not exists items_places_idx   on items using gin (places);
create index if not exists items_shelf_idx    on items (shelf);

-- NOTE: Private fields (price paid, estimated value, loaned-to) are intentionally
-- NOT in this public, read-only table. When you add editing + auth, put them in a
-- separate `holdings` table that the public API never selects from.
