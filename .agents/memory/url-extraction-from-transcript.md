---
name: URL extraction from chat transcript
description: Pitfalls when recovering a business website URL out of free-text user messages in the onboarding flow
---

# Recovering the site URL from the transcript

The CNPJ-from-site step recovers the website the user typed earlier (it is no
longer in the latest message). When scanning user messages for a URL, beware:

- **Emails parse as URLs.** `new URL("https://ana@empresa.com")` succeeds with
  host `empresa.com` and userinfo `ana`. The onboarding intro explicitly invites
  teammate emails, so an email would otherwise be scraped as the "site". Reject
  any token matching `^[^/]*@` and reject parsed URLs with `username`/`password`.

  **Why:** picking an email's domain makes the server fetch the wrong site and
  could present an unrelated CNPJ for confirmation.

- **Social links are not the business site.** Skip hosts like instagram.com,
  facebook.com, tiktok.com, etc. — the user's own domain is wanted, not a
  profile URL.

- **Tokens carry punctuation.** "loja.com.br!" / "(loja.com)" need leading/
  trailing punctuation stripped before `new URL()`, or the TLD check fails.

**How to apply:** see `findUserSiteUrl()` in
`artifacts/api-server/src/routes/chat.ts`. Keep these three guards together;
removing any one reintroduces a wrong-site fetch.
