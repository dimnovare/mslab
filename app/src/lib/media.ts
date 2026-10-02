/**
 * Public URL for a stored image key.
 * "/seed/x.jpg" (static asset) and absolute http(s) URLs are returned as-is; anything else is an R2 key
 * ("img/abc.jpg") served by the /media route. A key starting with two slashes or backslashes ("//host/x.jpg",
 * "/\host/x.jpg") is not a site path but a protocol-relative address of another host, so it is refused (""), as an
 * empty key is.
 */
export function mediaUrl(key: string): string {
  if (!key) return "";
  if (/^[/\\]{2}/.test(key)) return "";
  if (key.startsWith("/") || /^https?:\/\//i.test(key)) return key;
  return "/media/" + key.split("/").map(encodeURIComponent).join("/");
}
