# Project Harbor — brand assets

All artwork uses the anchor mark + accent blue `#2563eb`. Two groups: website
brand (for the Readdy app) and Chrome Web Store listing images (live under
`extension/`).

## Website brand (use in the Readdy app)

| File | Use |
|---|---|
| `project-harbor-logo.svg` | Header/nav logo (scalable, transparent). Preferred. |
| `project-harbor-logo-1072x256.png` | Header logo, raster @ high-res (transparent). |
| `project-harbor-logo-536x128.png` | Header logo, raster @ 1x (transparent). |
| `project-harbor-mark.svg` | Square app/badge mark (scalable). |
| `project-harbor-mark-512.png` | PWA / web-app manifest icon. |
| `project-harbor-mark-180.png` | Apple touch icon. |
| `project-harbor-mark-48.png` | Spare mid-size icon. |
| `project-harbor-mark-32.png` | Favicon. |
| `project-harbor-mark-16.png` | Favicon (small). |

These replace the old Hirewave "H" logo/favicon in Readdy.

## Chrome Web Store listing images (the "image upload" fields)

These live with the extension and are already Project Harbor-branded:

| Store field | File | Notes |
|---|---|---|
| Store icon (128x128) | `extension/icons/icon128.png` | Comes from the packaged manifest icon; now the anchor mark (no more "H"). |
| Screenshot (1280x800, >=1 required) | `extension/store-assets/screenshot-1280x800.png` | Project Harbor, code-free connect flow. |
| Small promo tile (440x280, optional) | `extension/store-assets/promo-440x280.png` | "Project Harbor Connect". |
| Marquee promo tile (1400x560, optional) | `extension/store-assets/marquee-1400x560.png` | "Project Harbor Connect" with anchor watermark. |

The packaged extension icons (`extension/icons/icon{16,32,48,128}.png`) are the
anchor mark and ship inside `extension/dist/project-harbor-connect-1.1.0.zip`.
