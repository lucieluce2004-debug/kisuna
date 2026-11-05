# Kizuna backend

Kizuna remains hosted on Sites project `appgprj_6aea56ac83dc81919ebba2d954130f62` at `https://kizuna.aleklecaribou.chatgpt.site`.

At the owner's explicit request, its Supabase backend uses **Yugen Manga RP**, project `hxbujmdzidtwmalmqrwt`. The Auth user directory is shared; application tables and functions are prefixed `kizuna_`. Existing Yugen studio tables are outside this app's scope.

## Data and access

- `kizuna_cards`: public read-only playable catalogue, seeded with the retained 235 cards and three additional real AniList companions. Existing ids and owned copies are preserved, including editions sharing an AniList character.
- `kizuna_profiles`, `kizuna_player_states`: owner-only reads and writes under RLS. Snapshots include collection, Chakra, guarantees, imported legacy cards and the existing local-market state.
- `kizuna_admins`: authenticated players may read their own role; browser clients cannot grant or modify roles.
- `kizuna_moderators`: owner-only membership reads; administrators assign or revoke moderator membership through the verified staff endpoint. Moderators can list and review Kizuna registrations only.
- `kizuna_boosters`: public reads include published definitions only. Administrator-created pools contain up to 500 canonical card IDs, five draws per opening, and must include Rare/Epic/Legendary/Mythic cards before publication. Draws never fall back outside a custom pool.
- `private.kizuna_staff_rewards`, `private.kizuna_account_reviews`, `private.kizuna_staff_audit`: no browser table access. Rewards use idempotent request IDs, are queued, and atomically update the recipient's cloud state and revision when claimed.
- `private.kizuna_admin_invites`: owner-issued, one-time invitations. A scoped private definer function checks the current identity and confirmed e-mail before consuming an invitation. User metadata does not grant admin access.

The site owner explicitly replaced the legacy administrator with the Discord account named `cariboux_8999f051`. Administrator membership remains in protected database rows; changing a display name cannot grant it.

## Authentication

`dist/kizuna-config.js` contains the project URL and publishable key only. Service-role credentials stay inside Supabase Edge Functions.

Login and registration use Discord OAuth with PKCE, retaining the existing `kizuna_auth_v1` session key. New players choose a unique 2–20 character username before the verified `kizuna-discord-profile` endpoint creates their Kizuna profile. Existing profiles keep their username, collection and identity. A different Discord e-mail can create a separate Auth user; collections are never merged based on display names.

These return URLs remain in the shared project's allowlist:

- `https://kizuna.aleklecaribou.chatgpt.site/?auth=confirmed`
- `https://kizuna.aleklecaribou.chatgpt.site/?auth=recovery`
- `https://kizuna.aleklecaribou.chatgpt.site/?auth=discord`

Keep the shared project's other URLs and Site URL. Discord's own application callback is `https://hxbujmdzidtwmalmqrwt.supabase.co/auth/v1/callback`. The shared e-mail provider and SMTP settings remain available to Yugen; the Kizuna UI uses Discord.

## Staff and rewards

`kizuna-staff` validates Auth.getUser for every request. A service-only invoker RPC delegates to a private definer with a fixed empty search path; every database operation rechecks protected roles. Editable metadata and submitted actor IDs never authorize an action.

The administrator workspace at `#staff` contains registration reviews, AniList catalogue tools, booster drafts/publication, rewards and team grades. Administrators can assign Administrateur, Modérateur or Joueur through `kizuna_set_staff_role`; a transaction lock, fresh role checks, self-demotion protection and a last-admin guard protect access. Demotion also consumes legacy admin invitations. Moderators receive registration reviews only. The directory lists Kizuna profiles rather than the entire shared Auth directory, and excludes e-mail addresses, tokens and collections.

