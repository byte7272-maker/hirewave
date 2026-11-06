// Category-bucketed cover imagery for job cards. Each URL is a fully hardcoded
// literal string; the helper only *selects* one, never builds a URL.
const COVERS = {
  design:
    "https://readdy.ai/api/search-image?query=Abstract%20soft%20geometric%20shapes%20in%20warm%20cream%2C%20muted%20emerald%20and%20coral%20tones%2C%20smooth%20rolling%20arcs%20and%20circles%2C%20minimal%20editorial%20gradient%20art%20background%2C%20clean%20gallery%20aesthetic%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-design-01&orientation=landscape",
  engineering:
    "https://readdy.ai/api/search-image?query=Abstract%20interlocking%20grid%20lines%20and%20soft%20rounded%20blocks%20in%20warm%20cream%20with%20muted%20emerald%20and%20coral%20accents%2C%20minimal%20editorial%20tech%20gradient%20art%20background%2C%20calm%20balanced%20composition%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-engineering-01&orientation=landscape",
  growth:
    "https://readdy.ai/api/search-image?query=Abstract%20rising%20curved%20shapes%20and%20soft%20overlapping%20bars%20in%20warm%20cream%20with%20muted%20emerald%20and%20coral%20tones%2C%20minimal%20editorial%20gradient%20art%20background%2C%20optimistic%20upward%20mood%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-growth-01&orientation=landscape",
  finance:
    "https://readdy.ai/api/search-image?query=Abstract%20stacked%20coin-like%20rounded%20discs%20and%20soft%20arcs%20in%20warm%20cream%20with%20muted%20emerald%20and%20clay%20tones%2C%20minimal%20editorial%20gradient%20art%20background%2C%20calm%20premium%20mood%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-finance-01&orientation=landscape",
  data:
    "https://readdy.ai/api/search-image?query=Abstract%20constellation%20of%20soft%20dots%20and%20gentle%20lines%20in%20warm%20cream%20with%20muted%20emerald%20and%20coral%20tones%2C%20minimal%20editorial%20gradient%20art%20background%2C%20analytical%20orderly%20mood%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-data-01&orientation=landscape",
  people:
    "https://readdy.ai/api/search-image?query=Abstract%20soft%20overlapping%20translucent%20circles%20in%20warm%20cream%20with%20muted%20emerald%20and%20clay%20tones%2C%20minimal%20editorial%20gradient%20art%20background%2C%20warm%20human%20communal%20mood%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-people-01&orientation=landscape",
  general:
    "https://readdy.ai/api/search-image?query=Abstract%20soft%20flowing%20gradient%20waves%20in%20warm%20cream%20with%20muted%20emerald%20and%20coral%20tones%2C%20minimal%20editorial%20gradient%20art%20background%2C%20calm%20neutral%20mood%2C%20soft%20diffused%20light%2C%20high%20detail&width=800&height=300&seq=jobcover-general-01&orientation=landscape",
} as const;

/** Pick the themed cover for a role by its category (falling back to the title). */
export function jobCoverImage(job: { category?: string; title?: string }): string {
  const text = `${job.category ?? ""} ${job.title ?? ""}`.toLowerCase();
  if (/(design|brand|ux|ui|creative|motion|visual)/.test(text)) return COVERS.design;
  if (/(engineer|frontend|backend|developer|software|internal tools|platform|infra)/.test(text))
    return COVERS.engineering;
  if (/(growth|marketing|onboarding|acquisition|retention|content|social)/.test(text))
    return COVERS.growth;
  if (/(fintech|finance|payments|banking|accounting|saas|b2b)/.test(text)) return COVERS.finance;
  if (/(data|research|analytics|machine|ai|ml|insight)/.test(text)) return COVERS.data;
  if (/(people|hr|recruit|talent|community|support)/.test(text)) return COVERS.people;
  return COVERS.general;
}