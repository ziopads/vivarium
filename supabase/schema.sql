-- Vivarium schema — Supabase / Postgres.
-- Hybrid model: typed columns for the shared spine, JSONB `attributes` for the
-- type-specific + bibliographic tail. Run once in the Supabase SQL editor.
--
-- THIS FILE IS THE FRESH-INSTALL SCHEMA. It always describes the current shape,
-- so a new instance runs it and is done. Changes to an instance that ALREADY
-- EXISTS live in supabase/migrations/ — apply those in date order, starting after
-- whatever the database was created from. Every schema change belongs in both
-- places: edit here, and add a migration for the databases already out there.

create table if not exists items (
  id          bigint primary key,
  item_type   text        not null default 'Book',
  title       text        not null,
  author      text        not null default '',   -- author / artist / maker
  year        text        not null default '',
  classification text,                           -- full path; section/shelf derive from it
  section     text,
  shelf       text,
  genres      text[]      not null default '{}',
  subjects    text[]      not null default '{}',
  places      text[]      not null default '{}',
  visibility  text        not null default 'public',
  owner       text,
  signed      boolean     not null default false,
  maine       boolean     not null default false,
  cover       text,
  copyright   text,
  image       text,
  images      jsonb       not null default '[]'::jsonb,
  description text        not null default '',
  discussion  text,
  attributes  jsonb       not null default '{}'::jsonb,  -- publisher, isbn, edition,
                                                         -- condition, location, frame
                                                         -- dimensions, music fields, …
  updated_at  timestamptz not null default now(),
  -- Filing. `classification` is the record's path into the classification tree
  -- (supabase vocab.data->'tree'), separator-joined:
  -- 'History & Place/Americas/Maine & New England'. It is AUTHORITATIVE;
  -- `section` and `shelf` hold its first two segments and are rewritten from it
  -- on every save. They remain columns because much of the app still reads them,
  -- and because a two-segment path is the common case worth indexing.
  -- Three tiers, ordered: public → anyone through the site gate; signed_in → a
  -- viewer with a session (labelled "Restricted" in the UI); admin → admins only
  -- (labelled "Private"). The STORED values name who reaches a record and are
  -- deliberately not the screen labels — see lib/visibility.ts for why, and note
  -- that a pre-2026-09-03 database holds 'restricted' meaning ADMIN ONLY.
  constraint items_visibility_chk check (visibility in ('public', 'signed_in', 'admin'))
);

create index if not exists items_item_type_idx  on items (item_type);
create index if not exists items_section_idx     on items (section);
create index if not exists items_visibility_idx  on items (visibility);
-- text_pattern_ops so `classification LIKE 'History & Place/%'` — the query every
-- telescoping column and every subtree count makes — uses the index. A plain
-- btree here would only serve equality.
create index if not exists items_classification_idx on items (classification text_pattern_ops);

create table if not exists vocab (
  id   int  primary key default 1,
  data jsonb not null
);

-- Access is server-side only, using the SERVICE-ROLE key after an auth check in
-- the Next.js route. Enable RLS so the public ANON key cannot read/write directly
-- if it ever leaks. Deny-by-default: no anon/authenticated policies are granted;
-- the service-role key bypasses RLS. (To let the browser read the catalogue
-- directly later, add a read policy restricted to visibility = 'public'. State it
-- that way round — as an allowlist of the open tier rather than a denylist of the
-- closed one — so adding a fourth tier later cannot silently expose it.)
alter table items enable row level security;
alter table vocab enable row level security;

-- Wishlist: books to find, added on the go (each tagged with who added it).
create table if not exists wishlist (
  id   bigint primary key,
  data jsonb not null
);
alter table wishlist enable row level security;
