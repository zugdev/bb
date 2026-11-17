const BLOCK_START = "# bb focus mode start";
const BLOCK_END = "# bb focus mode end";
const BLOCK_PATTERN = new RegExp(`\\n?${BLOCK_START}\\n[\\s\\S]*?${BLOCK_END}\\n?`, "u");
const DOMAIN_PATTERN = /^[a-z0-9.-]+$/u;

export function parseDomains(text: string): string[] {
  const domains = text
    .split(/[\s,]+/u)
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => DOMAIN_PATTERN.test(domain));
  return [...new Set(domains.flatMap((domain) => (domain.startsWith("www.") ? [domain] : [domain, `www.${domain}`])))];
}

export function isBlocking(hosts: string): boolean {
  return BLOCK_PATTERN.test(hosts);
}

export function withFocusBlock(hosts: string, domains: readonly string[] | null): string {
  const base = hosts.replace(BLOCK_PATTERN, "\n").replace(/\n+$/u, "\n");
  if (domains === null || domains.length === 0) return base;
  const lines = domains.flatMap((domain) => [`0.0.0.0 ${domain}`, `:: ${domain}`]);
  return `${base}${BLOCK_START}\n${lines.join("\n")}\n${BLOCK_END}\n`;
}
