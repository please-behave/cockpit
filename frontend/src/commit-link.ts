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