One roll is one bonus booster opening (`stock.inv`). The temporary unlimited test mode is disabled. Existing free recharge, daily gifts, stock, rarity weights and pity guarantees continue to apply. Reward claims flush local changes first and submit the exact cloud revision, preserving existing cards and preventing stale writes or duplicate credits. Incoming rewards are checked on login, idle focus/visibility and once per minute; the account dialog also offers a manual claim.

The regenerating free-pack reserve holds up to 100 packs, starting from 3 for new players and recharging one every six hours. Account snapshots use the same 100-pack cap as the game bridge. Bonus rerolls remain a separate inventory and can also accumulate beyond ten; existing balances are preserved.

The UI calls these bonus openings “Rerolls gratuits”. The team list can open the recipient's reward form; selecting a player never grants anything. The administrator submits positive bounded amounts of rerolls and/or Chakra, using an idempotent request ID.

## Popularity and rarity

`supabase/functions/_shared/rarity-policy.ts` supplies the shared browser/server policy. Distinct AniList characters **in each anime album** are ranked by favourites descending, then numeric AniList source ID ascending to break ties. Ranks 1–5 are Mythique, ranks 6–10 are Légendaire, and ranks 11–15 are Épique. Multiple editions of one character count once. A managed album replaces the implicit series group with the same trimmed, case-insensitive name; its explicit membership determines its ranking. The canonical selection is the union across albums, with the highest selected tier winning (Mythique before Légendaire before Épique). At the owner's explicit request, Madara Uchiha (`53901`) remains Mythique independently of rank.

There are no absolute favourite thresholds for Mythique, Légendaire or Épique. Characters outside those ranked bands use the remaining thresholds: Rare from 2,500 favourites, Peu commune from 1,000, otherwise Commun. These lower thresholds and the verified catalogue companions keep all six draw tiers available with the new three-band ranking. Every visible retained album has at least two real, distinct characters, making both Mythique in a two-character album. `rankAlbumMythics` reports sparse groups; it never invents a second card or counts another edition as one. New or small albums are not padded with fabricated rare characters to fill every tier.

`seed/popularity.json` retains the verified 234-character snapshot for the 235 initial card editions. `seed/extra-cards.json` holds verified additions to the 39 existing anime albums, including the original Gilbert Bougainvillea, Batou and Lei Qiang companions. The bounded enrichment targets up to 30 distinct characters per existing album, including retained cards; shorter AniList casts remain smaller. Anime context, character source, favourites, names and images come from verified AniList responses. Existing canonical rows and editions retain their IDs and metadata. The build bundles `retainedPopularity`, the full three-band `retainedRarityContext`, the compatibility `retainedMythicSources` array, and `retainedExtraCards`, then prepares `seed/catalogue.json` with `album-ranks-v2`. Live administrator imports and managed albums can change these retained counts.

`schema/kizuna_album_mythics.sql` installs the Postgres ranking infrastructure; the append-only `schema/kizuna_album_rarity_ranks.sql` extends it to the three ranked bands and stamps `album-ranks-v2`. A shared transaction lock serializes catalogue and album membership writers; statement triggers call the private `kizuna_rebalance_album_mythics` function and recalculate canonical rarity, power and aura. Deferred constraints reject a managed album with fewer than two distinct valid source IDs at commit. Browser clients cannot invoke the private rebalancer. Imports and album changes therefore use their authorized endpoints and database operations rather than writing a static rarity patch.

The browser recomputes ranking after catalogue metadata, imports and album membership refreshes. Fresh canonical favourite values take precedence over the bundled fallback snapshot. Card IDs, artwork, editions, owned quantities and timestamps remain unchanged. Booster weights, slot minima and pity counters are independent of this classification policy and remain unchanged.

The historical `scripts/prepare-popularity-update.mjs` helper is now a **read-only audit**. It fetches public cards, albums, membership and published boosters, computes expected metadata using the current full album context, and writes a JSON report. It never generates or executes SQL. Old `kizuna-popularity-update.sql` artifacts are obsolete and must not be executed; the database rebalancer is the authority for live rarity writes. Public audit reads are not a transaction, so regenerate the report if imports or memberships are changing during the audit.

