const { checkClashes } = require("./clashService");
const { combinationKey } = require("./planRankingService");

const SEARCH_LIMITS = Object.freeze({ max_candidates: 200, max_nodes: 20000 });

// Domains are prevalidated for academic eligibility, term, full slot data and
// hard constraints. Locked singleton domains are visited first, then smallest
// domains. Pair caching and forward checking prune incompatible branches.
function searchTimetables(domains, limits = SEARCH_LIMITS) {
  const ordered = [...domains].sort((a, b) => Number(b.locked) - Number(a.locked) ||
    a.indexes.length - b.indexes.length || a.course_code.localeCompare(b.course_code));
  const cache = new Map(), seen = new Set(), candidates = [];
  const stats = { visited_nodes: 0, clash_prunes: 0, forward_prunes: 0, candidates_found: 0,
    exhaustive: true, limit_reason: null, ...limits };
  const key = index => `${index.course_code}/${index.index_no}`;
  function compatible(a, b) {
    const pair = [key(a), key(b)].sort().join("|");
    if (!cache.has(pair)) cache.set(pair, checkClashes([a, b]).can_save);
    return cache.get(pair);
  }
  function visit(depth, chosen) {
    if (candidates.length >= limits.max_candidates || stats.visited_nodes >= limits.max_nodes) {
      stats.exhaustive = false;
      stats.limit_reason = candidates.length >= limits.max_candidates ? "CANDIDATE_LIMIT" : "NODE_LIMIT";
      return;
    }
    if (depth === ordered.length) {
      const signature = combinationKey(chosen);
      if (!seen.has(signature)) { seen.add(signature); candidates.push([...chosen]); }
      return;
    }
    for (const index of [...ordered[depth].indexes].sort((a, b) => a.index_no - b.index_no)) {
      if (!stats.exhaustive) break;
      stats.visited_nodes++;
      if (!chosen.every(other => compatible(index, other))) { stats.clash_prunes++; continue; }
      const next = [...chosen, index];
      if (ordered.slice(depth + 1).some(domain => !domain.indexes.some(candidate => next.every(other => compatible(candidate, other))))) {
        stats.forward_prunes++;
      } else visit(depth + 1, next);
      if (stats.visited_nodes >= limits.max_nodes && stats.exhaustive) {
        stats.exhaustive = false; stats.limit_reason = "NODE_LIMIT";
      }
    }
  }
  if (ordered.length && ordered.every(domain => domain.indexes.length)) visit(0, []);
  stats.candidates_found = candidates.length;
  return { candidates, search: stats };
}
module.exports = { searchTimetables, SEARCH_LIMITS };
