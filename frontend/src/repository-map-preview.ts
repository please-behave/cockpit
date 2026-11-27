import { completedRuleSets, type RepositoryOverview } from './api/client';
import type { RepositoryMap } from './components/pb-repository-map';
import './components/pb-repository-map';

const map = document.querySelector<RepositoryMap>('pb-repository-map')!;
const [response, completed] = await Promise.all([
  fetch('/v0/repositories/overview?preview=repository-map'),
  completedRuleSets(new AbortController().signal),
]);
if (!response.ok) throw new Error('Could not load the repository map fixture');
const overview = await response.json() as RepositoryOverview;
map.setsByRepository = new Map(completed.map(({ repository, sets }) => [repository, sets]));
map.repositories = overview.repositories;
