# tripreviewall.com — Favicon set

Mark: lowercase Fraunces SemiBold (9pt optical size, sturdy at small sizes) "t" in Ivory White
on Deep Ocean Blue, with a Burnt Coral full stop — the period of "The Honest Guide", echoing
the coral "all" in the wordmark.

| File | Use |
|---|---|
| favicon.ico | Legacy browsers (16/32/48 inside) |
| favicon.svg | Modern browsers, crisp at any size |
| favicon-16x16.png, favicon-32x32.png, favicon-48x48.png | PNG fallbacks |
| apple-touch-icon.png (180) | iOS home screen (full-bleed, iOS rounds corners) |
| icon-192.png, icon-512.png | Android / PWA manifest |
| icon-maskable-512.png | Android adaptive icon (mark inside 80% safe zone) |
| safari-pinned-tab.svg | Safari pinned tab (monochrome) |
| site.webmanifest | Web app manifest |

## Install

Copy every file to the site root (Nginx web root, next to index.html), then put this in `<head>` of every page:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#0B3B4F">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B3B4F">
```

Optional Nginx caching (add inside the server block):

```nginx
location ~* ^/(favicon\.(ico|svg)|favicon-.*\.png|apple-touch-icon\.png|icon-.*\.png|site\.webmanifest)$ {
    expires 30d;
    add_header Cache-Control "public";
}
```

Google picks up the favicon for search results from `/favicon.ico` or the `<link rel="icon">` tags;
it can take a few days to a few weeks to refresh after deploy.
