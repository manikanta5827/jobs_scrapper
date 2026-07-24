/**
 * user_keywords.ts
 * Generates per-user exclude title keywords via 1-time DeepSeek LLM call during user creation/onboarding.
 */

// Generate a comprehensive list of job title keywords and level codes to drop based on candidate resume
export async function generateExcludeKeywordsWithLLM(
  resumeText: string
): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY!;
  
  // System prompt instructing LLM to output a thorough JSON array of exclude title keywords across all categories
  const prompt = `You are an expert HR sourcer analyzing a candidate's resume plain text.
Your goal is to extract a comprehensive JSON array "excludeTitleKeywords" containing words, phrases, level codes, and tech stacks that must be REJECTED in job titles for this candidate.

Consider:
1. Seniority & Management Titles: Senior, Sr, Lead, Principal, Architect, Staff, Manager, Director, Head of, VP, Vice President, Founder, Co-Founder, Executive.
2. Numerical Level Codes: SDE2, SDE-2, SDE3, SDE-3, L2, L3, L4, L5, IC2, IC3, IC4, II, III, IV, Engineer 2, Engineer 3.
3. Experience Indicators: 5+ years, 6+ years, 7+ years, 8+ years, 10+ years, 5+ YOE, 10+ YOE.
4. Non-matching Stacks & Specializations: If candidate is a Backend/Cloud engineer, exclude non-backend roles like Frontend, UI/UX, Designer, Mobile, iOS, Android, Flutter, React Native, QA, Tester, Support, IT Helpdesk, Data Scientist, Data Engineer, Hardware, Embedded, Sales.

Return ONLY a valid JSON object with the "excludeTitleKeywords" array of strings.

CANDIDATE RESUME:
${resumeText.slice(0, 4000)}`;

  // Call DeepSeek Chat API with JSON response format
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const fallbackList = [
    "Senior", "Sr.", "Lead", "Principal", "Architect", "Manager", "Staff", "Director", "VP", 
    "Head of", "SDE2", "SDE-2", "SDE3", "SDE-3", "L2", "L3", "L4", "II", "III", "IV", 
    "5+ years", "8+ years", "10+ years"
  ];

  // Handle API error response
  if (!res.ok) {
    const errText = await res.text();
    console.error("DeepSeek keyword extraction failed:", errText);
    return fallbackList;
  }

  // Parse and extract array from LLM response
  try {
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const extracted = content.excludeTitleKeywords;

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return fallbackList;
    }

    return extracted.map((s: any) => String(s).trim()).filter(Boolean);
  } catch (err) {
    console.error("Error parsing LLM exclude keywords output:", err);
    return fallbackList;
  }
}
