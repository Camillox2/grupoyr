# Blog YR

Public: https://grupoyrhospitalar.com.br/blog

Admin: https://grupoyrhospitalar.com.br/admin

## Infrastructure

The existing Vite site remains prerendered. Vercel Node functions render blog pages from Neon Postgres. The Neon marketplace resource `yr-hospitalar-blog` is connected to Production and Development. Preview deployments deliberately receive no production database. No changes to the Hetzner server are necessary.

`DATABASE_URL` is server-only. Never prefix it with `VITE_`, commit `.env` files, or include credentials in articles. The initial administrator is `rodrigo@grupoyrhospitalar.com.br`. Its temporary password is delivered in a private local file outside this repository, and must be changed at first login.

## Editing

Sign in, choose **Novo artigo**, and fill title, excerpt and Markdown body. The formatting toolbar and text preview help with headings, lists, emphasis and links. The main heading comes from the title field. Upload a JPG, PNG or WebP cover and describe it in the alt field. The browser optimizes the image, then the server validates and re-encodes it to WebP; original metadata is removed. Cover bytes are stored in Neon and consume its storage quota.

The URL slug is suggested from the title and can be edited. SEO title and description are optional overrides. Save with **Rascunho** to keep the article private, or **Publicado** to publish immediately. **Arquivado** removes a publication while retaining its text. Edits are explicitly saved; unsaved navigation triggers a warning. Concurrent edits return a conflict instead of silently replacing another version.

Public pages are real HTML, with canonical URLs, social tags and BlogPosting/Breadcrumb structured data. `/sitemap.xml` is a dynamic sitemap index; published posts appear in chunks of at most 45,000 URLs. `robots.txt` points to this index. Drafts, archived articles and admin routes are excluded. A changed slug reserves the old URL and redirects it with HTTP 301 while the article is published. Search pages are noindex. Publishing aids discovery; it does not guarantee search-engine indexing or ranking.

## Security model

There is no public signup or reset endpoint. Administrative requests require an unexpired server-side session; cookies are HttpOnly, Secure in production and SameSite=Strict. Mutations require a session CSRF token and the canonical Origin. Passwords use salted scrypt; session tokens are stored as SHA-256 hashes. Login attempts are limited persistently per account and IP. Password changes revoke all sessions. The admin HTML has noindex, no-store and a restrictive CSP. Public Markdown is sanitized with a tag/attribute/protocol allowlist. Draft cover URLs require authentication; knowing a media UUID is insufficient.

## Development and verification

Requires Node 24 and a Neon connection in ignored `.env.local`.

```powershell
npm ci
node --env-file=.env.local scripts/blog-setup.mjs
npm run build
node scripts/check-seo.mjs
node --env-file=.env.local scripts/blog-dev.mjs
```

The last command serves the site and actual function handlers at `http://127.0.0.1:5182`. In another terminal:

```powershell
node --env-file=.env.local scripts/check-blog.mjs
```

This integration test creates its own temporary administrator, post and cover, checks authentication, first password change, session revocation, CSRF, sanitization, upload validation, private drafts, publication, sitemap, redirects, conflicts, archiving and rate limits, then removes its own records. Do not run against production URLs: its assertions intentionally exercise public publication during the test. Use an isolated Neon database for future development once the site is in use.

`scripts/blog-seed.mjs` creates the two original starter guides only if their slugs do not exist. Do not rerun it after intentionally removing or renaming those articles. Existing article content is preserved by this script.

## Administrator recovery

An operator with authorized database access can reset the sole administrator. Set `BLOG_CREDENTIAL_FILE` to a private path **outside** the repository, optionally set `BLOG_ADMIN_EMAIL`, and run:

```powershell
node --env-file=.env.local scripts/blog-setup.mjs --reset-admin
```

This revokes that administrator's sessions and writes a new random one-time password into the local handoff file without printing it. The next login requires a password change. No email is sent. Do not run a reset without the account owner's instruction after handoff.

## Operations

The database was created on Neon's Free plan. Monitor storage and compute usage in Neon/Vercel as publishing grows. Vercel functions serve public content without a CDN cache so edits and unpublishing take effect immediately. Database failure returns HTTP 503 with Retry-After; it does not emit an empty successful sitemap. Keep a separate export/backup policy for published content; Git contains the two initial guides, not subsequent articles or uploaded covers.
