# The Sic 'Em Sheet — College Football Pick 'Em

A weekly pick 'em site: you (the admin) choose the games and set the spread each week,
your friends sign in with just their email and pick winners against the spread, guess
the total score on a tiebreaker game, and standings update automatically — weekly and
season-long.

Rename it anything you want — search for "The Sic 'Em Sheet" in `src/app/layout.tsx` and
`src/components/Nav.tsx`.

Everything below is free at the scale of a friend group.

---

## What you're setting up

| Piece | Service | Cost |
|---|---|---|
| Website hosting | [Vercel](https://vercel.com) | Free |
| Database + email login | [Supabase](https://supabase.com) | Free |
| Game matchups & spreads | [The Odds API](https://the-odds-api.com) | Free (500 requests/month) |
| Code hosting | [GitHub](https://github.com) | Free |

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Pick any name/password/region (save the DB password somewhere).
3. Once it's created, go to **SQL Editor** → **New query**, paste in the entire contents
   of [`supabase/schema.sql`](./supabase/schema.sql) from this project, and click **Run**.
   This creates all the tables, security rules, and the views that do the scoring math
   automatically.
   - **Already ran schema.sql before and just pulled a newer version of this project?**
     Don't re-run the whole file — instead run the new files in `supabase/migrations/` in
     order (002, 003, ...). Each one only adds what's new.
4. Go to **Project Settings → API**. You'll need three values in a minute:
   - `Project URL`
   - `anon public` key
   - `service_role` key (click "reveal") — keep this one secret, never share it

5. Go to **Authentication → Providers** and make sure **Email** is enabled. Go to
   **Authentication → Email Templates** if you want to customize the sign-in email later
   (optional — the defaults work fine).
6. Go to **Authentication → URL Configuration** and set the **Site URL** to the Vercel
   URL you'll get in step 3 below (you can come back and set this after deploying).

## 2. Get a free Odds API key

1. Go to [the-odds-api.com](https://the-odds-api.com) → sign up for the free plan.
2. Copy your API key from the dashboard. The free tier gives you 500 requests/month —
   pulling the week's odds once uses 1 request, so this comfortably covers a full season.

## 3. Push this code to GitHub

1. Create a new empty repository on [github.com](https://github.com/new) (e.g. `pickem-league`).
2. From inside this project folder on your computer:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pickem-league.git
   git push -u origin main
   ```

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account.
2. **Add New → Project** → import the repo you just pushed.
3. Before deploying, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
   | `ODDS_API_KEY` | your Odds API key |
   | `NEXT_PUBLIC_SITE_URL` | leave blank for now |

4. Click **Deploy**. You'll get a URL like `https://pickem-league-yourname.vercel.app`.
5. Go back to **Vercel → Project → Settings → Environment Variables**, set
   `NEXT_PUBLIC_SITE_URL` to that exact URL, and redeploy (Deployments tab → ⋯ → Redeploy).
6. Go back to **Supabase → Authentication → URL Configuration** and set both the **Site URL**
   and **Redirect URLs** to that same Vercel URL (add `https://your-app.vercel.app/**` as an
   allowed redirect URL).

Your site is now live at that URL. Share it with your friends.

## 5. Make yourself the admin

1. Go to your site, sign in with your own email (check your inbox for the magic link).
2. In Supabase, go to **Table Editor → profiles**, find your row, and set `is_admin` to `true`.
3. Refresh your site — you'll now see an **Admin** link in the top nav.

## 6. Run your first week

1. Go to **Admin** on your site.
2. **Create a week** — give it a season, week number, and label (e.g. "Week 3").
3. Click **Pull current NCAAF odds** — this fetches the live slate and spreads.
4. Check the boxes next to the games you actually want your group picking, adjust any
   spread if you'd like, mark one game as the **tiebreaker**, and click **Save & publish week**.
5. Send your friends the site link. They sign in with their email, go to **Picks**, and
   pick each game against the spread plus a total-score guess on the tiebreaker game.
   Picks lock automatically the moment each game kicks off.
6. After games finish, go back to **Admin → Enter final scores** and click
   **Fetch final scores automatically** — it pulls completed results straight from the Odds
   API for any game that was added that way. Only games added manually (not through "Pull
   current NCAAF odds") need a score typed in and **Save result** clicked by hand. Standings
   on the **Standings** page update
   instantly — no manual math.

Repeat steps 2–6 each week of the season.

---

## How scoring works

- Each game has a spread relative to the home team (e.g. `-6.5` means the home team is
  favored by 6.5). A pick is correct if that team **covers the spread**, not just wins
  outright.
- Each correct pick against the spread = 1 point. A "push" (exact tie against the spread)
  awards no one a point for that game.
- The **tiebreaker** game's total-score guess only matters if two or more people are tied
  on points for that week — whoever is closest to the actual combined score wins the tie.
  It does not add or subtract points on its own.
- The **Standings** page shows both the current week's results and the season-long
  cumulative leaderboard.

## Scorecard, avatars & reminders

- **Scorecard** (`/scorecard`): a compact, game-by-game view of the current week — each
  matchup shows small icons for everyone clustered on whichever side they picked, so you
  can see at a glance who covered and who didn't once a game locks. It respects the same
  privacy rule as everything else: nobody's pick shows up until that game's kickoff passes.
- **Icons**: every player can set their own icon from **the icon link in the top nav**
  (next to their name) — a colored initial (the default), a fun emoji, or an uploaded
  photo. This needs one extra one-time setup step:
  - Run [`supabase/migrations/005_avatars_and_progress.sql`](./supabase/migrations/005_avatars_and_progress.sql)
    in the Supabase SQL Editor. It adds the avatar columns to `profiles`, creates a public
    `avatars` Storage bucket for uploaded photos (each person can only write to their own
    folder in it), and adds a `week_pick_completion` function used by the reminder banner
    below.
- **Lock-deadline reminders**: the home page and Picks page show a small banner with the
  time until the next game locks and who still hasn't submitted a full slate for the week
  (not what they picked — just whether they've picked yet).
- **Weekly champion callout**: once every game in a week is final, the Standings page
  highlights that week's top scorer(s).
- **Your stats**: the icon page also shows your season record against the spread and your
  current streak.
- **Close call flagging**: on the Scorecard, any final game decided by 3 points or less
  against the spread (or an exact push) gets a small "🔥 Close call" badge.
- **Trash Talk** (`/trash-talk`): a live group chat for the pool — messages show up for
  everyone instantly, no refresh needed. Needs one more migration:
  [`supabase/migrations/006_trash_talk.sql`](./supabase/migrations/006_trash_talk.sql).
  It creates the `trash_talk` table and turns on Supabase Realtime for it.
- **Mobile**: the nav collapses into a menu button below tablet width, and the site now
  ships a proper viewport tag so pages render at actual phone width instead of a
  zoomed-out desktop layout. This is a responsive website, not an installable app.

## Notes & limitations (MVP)

- Admin status is granted by editing the `is_admin` column directly in Supabase's table
  editor — there's no in-app "make someone else admin" button. For a small friend league
  this is the simplest and safest option.
- The free Odds API tier covers FBS matchups with mainstream sportsbook coverage; very
  small-conference or FCS games may not appear. You can still add a game manually by
  inserting a row into the `games` table in Supabase if one you want is missing.
- Everyone can see each other's picks once a game locks (kickoff time passes) — this is
  intentional, so people can see the pool's picks once it's too late to be influenced by them.

## Local development (optional)

```bash
npm install
cp .env.example .env.local   # fill in the same values as your Vercel env vars
npm run dev
```

Visit `http://localhost:3000`.
