const repository = /^github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const commitId = /^[0-9a-f]+$/i;

/**
 * The repository value is a claim of the sender. Only the exact form
 * `github.com/<owner>/<name>` yields a link target.
 */
export function commitUrl(repositoryValue: string, commit: string): string | undefined {
  const match = repository.exec(repositoryValue);
  if (!match || !commitId.test(commit) || [match[1], match[2]].some(part => /^\.+$/.test(part))) return undefined;
  return `https://github.com/${match[1]}/${match[2]}/commit/${commit}`;
}

// Rule sources are scheme-free Git identities. Only build HTTPS links from a host and repository path.
export function repositoryUrl(source: string): string | undefined {
  const [host, ...path] = source.split('/');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host)
      || !path.length || path.some(part => !part || part === '.' || part === '..' || /[%\\?#\s\u0000-\u001f\u007f]/u.test(part))) {
    return undefined;
  }
  return `https://${host}/${path.map(encodeURIComponent).join('/')}`;
}