`scripts/prepare-rarity-companions.mjs` prepares the bounded catalogue enrichment from retained AniList evidence. Its reviewed SQL inserts metadata in one statement under the catalogue transaction lock, reuses canonical source IDs, and never updates old identity/artwork/favourite fields or grants owned copies. The database trigger assigns the final ranked rarities. The browser also reclassifies restored personal catalogue batches before normalizing owned copies, preserving all three ranked bands across cache reloads and account snapshots.

## Administrator catalogue

`kizuna-catalogue-admin` verifies Auth identity and protected admin membership before reading AniList or writing cards. Search is explicit and paginated; imports rebuild canonical properties server-side. Imported cards join the playable catalogue without granting copies. There is no automatic full-AniList mirror.

The catalogue offers character search and anime search. Administrators select the exact anime or season, then page through its characters. Contextual imports re-query that anime's exact character page and check membership before using its title/categories. Existing canonical cards retain their IDs; their classification follows the current album ranking. Concurrent imports insert once and read the canonical winner after rebalancing. Importing the first character of a new series also obtains real popular companions so the new album does not remain a one-character group. Every successful import refreshes the complete canonical metadata and album cache, including catalogue-only imports.

## Anime albums

`kizuna_albums` and `kizuna_album_cards` hold shared catalogue groups. Public clients may read them; a service-only RPC rechecks the administrator role for creation and membership edits. Anime identity, name and cover are verified by the catalogue Edge Function. Repeated creation for the same anime reuses its album, and case-insensitive name collisions are rejected.

Shared definitions appear in the existing Collection → Albums grid. Creation imports up to five real popular characters from the verified anime and requires at least two distinct valid sources; an anime that cannot meet that requirement is rejected. It also adopts existing cards whose series matches the album name. Managed albums then use their explicit membership and replace the implicit group of the same name. Removal cannot leave a managed album below two distinct characters. Completion comes from the current player's owned cards; creating or filling a shared album never awards copies. Album metadata is excluded from per-user cloud snapshots. `kizuna-albums.js` refreshes public metadata and paginates membership reads; an explicit refresh also refreshes the catalogue so newly imported companions and reranked card metadata are available.

## Validation

`npm run build` rebuilds the SDK bundle, embeds `src/game-bridge.inc.js` and prepares `seed/catalogue.json`.

Interface, account, staff UI, server permissions, custom booster, rarity and reveal-order tests are in `scripts/`. `verify-backend.mjs` checks live redirects, catalogue reads and anonymous access denial without creating a real account or sending an e-mail. `check-staff-rls.sql` verifies protected roles, draft visibility, idempotent grants, revision conflicts and preservation in a transaction that rolls back all fixtures.

`verify-catalogue-server.mjs`, `verify-catalogue-ui.mjs` and `verify-albums.mjs` cover anime selection, contextual imports, shared album display and personal completion. `check-album-rls.sql` checks public read-only album permissions, private helper execution and enabled RLS without writing fixtures.

`check-album-smoke.sql` exercises real album creation, idempotent membership changes and canonical-card preservation inside a rollback, using an existing administrator and changing no Auth user or staff role.

`verify-album-mythics.mjs` covers all three rank boundaries, duplicate editions, managed album replacement, sparse groups, overlapping albums and the Madara exception. `check-album-rarity-ranks.sql` exercises the same bands, automatic favourite updates, global tier priority and minimum-two protection inside a rollback. `verify-popularity.mjs` checks the retained catalogue against the bundled full ranking, real favourite values, all six available rarities, minimum album size, fresh metadata updates, cache/cloud restoration and preservation of owned quantities/timestamps and booster rules.

Applied SQL files are retained under `schema/`. Append new migrations for future changes. Policy verification used rolled-back tests and retained no test records.
