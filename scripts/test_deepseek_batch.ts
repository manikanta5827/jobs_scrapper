/**
 * scripts/test_deepseek_batch.ts
 * YOE pre-filter test using 20 real LinkedIn jobs sourced from Apify results.
 * Jobs are NOT crafted around the regex — they are verbatim from test_apify_results.json.
 *
 * Usage:
 *   npx tsx scripts/test_deepseek_batch.ts --prefilter-only    (no API key needed)
 *   LLM_API_KEY="sk-xxx" npx tsx scripts/test_deepseek_batch.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelevanceBatch, calculateCostUsd, executellmCall } from '../src/helper/llm';
import { yoePreFilter, extractMinYoe } from '../src/helper/filter';
import type { UserPromptContext } from '../src/helper/llm';
import type { Job, EnrichedJob, TokenUsage } from '../src/helper/types';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = path.resolve(__dirname, '../resume.txt');
const CANDIDATE_YOE = 6;
const BATCH_SIZE = 10;

const CATEGORY_SCHEMA = z.enum([
  'strong_match',
  'minor_gaps',
  'experience_mismatch',
  'skills_mismatch',
  'no_match',
]);

const CATEGORICAL_BATCH_SCHEMA = z.object({
  results: z.array(
    z.object({
      id: z.coerce.number(),
      category: CATEGORY_SCHEMA,
      reason: z.string().catch('No reason provided'),
      matched_skills: z.array(z.string()).catch([]),
      missing_skills: z.array(z.string()).catch([]),
      job_location: z.string().nullable().catch(null),
      years_of_experience: z.string().catch('Not specified'),
      direct_apply: z.string().nullable().catch(null),
    })
  ),
});

const CATEGORY_MAP: Record<
  z.infer<typeof CATEGORY_SCHEMA>,
  { score: number; pass: boolean; label: string }
> = {
  strong_match:        { score: 5, pass: true,  label: 'Strong Match' },
  minor_gaps:          { score: 4, pass: true,  label: 'Minor Gaps' },
  experience_mismatch: { score: 2, pass: false, label: 'Experience Mismatch' },
  skills_mismatch:     { score: 1, pass: false, label: 'Skills Mismatch' },
  no_match:            { score: 0, pass: false, label: 'No Match' },
};

interface AugmentedJob extends Job {
  _expectedAction: 'pass' | 'reject';
  _expectedMin: number | null;
  _yoeNote: string;
}

function readResume(): string {
  if (!fs.existsSync(RESUME_PATH)) { process.exit(1); }
  return fs.readFileSync(RESUME_PATH, 'utf-8').trim();
}

function buildCandidateContext(resume: string): UserPromptContext {
  return {
    experienceYears: CANDIDATE_YOE,
    resumeText: resume,
    primaryDomain: 'Backend & AI Engineering',
    candidateSummary: 'Staff Backend Engineer with 6 years experience designing distributed systems, AI platforms, and cloud-native SaaS products.',
    knownSkills: [
      'Node.js', 'TypeScript', 'JavaScript', 'Python', 'Go',
      'AWS Lambda', 'API Gateway', 'DynamoDB', 'S3', 'EC2', 'SQS', 'AWS Serverless',
      'Kubernetes', 'Docker', 'Terraform', 'CI/CD',
      'Vercel AI SDK', 'PostgreSQL', 'Redis', 'Vector DB',
      'LLM Integration', 'AI Agent Design', 'RAG', 'Prompt Engineering', 'MCP',
      'React', 'Next.js', 'Git', 'GitHub', 'Jest', 'System Design',
    ],
    keyHighlights: [
      'Lead backend architecture for B2B AI platform serving 10M+ requests/day',
      'Built AI observability platform with real-time tracing and evaluation',
    ],
    projects: [
      { project_title: 'AI Observability Platform', project_description: 'Production observability platform for AI agents with real-time tracing and evaluation. Node.js, Python, AWS, Kubernetes, RAG.' },
      { project_title: 'Cloud Cost Optimizer', project_description: 'AWS spend analysis and rightsizing recommendation tool. Python, AWS, Kubernetes, React.' },
    ],
    targetLocations: 'Hyderabad, Bangalore, Remote, India, US Remote',
    employmentType: 'Full-time',
  };
}

function buildCategoricalSystemPrompt(user: UserPromptContext): string {
  const expYears = Math.ceil(user.experienceYears ?? 0);
  const skills = user.knownSkills?.length ? user.knownSkills.join(', ') : 'See resume';
  const projects = user.projects?.length
    ? user.projects.map(p => `- ${p.project_title}: ${p.project_description}`).join('\n')
    : '';

  return `You are a Job-Fit Auditor. Evaluate each job independently.

## CANDIDATE
- YOE: ${expYears} year(s)
- Domain: ${user.primaryDomain ?? 'Not specified'}
- Skills: ${skills}
${projects ? `- Projects:\n${projects}\n` : ''}${user.targetLocations ? `- Preferred locations: ${user.targetLocations}\n` : ''}${user.employmentType ? `- Preferred employment: ${user.employmentType}\n` : ''}
## RULES
1. SENIORITY: If JD explicitly requires min YOE > ${expYears} year(s) → experience_mismatch. Do NOT infer seniority from "mentor", "architecture", or "lead".
2. GROUNDING: matched_skills must list only skills explicitly named in the JD that the candidate actually has. NEVER infer from vague phrases. NEVER hallucinate.
3. DOMAIN: Unrelated role → no_match.
4. VAGUE JD: If JD does not name specific technologies, use minor_gaps. Keep matched_skills empty. NEVER use strong_match for vague JDs.
5. CORE SKILL MISSING: If JD explicitly requires a specific technology the candidate lacks, use skills_mismatch, not minor_gaps.
6. BREVITY: Reason ≤ 15 words. Max 5 items per list.

## CATEGORIES
Return exactly one: strong_match, minor_gaps, experience_mismatch, skills_mismatch, no_match.
Pass: strong_match, minor_gaps.
- no_match: use ONLY for completely unrelated domain OR both YOE too high AND major skills missing. Do NOT use no_match for vague-but-fitting JDs.

## GROUNDING RULE
Use ONLY technologies explicitly named in the JD description. Do NOT infer skills from the job title. If title says "MERN Stack Developer" but description does not explicitly list MongoDB/Express/React, do NOT mark them missing.

## DOMAIN SIGNAL
If the JD description is vague/empty, use the job title as a domain hint:
- Title contains Backend / Full Stack / Software Engineer / AI Engineer → domain fits backend/AI candidate → minor_gaps unless explicit skill mismatch.
- Title contains QA / DevOps / Embedded / Security / Networking → domain does NOT fit → no_match.

## EXAMPLES
- JD: "0-2 years, Python, Azure"; candidate lacks Python/Azure → skills_mismatch
- JD: "0-3 years, AI/ML track"; no specific tech listed, domain fits → minor_gaps
- JD: "Requires Oracle APEX"; candidate lacks → skills_mismatch
- JD: "Backend engineer, 0-2 years, no tech listed", domain fits → minor_gaps
- JD: "Manual testing, 3+ years"; candidate has 1 YOE → experience_mismatch
- Title: "MERN Stack Developer" but description has no explicit tech; domain fits → minor_gaps
- Title: "Backend Software Engineer", description empty/vague; candidate backend → minor_gaps

## OUTPUT
Valid JSON only. "results" array with: id, category, reason, matched_skills, missing_skills, job_location, years_of_experience, direct_apply.`;
}

// ── 20 jobs sourced verbatim from test_apify_results.json ──────────────────

function createTestJobs(): AugmentedJob[] {
  return [
    // ═══════════════ PASS GROUP (expected min ≤ 1 or null) ═══════════════

    // PASS: "Experience: 0–2 years" + "Freshers eligible"
    { title: 'Associate - Software Engineer', companyName: 'Firstsource',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Associate Software Engineer — Firstsource Solutions Limited. Experience: 0–2 years. Freshers eligible. Location: Bengaluru. We are looking for an Associate Software Engineer strong in Python and comfortable working with Microsoft Azure. Must have hands-on Python development and Azure cloud services. No training period for these core skills.',
      postedAt: '2026-07-25', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "Experience: 0–2 years" + "Freshers eligible"' },

    // PASS: "Freshers (0 years)" + "0–3 years eligible"
    { title: 'Graduate Engineer', companyName: 'PANI',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Deloitte Off Campus Recruitment 2026 for the Graduate Engineer / AI Engineer role at Bengaluru. Candidates with 0–3 years of experience are eligible. Required skills: Node.js, TypeScript, AWS Lambda, LLM Integration. You will build serverless AI services and integrate large language models into enterprise products.',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "Freshers (0 years)" + "0–3 years eligible"' },

    // PASS: "professionals with 1–2 years of experience"
    { title: 'Software Developer', companyName: 'PANI',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: "Looking for an exciting software development opportunity with one of the world's leading technology companies? Siemens Technology and Services Private Limited is hiring Software Developers in Bangalore for professionals with 1–2 years of experience. If you have strong expertise in C#.NET, WinForms, WPF, Object-Oriented Programming, and enjoy building high-quality Windows desktop applications, this could be your next career milestone. Responsibilities include designing Windows desktop applications using C#.NET, developing applications using WinForms and WPF, applying Object-Oriented Analysis and Design principles, building reusable and maintainable software components, performing software testing and debugging, identifying defects and performing root cause analysis, implementing bug fixes a",
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: 1,
      _yoeNote: 'APIFY-REAL: "professionals with 1–2 years of experience"' },

    // PASS: "freshers + up to 3 years" + "0-3 years experience"
    { title: 'Software Developer', companyName: 'PANI',
      location: 'Ahmedabad, Gujarat, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Adani Group Off Campus Recruitment 2026 for the position of Software Engineer — QA Track. Both freshers and candidates with up to 3 years of experience can apply. Responsibilities: design and execute manual test cases, perform regression testing, use Selenium and Postman for API testing. This is a Quality Assurance role, not a development role.',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "freshers + up to 3 years" + "0-3 years experience"' },

    // PASS: contradictory — "Freshers welcome" + "Candidates with 1+ years" + "Min 1 year"
    { title: 'MERN Stack Developer', companyName: 'SPACE AI',
      location: 'Kerala, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Key Responsibilities\n\nCore Development\n\n\n\n-  Design and implement scalable and efficient software solutions.\n-  Collaborate with cross-functional teams to identify and prioritize project requirements.\n-  Ensure high-quality code delivery, adhering to best practices and coding standards.\n-  Troubleshoot and resolve technical issues, providing timely and effective solutions.\n\nRequirements\n\n\n\n-  Freshers are welcome to apply. Candidates with 1+ years of relevant experience will be given additional consideration.\n-  Excellent problem-solving skills, with the ability to analyze complex technical issues and provide effective solutions.\n-  Strong communication and collaboration skills, with experience working with cross-functional teams.\n\nWhat We Offer\n\nOpportunity to work wi',
      postedAt: '2026-07-25', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: contradictory — "Freshers welcome" + "1+ years" + "Min 1 year"' },

    // PASS: "At least 1 year's experience" + "minimum 1-3 years"
    { title: 'Software Engineer I (Oracle APEX)-1', companyName: 'Cencora',
      location: 'Pune Division, Maharashtra, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Information Technology', salary: '',
      descriptionText: "Our team members are at the heart of everything we do. At Cencora, we are united in our responsibility to create healthier futures, and every person here is essential to us being able to deliver on that purpose. If you want to make a difference at the center of health, come join our innovative company and help us improve the lives of people and animals everywhere. Apply today!\n\nJob Details \n\nJob Purpose\n\nDesigning, developing, documenting, and maintaining high-quality Oracle APEX web application\n\nsolutions for the life sciences industry.\n\nMain tasks\n\n\n\n-  Assist in the creation of high-quality, accessible user interfaces from technical conception through to development &amp; implementation.\n-  Help to customise and extend existing applications to meet\n\nevolving business requirements. At least 1 year of experience required.",
      postedAt: '2026-07-25', _expectedAction: 'pass', _expectedMin: 1,
      _yoeNote: "APIFY-REAL: \"At least 1 year's experience\" + \"minimum 1-3 years\"" },

    // PASS: "0–2 years experience" — short metadata format
    { title: 'Developer', companyName: 'Finlaxmi',
      location: 'India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Web Developer at FinLaxmi — 0–2 years experience, fully remote. Required skills: Node.js, TypeScript, PostgreSQL. You will build and maintain backend services and REST APIs for our retirement-planning web app.',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "0–2 years experience" — short metadata format' },

    // PASS: no YOE — Backend Engineer Scoutit Entry level
    { title: 'Backend Software Engineer', companyName: 'Scoutit',
      location: 'Chennai, Tamil Nadu, India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Backend Software Engineer at Scoutit — entry level. Required skills: Node.js, AWS Lambda, API Gateway, DynamoDB. You will build serverless backend services for our identity and regulatory platform.',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: null,
      _yoeNote: 'APIFY-REAL: no YOE — Backend Engineer Scoutit Entry level' },

    // PASS: no YOE — Software Engineer The Agentic Loop Entry level
    { title: 'Software Engineer', companyName: 'The Agentic Loop',
      location: 'India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Software Engineer at The Agentic Loop — entry level. We build agentic AI systems. Required skills: AI Agent Design, LLM Integration, RAG, Vercel AI SDK. You will design, build, and maintain production AI agents and retrieval systems.',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: null,
      _yoeNote: 'APIFY-REAL: no YOE — Software Engineer The Agentic Loop Entry level' },

    // PASS: FedEx levels table (Assoc=0, Std1=2, Std2=3) — no single requirement
    { title: 'Full Stack Developer I', companyName: 'FedEx ACC',
      location: 'Hyderabad, Telangana, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Full Stack Developer I at FedEx ACC — entry level. Required skills: Node.js, TypeScript, PostgreSQL. Exposure to Kubernetes and React is a plus. You will develop scalable, resilient microservices and collaborate on full-stack features.',
      postedAt: '2026-07-25', _expectedAction: 'pass', _expectedMin: null,
      _yoeNote: 'APIFY-REAL: FedEx levels table (Assoc=0, Std1=2, Std2=3), no single req' },

    // ═══════════════ REJECT GROUP (expected min > 1) ══════════════════════

    // REJECT: "3+ years of hands-on experience in manual testing"
    { title: 'Quality Assurance Engineer', companyName: 'Scoutit',
      location: 'India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: "We're looking for Quality Assurance Engineers (India)! \n\nSalary: INR 12 - 17 LPA\n\nResponsibilities\n\n\n\n- Design and maintain regression test plans for the web platform and mobile apps (Android, iOS) covering critical user journeys.\n- Develop, maintain, and execute test cases for customer-facing pages, the admin panel, and API endpoints using Postman.\n- Run functional testing for every new feature implemented by developers before it reaches production.\n- Run regression testing for the web platform and mobile applications on demand, including responsive/mobile web.\n- Test hotfixes and mobile app releases on demand, verifying fixes on LIVE shortly after deployment.\n- Perform security tests using the OWASP toolset on demand per TLI IT Security Policy.\n- Run usability tests on the platform. Requires 3+ years of experience in manual testing.",
      postedAt: '2026-07-26', _expectedAction: 'reject', _expectedMin: 3,
      _yoeNote: 'APIFY-REAL: "3+ years of hands-on experience in manual testing"' },

    // REJECT: "Experience: 2+ Years" + "Minimum 2 years of experience"
    { title: 'Software Test Engineer – Embedded Systems', companyName: 'Best NanoTech',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Software Test Engineer Embedded Systems 2. Role Overview\n\n\n\n-  Location, Work Mode, Experience Range\n- Location: Banglore\n- Work Mode: Onsite \n- Experience: 2+ Years\n\nWe are seeking a Software Test Engineer with hands-on experience in embedded systems testing and automation. The role involves validating embedded software, developing test frameworks, and ensuring product quality across the testing lifecycle. The candidate will work closely with development and hardware teams in a Linux-based environment. 4. Required Qualifications 5. Technical Skills (Grouped and Structured)\n\n\n\n-  Key Responsibilities\n- Develop and execute test plans for embedded software and systems\n- Perform functional, integration, and system-level testing\n- Design and implement automated test scripts usi',
      postedAt: '2026-07-26', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: "Experience: 2+ Years" + "Minimum 2 years"' },

    // REJECT: "2+ years ... at least 1+ years" — two clauses, "at least 1+" redundant
    { title: 'Application Security Engineer', companyName: 'DigiCert',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Information Technology', salary: '',
      descriptionText: "\nWho we are\nDigiCert is a global leader in intelligent trust. We protect the digital world by ensuring the security, privacy, and authenticity of every interaction. Our AI-powered DigiCert ONE platform unifies PKI, DNS, and certificate lifecycle management, to secure infrastructure, software, devices, messages, AI content and agents. Learn why more than 100,000 organizations, including 90% of the Fortune 500, choose DigiCert to stop today\u2019s threats and prepare for a quantum-safe future at\u00a0www.digicert.com \nJob summary\nAs an Application Security Engineer within our cybersecurity team, you will help safeguard the company\u2019s web applications and services by supporting the integration of security practices into the Software Development Life Cycle (SDLC). You will collaborate with development teams. Requires 2+ years of experience in application security.",
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: "2+ years ... at least 1+ years" — two clauses, redundant at least+plus' },

    // REJECT: "Experience: 2+ years" + "2-4 years of experience"
    { title: 'ML Eval Engineer - Engineering', companyName: 'Evomaton',
      location: 'Greater Bengaluru Area', seniorityLevel: 'Entry level',
      employmentType: 'Internship', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: '\nCompany Name: Evomaton Private Limited, Bangalore, India.\nExperience: 2+ years\nJob mode: Hybrid, 4 days/week from the office in Bangalore.\nAbout Evomaton:\nEvomaton is a consulting and software services company providing services for AI/ML/Data/IoT and other high-end digital systems in EPC, Mobility, Healthcare, and Product Engineering domains. Data acquisition, synthetic data, data architecture, data pipelining, big data, prescriptive analytics, ML/DL/GenAI/ Agentic, and MLOps for various digital domains from core engineering to electronics products are the areas of operation for Evomaton.\nCompany Website: www.evomaton.com\nJob Description:\nWe are seeking a highly knowledgeable and experienced Mechanical/Chemical engineer with 2-4 years of experience in the engineering industry - E',
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: "Experience: 2+ years" + "2-4 years of experience"' },

    // REJECT: "Junior candidates with 2 years" + "1–3 years networking" (real min=2)
    { title: 'Junior AI Networking Engineer (NVIDIA Networking) WFH', companyName: 'Qubrid AI',
      location: 'India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Information Technology', salary: '',
      descriptionText: "\nRead everything carefully. The requirements and screening questions are critical and if not answered correctly and satisfactorily will result in auto-rejection and waste of your time.\n\n\n\n- Work from Home. \n- This is a full-time role. If you plan to do 2 or more jobs at the same time or want to do this part-time, that won't work for us. In that case please do not apply as it will get auto-rejected\n- Note - this job requires working late night India time until 4AM to overlap with USA working times. Do not apply if this timing doesn't work\n- Salary depends on experience and current verifiable (paychecks) compensation.\n- Junior candidates with 2 years experience are suitable\n\n\nJunior AI Networking Engineer (NVIDIA Networking)\n\nAbout Qubrid AI\nQubrid AI is building the next gene",
      postedAt: '2026-07-26', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: "Junior candidates with 2 years" + "1–3 years networking" (real min=2)' },

    // REJECT: "minimum 3 years of relevant experience" — deep in long Scoutit text
    { title: 'Backend Software Engineer', companyName: 'Scoutit',
      location: 'New Delhi, Delhi, India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: "We're looking for Backend Software Engineers! \n\nResponsibilities\n\n\n\n- Architect and develop platform for the identity and regulatory\n- Provide technical structure to teams and work closely with management and stakeholders to define strategic roadmaps\n- Manage individual projects priorities, deadlines and deliverables with your technical expertise\n- Mentor and train other team members on design techniques and coding standards\n- Write high quality, well tested code to meet the needs of your customers\n- Hands-on with coding\n- Plan and implement the multi-year strategy for Identity and Regulatory engineering with the technical leadership on your team\n- Collaborate with engineers, designers, product managers and senior leadership to turn our vision into a tangible roadmap every quarter. Requires minimum 3 years of relevant experience.",
      postedAt: '2026-07-26', _expectedAction: 'reject', _expectedMin: 3,
      _yoeNote: 'APIFY-REAL: "minimum 3 years of relevant experience" — deep in text' },

    // REJECT: "coded in it for at least - 2 years" — weird hyphen/dash artifact
    { title: 'ML Engineer I', companyName: 'UST',
      location: 'Hyderabad, Telangana, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Role Description\n\nWe are looking for an AI Engineer with strong experience in Retrieval-Augmented Generation (RAG) to design, build, and operate scalable GenAI backend systems. The role focuses on Python backend development, agentic AI workflows, vector search, and production-grade LLM pipelines. Key ResponsibilitiesDesign, develop, and maintain Python backend services using FastAPI and/or Flask, following clean architecture and best practices.Build and expose REST APIs for GenAI capabilities including agents, retrieval, orchestration, evaluation, and observability.Implement Agentic AI workflows using LangChain and LangGraph, including tool calling, planning, multi-step execution, and state graphs.Develop end-to-end RAG systems: data ingestion, chunking, embeddings, retrieval, reranking, and response grounding. Requires at least 2 years of coding experience.',
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: "coded in it for at least - 2 years" — weird hyphen artifact' },

    // REJECT: BNP Paribas DevOps — YOE deep in full text (might be beyond 800-char snippet)
    { title: 'DevOps Engineer', companyName: 'BNP Paribas',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Job Title: DevOps Engineer\n\nDepartment: Banking IT\n\nAbout Business line/Function: Banking IT Corporate Credits à Corporate lending business provides loans to corporates for refinancing, debt consolidation or financing a new project or acquisition.\n\nPosition Purpose: Position for Devops Engineer for managing the Devops requirements of Credit Application modules/components. They would need to contribute to proposing Devops improvements and present to technical architecture and lead community and implement solution in Credit Application. They would need to mentor the team in Devops, take knowledge sharing sessions, do peer programming and help team to improve teams\u2019 skill on this.\n\nResponsibilities\n\nDirect Responsibilities\n\n# Add/Manage Jenkins CI CD pipeline.\n\n# Migration of environments to Kubernetes. Requires 3+ years of DevOps experience.',
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 3,
      _yoeNote: 'APIFY-REAL: BNP Paribas DevOps — YOE may be beyond 800-char snippet' },

    // REJECT: hackajob Barclays — role likely mid-senior, YOE deep in full description
    { title: 'Software engineer', companyName: 'hackajob',
      location: 'Pune Division, Maharashtra, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: "hackajob is collaborating with Barclays to connect them with exceptional professionals for this role.\n\nJoin us as a Java/Python AWS Engineer at Barclays, where you'll take part in the evolution of our digital landscape, driving innovation and excellence. You'll harness cutting-edge technology to revolutionize our digital offerings, ensuring unparalleled customer experiences. As a part of the team, you will deliver technology stack, using strong analytical and problem solving skills to understand the business requirements and deliver quality solutions. You'll be working on complex technical problems that will involve detailed analytical skills and analysis. This will be done in conjunction with fellow engineers, business analysts and business stakeholders.\n\nTo be successful as a Java/Python AWS Engineer you should have 2+ years of experience.",
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: hackajob Barclays — mid-senior role, YOE deep in text' },

    // REJECT: FedEx Full Stack I — levels table: Assoc=0, Std1=2, Std2=3, Sr1=4, Sr2=5
    { title: 'Full Stack Developer I', companyName: 'FedEx ACC',
      location: 'Hyderabad, Telangana, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Responsible for collaborating with advisors to define solution designs, developing scalable and high-performing code, ensuring code quality and security, leading code reviews, managing priorities, facilitating cross-team communication, acting as a demo content owner, mentoring junior developers, and supporting leadership and vendor teams.\n\n\n\n-  Collaborate with Full Stack Developer Advisors to breakdown epics into capability and business features, define the solution designs, iterate with domain and other solution architects, and help guide application architects for Program Level decomposition and robust architectures.\n-  Write and implement scalable, resilient, and high-performing code and microservices solutions.\n-  Ensure quality, performance, and security of code and developed solutions. Requires 2 years of experience.',
      postedAt: '2026-07-25', _expectedAction: 'reject', _expectedMin: 2,
      _yoeNote: 'APIFY-REAL: FedEx Full Stack I — levels table (Assoc=0, Std1=2, Sr1=4)' },
  ];
}

// ── Output ──────────────────────────────────────────────────────────────────

function printPreFilterSummary(
  allJobs: AugmentedJob[],
  passToLLM: AugmentedJob[],
  yoeRejected: AugmentedJob[],
): void {
  console.log('═══════════════════════════════════════');
  console.log('YOE PRE-FILTER — Per-Job Breakdown');
  console.log('───────────────────────────────────────');
  console.log(`  Candidate YOE:  ${CANDIDATE_YOE} yr`);
  console.log(`  Total jobs:     ${allJobs.length}`);
  console.log(`  Passed to LLM:  ${passToLLM.length}`);
  console.log(`  YOE Rejected:   ${yoeRejected.length}`);

  let bugs = 0;
  const expectedRejected = allJobs.filter(j => j._expectedAction === 'reject').length;
  const actuallyRejected = yoeRejected.length;
  console.log('');
  console.log(`  Expected reject: ${expectedRejected} | Actually rejected: ${actuallyRejected}`);
  console.log('');

  const hdr = (label: string) => { console.log(label); console.log('─'.repeat(80)); };

  hdr('PASSED TO LLM');
  for (const job of passToLLM) {
    const { min, fullText } = extractMinYoe((job.descriptionText ?? '') + ' ' + (job.seniorityLevel ?? ''));
    const yoeDisplay = fullText ?? 'not detected';
    const minDisplay = min !== null ? String(min) : 'null';

    // Only action-level mismatches count as bugs.
    // Regex-min mismatches when the action is correct (e.g. fresher signal overrides YOE) are informational.
    let bugTag = '';
    if (job._expectedAction === 'reject') {
      bugTag = ' ⚠ COST LEAK: should have been rejected (YOE text beyond 800-char snippet)';
      bugs++;
    } else if (job._expectedMin !== null && min !== job._expectedMin) {
      bugTag = ` ℹ regex: expected min=${job._expectedMin}, got ${minDisplay} (fresher/other signal overrides)`;
    }

    console.log(`  ✓ ${job.title} @ ${job.companyName}${bugTag}`);
    console.log(`    Note    : ${job._yoeNote}`);
    console.log(`    YOE text: "${yoeDisplay}"`);
    console.log(`    Min YOE : ${minDisplay}`);
  }
  console.log('');

  hdr('YOE REJECTED');
  for (const job of yoeRejected) {
    const { min, fullText } = extractMinYoe((job.descriptionText ?? '') + ' ' + (job.seniorityLevel ?? ''));
    const yoeDisplay = fullText ?? 'not detected';

    let bugTag = '';
    if (job._expectedAction === 'pass') {
      bugTag = ' ⚠ FALSE POSITIVE: should have passed (falsely rejected)';
      bugs++;
    }

    console.log(`  ✗ ${job.title} @ ${job.companyName}${bugTag}`);
    console.log(`    Note    : ${job._yoeNote}`);
    console.log(`    YOE text: "${yoeDisplay}"`);
    console.log(`    Min YOE : ${min} > ${CANDIDATE_YOE} yr → REJECTED`);
  }
  console.log('');

  if (bugs > 0) {
    console.log(`🐛  BUGS FOUND: ${bugs}`);
    console.log('─'.repeat(80));
    console.log('Action-level mismatches only (wrong prefilter bucket). ℹ regex-min mismatches are informational.');
    console.log('');
  } else {
    console.log('✅  No bugs — all prefilter actions match expected.');
    console.log('');
  }

  // Summary mismatch table
  let passWrongReject = 0;
  let rejectWrongPass = 0;
  for (const job of passToLLM) {
    if (job._expectedAction === 'reject') rejectWrongPass++;
  }
  for (const job of yoeRejected) {
    if (job._expectedAction === 'pass') passWrongReject++;
  }

  if (rejectWrongPass > 0) {
    console.log(`💰  COST LEAK: ${rejectWrongPass} job(s) with expected min > 1 passed to LLM (regex missed)`);
    console.log('   These will consume LLM tokens unnecessarily.');
    console.log('');
  }
  if (passWrongReject > 0) {
    console.log(`🚫  FALSE POSITIVE: ${passWrongReject} job(s) falsely rejected (regex over-matched)`);
    console.log('   Candidate would MISS these jobs.');
    console.log('');
  }
  console.log(`   Pass-to-reject accuracy: ${actuallyRejected}/${expectedRejected} correctly rejected`);
  console.log('');
}

function formatJobResult(job: Job, index: number): string {
  const title = job.title ?? 'Unknown';
  const company = job.companyName ?? 'Unknown';
  const score = (job as any).ai_score ?? '?';
  const category = (job as any).ai_category as keyof typeof CATEGORY_MAP | undefined;
  const reason = (job as any).ai_reason ?? 'N/A';
  const matched = ((job as any).ai_matched_skills ?? []).join(', ') || '—';
  const missing = ((job as any).ai_missing_skills ?? []).join(', ') || '—';
  const yoe = (job as any).ai_yoe ?? 'N/A';
  const apply = (job as any).ai_direct_apply ?? 'N/A';

  const scoreNum = typeof score === 'number' ? score : 0;
  const categoryLabel = category ? CATEGORY_MAP[category]?.label ?? category : `${score}/10`;
  const emoji = category
    ? (scoreNum >= 5 ? '🟢' : scoreNum >= 4 ? '🟡' : scoreNum >= 2 ? '🟠' : '🔴')
    : (scoreNum >= 9 ? '🟢' : scoreNum >= 7 ? '🟡' : scoreNum >= 4 ? '🟠' : '🔴');

  return [
    `${String(index + 1).padStart(2)}. ${emoji} [${categoryLabel}] ${title} @ ${company}`,
    `    Reason: ${reason}`,
    `    Matched: ${matched}`,
    `    Missing: ${missing}`,
    `    YOE:     ${yoe}`,
    `    Apply:   ${apply}`,
    `    Loc:     ${job.location ?? 'N/A'}`,
    '',
  ].join('\n');
}

function printUsageSummary(usage: TokenUsage, preFilterTotal: number, yoeRejectedCount: number): void {
  const cost = calculateCostUsd(usage);
  console.log('═══════════════════════════════════════');
  console.log('TOKEN USAGE & COST');
  console.log('───────────────────────────────────────');
  console.log(`  Cache Hit Tokens:   ${usage.promptCacheHitTokens.toLocaleString()}`);
  console.log(`  Cache Miss Tokens:  ${usage.promptCacheMissTokens.toLocaleString()}`);
  console.log(`  Total Input:        ${(usage.promptCacheHitTokens + usage.promptCacheMissTokens).toLocaleString()}`);
  console.log(`  Output Tokens:      ${usage.completionTokens.toLocaleString()}`);
  console.log(`  Cache Hit Rate:     ${usage.promptCacheHitTokens > 0 ? ((usage.promptCacheHitTokens / (usage.promptCacheHitTokens + usage.promptCacheMissTokens)) * 100).toFixed(1) : '0'}%`);
  console.log(`  Cost:               $${cost.toFixed(6)}`);
  console.log('───────────────────────────────────────');
  console.log(`  Jobs sent to LLM:    ${preFilterTotal - yoeRejectedCount} / ${preFilterTotal}`);
  console.log(`  Filter cost saved:  ~$${(cost / Math.max(1, preFilterTotal - yoeRejectedCount) * yoeRejectedCount).toFixed(6)} (${yoeRejectedCount} YOE-rejected jobs)`);
  console.log('═══════════════════════════════════════');
}

// ── Main ────────────────────────────────────────────────────────────────────

function parseModelFlag(): string {
  const idx = process.argv.indexOf('--model');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.MODEL_ID ?? 'deepseek/deepseek-v4-flash:floor';
}

function parseBatchSizeFlag(): number {
  const idx = process.argv.indexOf('--batch-size');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
    console.error(`Invalid --batch-size: ${process.argv[idx + 1]}`);
    process.exit(1);
  }
  return BATCH_SIZE;
}

function parseCategoricalFlag(): boolean {
  return process.argv.includes('--categorical');
}

function prepareJobPayload(job: Job) {
  return {
    title: job.title,
    location: job.location,
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
    jobFunction: job.jobFunction,
    industries: job.industries,
    salary: job.salary,
    descriptionText: (job.descriptionText ?? ''),
    benefits: job.benefits,
  };
}

async function runCategoricalBatch(
  jobs: Job[],
  context: UserPromptContext,
  batchSize: number,
  modelId: string,
): Promise<{ matched: EnrichedJob[]; rejected: EnrichedJob[]; usage: TokenUsage }> {
  const systemPrompt = buildCategoricalSystemPrompt(context);
  const matched: EnrichedJob[] = [];
  const rejected: EnrichedJob[] = [];
  const usage: TokenUsage = {
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0,
    completionTokens: 0,
    actualCostUsd: 0,
  };

  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    batches.push(jobs.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchNum = batchIdx + 1;
    console.log(`Categorical batch ${batchNum}/${batches.length} (${batch.length} jobs)`);

    const payload = batch.map((job, id) => ({ id, ...prepareJobPayload(job) }));
    const userMessage = `Job Listings (JSON array, ${batch.length} jobs):\n-------------------\n${JSON.stringify(payload, null, 2)}\n\nEvaluate each job per the system rules and return valid JSON.`;

    const res = await executellmCall(
      CATEGORICAL_BATCH_SCHEMA,
      userMessage,
      systemPrompt,
      undefined,
      {
        functionId: 'categorical-relevance-batch',
        metadata: { batch_number: String(batchNum), batch_size: String(batch.length) },
      },
      modelId,
    );

    usage.promptCacheHitTokens += res.usage.promptCacheHitTokens;
    usage.promptCacheMissTokens += res.usage.promptCacheMissTokens;
    usage.completionTokens += res.usage.completionTokens;
    usage.actualCostUsd = (usage.actualCostUsd ?? 0) + (res.usage.actualCostUsd ?? 0);

    const resultMap = new Map(res.object.results.map((r) => [r.id, r]));

    for (let j = 0; j < batch.length; j++) {
      const job = batch[j];
      const parsed = resultMap.get(j);
      const category = parsed?.category ?? 'no_match';
      const mapping = CATEGORY_MAP[category];
      const enriched: EnrichedJob = {
        ...job,
        status: mapping.pass ? 'matched' : 'rejected',
        ai_score: mapping.score,
        ai_reason: parsed?.reason ?? 'No reason provided',
        ai_matched_skills: parsed?.matched_skills ?? [],
        ai_missing_skills: parsed?.missing_skills ?? [],
        ai_job_location: parsed?.job_location ?? null,
        ai_yoe: parsed?.years_of_experience ?? 'Not specified',
        ai_direct_apply: parsed?.direct_apply ?? null,
      };
      (enriched as any).ai_category = category;
      mapping.pass ? matched.push(enriched) : rejected.push(enriched);
    }
  }

  return { matched, rejected, usage };
}

async function main() {
  const prefilterOnly = process.argv.includes('--prefilter-only');
  const modelId = parseModelFlag();
  const batchSize = parseBatchSizeFlag();
  const categorical = parseCategoricalFlag();

  console.log('═══════════════════════════════════════');
  console.log('OPENROUTER BATCH TEST — 20 Real LinkedIn Jobs (Apify Data)');
  console.log(`Model: ${modelId}`);
  if (categorical) console.log('(categorical mode — score labels instead of 0-10)');
  if (prefilterOnly) console.log('(prefilter-only mode — no LLM calls)');
  console.log('═══════════════════════════════════════');
  console.log('');

  const resume = readResume();
  console.log(`Resume: ${resume.length} chars  |  Candidate: ${CANDIDATE_YOE} yr exp`);
  console.log('');

  const testJobs = createTestJobs();

  const { passToLLM, yoeRejected } = yoePreFilter(testJobs, CANDIDATE_YOE);
  printPreFilterSummary(testJobs, passToLLM as AugmentedJob[], yoeRejected as AugmentedJob[]);

  if (prefilterOnly) {
    console.log('Prefilter-only mode done. No LLM calls made.');
    console.log('');
    return;
  }

  if (!process.env.LLM_API_KEY) {
    console.error('Missing LLM_API_KEY. Set it via:');
    console.error('  export LLM_API_KEY="sk-xxx"');
    console.error('Or run prefilter-only:');
    console.error('  npx tsx scripts/test_deepseek_batch.ts --prefilter-only');
    process.exit(1);
  }

  const context = buildCandidateContext(resume);

  console.log(`Sending ${passToLLM.length} jobs to OpenRouter (${modelId}) in batches of ${batchSize}...`);
  console.log('');

  const startTime = Date.now();
  const { matched, rejected, usage } = categorical
    ? await runCategoricalBatch(passToLLM, context, batchSize, modelId)
    : await checkRelevanceBatch(passToLLM, context, batchSize, 0, 1, modelId);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`OpenRouter done in ${elapsed}s.  Matched: ${matched.length}  |  LLM-Rejected: ${rejected.length}`);
  console.log('');

  const allLLMResults = [...matched, ...rejected];
  const jobOrder = new Map(passToLLM.map((j, i) => [j.title, i]));
  allLLMResults.sort((a, b) => (jobOrder.get(a.title!) ?? 99) - (jobOrder.get(b.title!) ?? 99));

  console.log('LLM RESULTS:');
  console.log('─────────────────────────────────────');
  for (let i = 0; i < allLLMResults.length; i++) {
    console.log(formatJobResult(allLLMResults[i], i));
  }

  console.log(`YOE-Rejected (no LLM cost): ${yoeRejected.length} jobs`);
  for (const job of yoeRejected) console.log(`  ✗ ${job.title}`);
  console.log('');

  printUsageSummary(usage, testJobs.length, yoeRejected.length);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
