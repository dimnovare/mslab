/**
 * Public URL for a stored image key.
 * "/seed/x.jpg" (static asset) and absolute URLs are returned as-is; anything else is an R2 key
 * ("img/abc.jpg") served by the /media route.
 */
export function mediaUrl(key: string): string {
  if (!key) return "";
  if (key.startsWith("/") || /^https?:\/\//i.test(key)) return key;
  return "/media/" + key.split("/").map(encodeURIComponent).join("/");
}
