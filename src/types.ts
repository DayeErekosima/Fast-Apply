export interface CVData {
  name: string;
  targetJobTitle: string;
  seniority: string;
  industry: string;
  currentCV: string;
  jobDescription: string;
}

export interface EmailSettings {
  email: string;
  autoSend: boolean;
  includeInterviewPrep: boolean;
  includeSkillsGap: boolean;
  serviceId: string;
  templateId: string;
  publicKey: string;
}

export interface InterviewQuestion {
  category: string;
  question: string;
  tip: string;
  starReminder?: string;
  redFlags: string;
}

export interface InterviewPrepData {
  competency: InterviewQuestion[];
  technical: InterviewQuestion[];
  motivational: InterviewQuestion[];
  tricky: InterviewQuestion[];
  questionsToAsk: InterviewQuestion[];
}

export interface SkillsGapData {
  strongMatches: { name: string; reason: string }[];
  partialMatches: { name: string; current: string; missing: string }[];
  criticalGaps: { name: string; urgency: 'BLOCKER' | 'CONCERN'; action: string; resources: string }[];
  developmentPlan: string;
  overallVerdict: string;
  radarData: {
    technical: number;
    experience: number;
    qualifications: number;
    softSkills: number;
    industryKnowledge: number;
  };
  requirementsCount: number;
}

export interface StarAnswer {
  questionId: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  polished?: string;
  wordCount?: number;
  speakingTime?: string;
}

export interface CVVersion {
  id: string;
  name: string;
  targetRole: string;
  timestamp: number;
  matchScore: number;
  content: CVSections;
  starAnswers?: StarAnswer[];
  skillsGapProgress?: string[]; // IDs of resolved gaps
}

export interface CVSections {
  personalStatement: string;
  keySkills: string;
  experience: string;
  education: string;
  additional: string;
}

export const UK_SPELLING_MAP: Record<string, string> = {
  "color": "colour",
  "organization": "organisation",
  "organize": "organise",
  "recognize": "recognise",
  "analyze": "analyse",
  "behavior": "behaviour",
  "center": "centre",
  "program": "programme",
  "license": "licence",
  "practice": "practise",
  "resume": "CV",
  "Fall semester": "Autumn term",
  "Spring semester": "Spring term",
  "GPA": "degree classification",
  "zip code": "postcode",
  "cell phone": "mobile",
  "vacation": "holiday",
};
