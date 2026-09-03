/** Simple favicon desde URL Hub (`icon_image_url`) o recurso estático local. */
export function applyHubWebDocumentFavicon(imageUrl: string | null | undefined, fallbackHref = '/favicon.svg'): void {
  const trimmed = (imageUrl ?? '').trim();
  const href = trimmed || fallbackHref;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
  const base = href.split(/[?#]/)[0]?.toLowerCase() ?? '';
  if (base.endsWith('.svg')) link.type = 'image/svg+xml';
  else if (base.endsWith('.png')) link.type = 'image/png';
  else link.removeAttribute('type');
}
