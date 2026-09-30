# Chrome Web Store compliance notes — the keyword-stuffing rejections

## What happened
Versions 1.1.0 and 1.1.1 were rejected under **Spam and Placement in the Store**
— "excessive keywords in the item's description." The flagged string each time:

> `LinkedIn, Indeed, Glassdoor, Greenhouse, Workday, ZipRecruiter, or Dice`

## The governing policy (primary source)
The Chrome spam policy's "comply with Google's Webmaster Quality Guidelines"
requirement points to **Spam policies for Google web search → Keyword stuffing**
(developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing):

> "Keyword stuffing refers to the practice of filling a web page with keywords or
> numbers… Often these keywords appear in **a list or group, unnaturally, or out
> of context**."
> Examples include: "**Blocks of text that list cities and regions that a web page
> is trying to rank for.**"

Our seven job-board names as a comma-separated group are exactly that example
(provider names in place of "cities and regions").

## The rule we follow
The policy targets the **form** (a keyword list/group), not the words. Therefore:

| Where | Provider names allowed? |
|---|---|
| Manifest `host_permissions` | ✅ Yes — a technical declaration, not prose. All domains stay here. |
| A provider named naturally in a sentence ("a job board like LinkedIn") | ✅ Yes — in context. |
| One provider shown in a realistic UI screenshot | ✅ Yes — in context. |
| A comma-separated **group/list** of provider names in any free-text field | ❌ No — this is the violation. |

Free-text fields that must stay list-free: **Detailed description, Summary,
Single purpose, and every permission justification** (cookies / tabs / storage /
host permission).

## How this build complies
- The provider domains appear **only** in `manifest.json` → `host_permissions`.
- No free-text listing field contains a provider group (verified: STORE_LISTING.md
  has zero provider names; the host-permission justification says "the supported
  job-site domains declared in the manifest's host_permissions").
- The Detailed description is natural helper-framed prose, not a features/keyword list.
- `README.md` still lists the supported sites for developers — that file is **not**
  submitted to the store, so it does not affect the listing.

## If a reviewer asks why the host permissions are broad
Point them to the host-permission justification: each declared domain is a job site
whose *existing* session the user may choose to connect; the extension reads that
site's cookies only on the user's explicit action and sends them over HTTPS to the
user's own account. No site is accessed otherwise.
