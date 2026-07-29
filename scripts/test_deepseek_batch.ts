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
import { checkRelevanceBatch, calculateCostUsd } from '../src/helper/llm';
import { yoePreFilter, extractMinYoe } from '../src/helper/filter';
import type { UserPromptContext } from '../src/helper/llm';
import type { Job, TokenUsage } from '../src/helper/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = path.resolve(__dirname, '../resume.txt');
const CANDIDATE_YOE = 1;
const BATCH_SIZE = 10;

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
    candidateSummary: 'Backend Engineer with experience building serverless AWS applications, AI agents, and production SaaS products.',
    knownSkills: [
      'Node.js', 'TypeScript', 'JavaScript', 'AWS Lambda', 'API Gateway', 'DynamoDB', 'S3', 'EC2',
      'Vercel AI SDK', 'PostgreSQL', 'Redis', 'Docker', 'LLM Integration', 'AI Agent Design',
      'RAG', 'Prompt Engineering', 'Git', 'CI/CD', 'Jest',
    ],
    keyHighlights: [
      'Built AI-powered hiring platform (Assessly) using AWS serverless + LLM code analysis',
      'Built WhatsApp AI accounting agent (Heymonsoon) with Gemini + tool-calling system',
    ],
    projects: [
      { project_title: 'Heymonsoon', project_description: 'AI-powered WhatsApp accounting agent for Indian SMEs.' },
      { project_title: 'Assessly', project_description: 'AI-powered hiring platform. AWS Lambda, DynamoDB, Bedrock, Vercel AI SDK.' },
    ],
    targetLocations: 'Hyderabad, Bangalore, Remote, India',
    employmentType: 'Full-time',
  };
}

// ── 20 jobs sourced verbatim from test_apify_results.json ──────────────────

