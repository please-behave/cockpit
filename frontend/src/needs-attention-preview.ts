import type { RepositoryOverview } from './api/client';
import { NeedsAttention } from './components/pb-needs-attention';

const fixture = new URLSearchParams(location.search).has('clear') ? 'needs-attention-clear' : 'needs-attention';
const response = await fetch('/v0/repositories/overview?preview=' + fixture);
if (!response.ok) throw new Error('Could not load the needs-attention fixture');
const overview = await response.json() as RepositoryOverview;
const widget = new NeedsAttention();
widget.repositories = overview.repositories;
document.querySelector('main')!.append(widget);
