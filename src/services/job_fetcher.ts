/**
 * job_fetcher.ts
 * Unified Job Fetcher Architecture.
 *
 * Fetches jobs from LinkedIn and Naukri in parallel via self-hosted Lambda microservices.
 */



/** Single search query sent to the scraper engine */
export interface SearchQuery {
  keyword: string;
  location: string;
  geoId?: string;
}

// Major Indian tech city geoIds for pinpoint location targeting
const CITY_GEO_IDS: Record<string, string> = {
  'bengaluru': '90009633',
  'bangalore': '90009633',
  'hyderabad': '90009650',
  'mumbai': '90009639',
  'pune': '114806696',
  'chennai': '106888327',
  'india': '102713980',
};

// ─── QUERY BUILDER ─────────────────────────────────────────────────────────

export function buildSearchQueriesFromProfile(user: {
  suggestedJobTitles?: string[] | null;
  targetLocations?: string | null;
}, platform: 'linkedin' | 'naukri' | 'simplyhired' | 'indeed'): SearchQuery[] {
  const keywords = extractKeywords(user);
  let locations: Array<{ name: string; geoId?: string }> = [];

  if(platform === 'naukri' || platform === 'indeed') {
    locations = [{ name: 'India', geoId: CITY_GEO_IDS['india'] }];
  }
  else {
    locations = extractLocations(user);
  }

  if (keywords.length === 0 || locations.length === 0) return [];

  const queries: SearchQuery[] = [];
  for (const keyword of keywords) {
    for (const location of locations) {
      queries.push({
        keyword,
        location: location.name,
        geoId: location.geoId,
      });
    }
  }
  return queries;
}

function extractKeywords(user: {
  suggestedJobTitles?: string[] | null;
}): string[] {
  if (user.suggestedJobTitles && user.suggestedJobTitles.length > 0) {
    return user.suggestedJobTitles.slice(0, 5);
  }
  return [];
}

function extractLocations(user: {
  targetLocations?: string | null;
}): Array<{ name: string; geoId?: string }> {
  if (user.targetLocations) {
    const locs = user.targetLocations.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
    if (locs.length > 0) {
      return locs.map(loc => ({
        name: loc,
        geoId: CITY_GEO_IDS[loc],
      }));
    }
  }

  // Default: Search across all major Indian tech cities + nationwide for maximum precision
  return [
    { name: 'Bengaluru', geoId: '90009633' },
    { name: 'Hyderabad', geoId: '90009650' },
    { name: 'Mumbai', geoId: '90009639' },
    { name: 'Delhi', geoId: '106187582' },
    { name: 'Gurugram', geoId: '115884833' },
    { name: 'Noida', geoId: '104869687' },
    { name: 'Pune', geoId: '114806696' },
    { name: 'Chennai', geoId: '106888327' },
    { name: 'India', geoId: '102713980' },
  ];
}