function createTestJobs(): AugmentedJob[] {
  return [
    // ═══════════════ PASS GROUP (expected min ≤ 1 or null) ═══════════════

    // PASS: "Experience: 0–2 years" + "Freshers eligible"
    { title: 'Associate - Software Engineer', companyName: 'Firstsource',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Associate Software Engineer\n\nCompany: Firstsource Solutions Limited (FSL) Function: Technology / Engineering Level: Associate Experience: 0–2 years Employment type: Full-time Location: [Chennai / Bengaluru / Mumbai / Hybrid ]\n\nAbout The Role\n\nWe are looking for an Associate Software Engineer to join our engineering team at Firstsource. In this role you will build, test, and maintain application components and data services, working closely with senior engineers, business analysts, and product owners. This is a hands-on development role ideal for someone early in their career who is strong in Python, comfortable working with relational databases, and eager to grow their cloud skills on Microsoft Azure.\n\nKey Responsibilities\n\n\n\n- Develop, test, and maintain application features a',
      postedAt: '2026-07-25', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "Experience: 0–2 years" + "Freshers eligible"' },

    // PASS: "Freshers (0 years)" + "0–3 years eligible"
    { title: 'Graduate Engineer', companyName: 'PANI',
      location: 'Bengaluru, Karnataka, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Deloitte Off Campus Recruitment 2026 is inviting applications for the Graduate Engineer role at its Bengaluru, India location. Candidates with a Graduate or Postgraduate degree from the 2023, 2024, 2025, and 2026 batches with 0–3 years of experience are eligible to apply. Check eligibility, skills required,, and selection process How To Apply below. Responsibilities: As a Graduate Engineer, you will be deployed into specific technology tracks based on your skills and business requirements. The core hiring tracks for 2026 graduates include: Data Analytics: Address the continuum of business intelligence and visualization, managing data and optimizing performance management systems. AI/ML: Work with cognitive and machine learning models, translating theoretical AI architectures into enterpris',
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
      descriptionText: "Adani Group has announced its Off Campus Recruitment 2026 for the position of Software Developer. Candidates with a Bachelor's degree in Computer Science, Software Engineering, or a related field are eligible to apply. Both freshers and candidates with up to 3 years of experience can apply for this opportunity. Interested candidates can check the complete eligibility criteria, responsibilities, selection process, and application procedure below. Responsibilities: Write clean, efficient, and maintainable code to build and enhance software applications. Convert technical specifications into reliable, high-quality software solutions. Debug, troubleshoot, and resolve technical issues to maintain system stability. Participate in requirement gathering, software design, development, testing, and deployment. 0-3 years of experience required.",
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
      descriptionText: "Web Developer (Fully Remote) — FinLaxmi\nINR 6 LPA · 100% Remote · Flexible Hours · 0–2 years experience · Full-timeAbout FinLaxmi\nWe're building a retirement planner that helps everyday Indians answer one scary question: \"Will I have enough money when I stop working?\" — in under 60 seconds, on their phone, without jargon.Why this role is different\nYou won't be a heads-down coder buried in a repo. Talking to real users will be ~40% of your job. If you light up when someone struggles with a feature you built (because now you get to fix it), keep reading. We believe the best web developers write code and watch it get used.What you'll actually do\n\n- Talk to users every week. Sit in on 1:1 usability tests, do WhatsApp follow-ups, hop on calls with 35-year-olds who've never heard the words ",
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: 0,
      _yoeNote: 'APIFY-REAL: "0–2 years experience" — short metadata format' },

    // PASS: no YOE — Backend Engineer Scoutit Entry level
    { title: 'Backend Software Engineer', companyName: 'Scoutit',
      location: 'Chennai, Tamil Nadu, India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: "We're looking for Backend Software Engineers! \n\nResponsibilities\n\n\n\n- Architect and develop platform for the identity and regulatory\n- Provide technical structure to teams and work closely with management and stakeholders to define strategic roadmaps\n- Manage individual projects priorities, deadlines and deliverables with your technical expertise\n- Mentor and train other team members on design techniques and coding standards\n- Write high quality, well tested code to meet the needs of your customers\n- Hands-on with coding\n- Plan and implement the multi-year strategy for Identity and Regulatory engineering with the technical leadership on your team\n- Collaborate with engineers, designers, product managers and senior leadership to turn our vision into a tangible roadmap every qua",
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: null,
      _yoeNote: 'APIFY-REAL: no YOE — Backend Engineer Scoutit Entry level' },

    // PASS: no YOE — Software Engineer The Agentic Loop Entry level
    { title: 'Software Engineer', companyName: 'The Agentic Loop',
      location: 'India', seniorityLevel: 'Entry level',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: '\nCompany Description \nThe Agentic Loop is an AI-focused publication and learning space designed for curious learners, builders, and leaders who want to engage deeply with agentic AI. It translates rapid developments at the frontier of AI into clear, practical language, avoiding hype and fearmongering. Through a weekly newsletter, daily posts, and hands-on programs like the Production GenAI Engineering Program, The Agentic Loop helps people move from simply following AI trends to building real systems. The platform highlights the agents in production, the models behind them, and the people driving the agent age, making it a hub for understanding how AI is reshaping technology and work.\n\n\nRole Description \nAs a Software Engineer at The Agentic Loop, you will design, build, and maintain',
      postedAt: '2026-07-26', _expectedAction: 'pass', _expectedMin: null,
      _yoeNote: 'APIFY-REAL: no YOE — Software Engineer The Agentic Loop Entry level' },

    // PASS: FedEx levels table (Assoc=0, Std1=2, Std2=3) — no single requirement
    { title: 'Full Stack Developer I', companyName: 'FedEx ACC',
      location: 'Hyderabad, Telangana, India', seniorityLevel: 'Not Applicable',
      employmentType: 'Full-time', jobFunction: 'Engineering and Information Technology', salary: '',
      descriptionText: 'Responsible for collaborating with advisors to define solution designs, developing scalable and high-performing code, ensuring code quality and security, leading code reviews, managing priorities, facilitating cross-team communication, acting as a demo content owner, mentoring junior developers, and supporting leadership and vendor teams.\n\n\n\n-  Collaborate with Full Stack Developer Advisors to breakdown epics into capability and business features, define the solution designs, iterate with domain and other solution architects, and help guide application architects for Program Level decomposition and robust architectures.\n-  Write and implement scalable, resilient, and high-performing code and microservices solutions.\n-  Ensure quality, performance, and security of code and developed s',
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
  const reason = (job as any).ai_reason ?? 'N/A';
  const matched = ((job as any).ai_matched_skills ?? []).join(', ') || '—';
  const missing = ((job as any).ai_missing_skills ?? []).join(', ') || '—';
  const yoe = (job as any).ai_yoe ?? 'N/A';
  const apply = (job as any).ai_direct_apply ?? 'N/A';

  const scoreNum = typeof score === 'number' ? score : 0;
  const emoji = scoreNum >= 9 ? '🟢' : scoreNum >= 7 ? '🟡' : scoreNum >= 4 ? '🟠' : '🔴';

  return [
    `${String(index + 1).padStart(2)}. ${emoji} [${String(score).padStart(3)}/10] ${title} @ ${company}`,
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

async function main() {
  const prefilterOnly = process.argv.includes('--prefilter-only');

  console.log('═══════════════════════════════════════');
  console.log('OPENROUTER BATCH TEST — 20 Real LinkedIn Jobs (Apify Data)');
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

  console.log(`Sending ${passToLLM.length} jobs to OpenRouter/DeepInfra...`);
  console.log('');

  const startTime = Date.now();
  const { matched, rejected, usage } = await checkRelevanceBatch(
    passToLLM, context, BATCH_SIZE, 0, 1,
  );
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
