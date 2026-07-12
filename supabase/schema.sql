-- Vivarium schema — Supabase / Postgres.
-- Hybrid model: typed columns for the shared spine, JSONB `attributes` for the
-- type-specific + bibliographic tail. Run once in the Supabase SQL editor.

create table if not exists items (
  id          bigint primary key,
  item_type   text        not null default 'Book',
  title       text        not null,
  author      text        not null default '',   -- author / artist / maker
  year        text        not null default '',
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
  constraint items_visibility_chk check (visibility in ('public', 'restricted'))
);

create index if not exists items_item_type_idx  on items (item_type);
create index if not exists items_section_idx     on items (section);
create index if not exists items_visibility_idx  on items (visibility);

create table if not exists vocab (
  id   int  primary key default 1,
  data jsonb not null
);

-- Access is server-side only, using the SERVICE-ROLE key after an auth check in
-- the Next.js route. Enable RLS so the public ANON key cannot read/write directly
-- if it ever leaks. Deny-by-default: no anon/authenticated policies are granted;
-- the service-role key bypasses RLS. (To let the browser read the catalogue
-- directly later, add a read policy excluding visibility = 'restricted'.)
alter table items enable row level security;
alter table vocab enable row level security;

-- Wishlist: books to find, added on the go (each tagged with who added it).
create table if not exists wishlist (
  id   bigint primary key,
  data jsonb not null
);
alter table wishlist enable row level security;
