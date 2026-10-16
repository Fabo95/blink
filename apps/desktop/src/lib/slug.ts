/** A git branch name suggested from free text: the first few words, lowercase ASCII, joined
 *  with `-` (e.g. "Fix login for SSO users!" → `fix-login-for-sso-users`). */
export function branchSlug(text: string, maxWords = 6): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 60);
}
