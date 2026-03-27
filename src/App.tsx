import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, 
  Briefcase, 
  Settings, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Clipboard, 
  Trash2, 
  RotateCcw, 
  HelpCircle, 
  Sun, 
  Moon, 
  Eye, 
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Info,
  History,
  Check,
  AlertCircle,
  Target,
  BarChart3,
  Mail,
  ExternalLink,
  Copy,
  Save,
  RefreshCw,
  FileDown,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Lightbulb,
  Plus,
  X,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { CVData, CVSections, CVVersion, UK_SPELLING_MAP, EmailSettings, InterviewPrepData, SkillsGapData, StarAnswer, InterviewQuestion } from './types';

// --- Type Declarations for CDNs ---
declare global {
  interface Window {
    emailjs: any;
    jspdf: any;
    html2canvas: any;
    Chart: any;
  }
}

// --- Constants ---
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-3-5-sonnet-20240620"; // Updated to latest available Claude 3.5 Sonnet

// --- Helper Functions ---
const extractKeywords = (text: string): string[] => {
  if (!text) return [];
  const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'will', 'have', 'been', 'are', 'was', 'were', 'has', 'had', 'can', 'could', 'should', 'would', 'must', 'may', 'might', 'shall', 'should', 'will', 'would', 'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']);
  const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
  return Array.from(new Set(words.filter(w => !stopWords.has(w))));
};

const calculateMatchScore = (cvText: string, jdText: string) => {
  const jdKeywords = extractKeywords(jdText);
  if (jdKeywords.length === 0) return { score: 0, found: [], missing: [] };
  
  const cvTextLower = cvText.toLowerCase();
  const found = jdKeywords.filter(k => cvTextLower.includes(k));
  const missing = jdKeywords.filter(k => !cvTextLower.includes(k));
  
  const score = Math.round((found.length / jdKeywords.length) * 100);
  return { score, found, missing };
};

const checkUKStandards = (text: string) => {
  const checks = [
    { id: 'no_photo', label: 'No photo mentioned', pass: !text.toLowerCase().includes('photo') && !text.toLowerCase().includes('photograph') },
    { id: 'no_dob', label: 'No date of birth', pass: !text.toLowerCase().includes('date of birth') && !text.toLowerCase().includes('dob:') },
    { id: 'no_marital', label: 'No marital status', pass: !text.toLowerCase().includes('marital status') && !text.toLowerCase().includes('married') && !text.toLowerCase().includes('single') },
    { id: 'no_nationality', label: 'No nationality', pass: !text.toLowerCase().includes('nationality') },
    { id: 'uk_spelling', label: 'UK Spelling', pass: !Object.keys(UK_SPELLING_MAP).some(us => text.toLowerCase().includes(us) && us !== 'resume') },
    { id: 'uk_date', label: 'UK Date Format', pass: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text) || /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{4}\b/i.test(text) },
    { id: 'references', label: 'References "Available on request"', pass: text.toLowerCase().includes('available on request') },
    { id: 'no_objective', label: 'No "Objective" section', pass: !text.toLowerCase().includes('objective') || text.toLowerCase().includes('personal profile') || text.toLowerCase().includes('personal statement') },
    { id: 'uk_phone', label: 'UK Phone Format', pass: /(\+44|07)\d{9,10}/.test(text.replace(/\s/g, '')) },
  ];
  return checks;
};

// --- Main Component ---
export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('match');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<CVVersion[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmailBanner, setShowEmailBanner] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    email: '',
    autoSend: false,
    includeInterviewPrep: true,
    includeSkillsGap: true,
    serviceId: '',
    templateId: '',
    publicKey: ''
  });

  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepData | null>(null);
  const [isGeneratingInterview, setIsGeneratingInterview] = useState(false);
  
  const [skillsGap, setSkillsGap] = useState<SkillsGapData | null>(null);
  const [isGeneratingSkillsGap, setIsGeneratingSkillsGap] = useState(false);
  const [resolvedGaps, setResolvedGaps] = useState<string[]>([]);

  const [starAnswers, setStarAnswers] = useState<StarAnswer[]>([]);
  const [isPolishingStar, setIsPolishingStar] = useState(false);

  useEffect(() => {
    if (activeTab === 'skills' && skillsGap) {
      const timer = setTimeout(() => {
        const canvas = document.getElementById('skillsRadarChart') as HTMLCanvasElement;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const existingChart = window.Chart.getChart(canvas);
            if (existingChart) existingChart.destroy();

            new window.Chart(ctx, {
              type: 'radar',
              data: {
                labels: ['Technical', 'Experience', 'Qualifications', 'Soft Skills', 'Industry'],
                datasets: [
                  {
                    label: 'Your CV',
                    data: [
                      skillsGap.radarData.technical,
                      skillsGap.radarData.experience,
                      skillsGap.radarData.qualifications,
                      skillsGap.radarData.softSkills,
                      skillsGap.radarData.industryKnowledge
                    ],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    pointBackgroundColor: '#3b82f6',
                  },
                  {
                    label: 'Job Requirements',
                    data: [8, 8, 8, 8, 8],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderDash: [5, 5],
                    pointRadius: 0
                  }
                ]
              },
              options: {
                scales: {
                  r: {
                    min: 0,
                    max: 10,
                    beginAtZero: true,
                    ticks: { display: false },
                    grid: { color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                  }
                },
                plugins: {
                  legend: { display: false }
                }
              }
            });
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, skillsGap, darkMode]);

  const [cvData, setCvData] = useState<CVData>({
    name: '',
    targetJobTitle: '',
    seniority: 'Mid-level',
    industry: 'Technology',
    currentCV: '',
    jobDescription: ''
  });

  const [tailoredCV, setTailoredCV] = useState<CVSections | null>(null);
  const [improvementTips, setImprovementTips] = useState<string[]>([]);

  // --- Refs ---
  const cvEditorRef = useRef<HTMLDivElement>(null);

  // --- Effects ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // --- Handlers ---
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCvData(prev => ({ ...prev, [name]: value }));
  };

  const callClaude = async (prompt: string, systemPrompt: string) => {
    if (!apiKey) {
      throw new Error("Please enter your Anthropic API key in Settings to use AI features.");
    }

    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Failed to call Claude API");
    }

    const data = await response.json();
    return data.content[0].text;
  };

  const parseCVSections = (text: string): CVSections => {
    const sections: CVSections = {
      personalStatement: '',
      keySkills: '',
      experience: '',
      education: '',
      additional: ''
    };

    const markers = {
      personalStatement: '[PERSONAL_STATEMENT]',
      keySkills: '[KEY_SKILLS]',
      experience: '[EXPERIENCE]',
      education: '[EDUCATION]',
      additional: '[ADDITIONAL]'
    };

    let currentSection: keyof CVSections | null = null;
    const lines = text.split('\n');

    for (const line of lines) {
      let foundMarker = false;
      for (const [key, marker] of Object.entries(markers)) {
        if (line.includes(marker)) {
          currentSection = key as keyof CVSections;
          foundMarker = true;
          break;
        }
      }

      if (!foundMarker && currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    return sections;
  };

  const handleTailorCV = async () => {
    if (!cvData.currentCV.trim()) {
      setError("Please paste your CV to continue");
      return;
    }
    if (!apiKey) {
      setError("Please enter your Anthropic API key in Settings");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setError(null);

    const systemPrompt = `You are an expert UK CV writer and careers advisor with 15 years of experience helping candidates land roles at top UK companies. You have deep knowledge of UK CV conventions, ATS systems, and what UK hiring managers expect.

Your task is to rewrite and tailor the provided CV for the specific job description given. Follow ALL of these UK CV rules strictly:

1. NEVER use American English — use British spellings throughout (organised, recognised, colour, behaviour, etc.)
2. NEVER include personal details like date of birth, nationality, marital status, or a photo
3. Use "Personal Profile" or "Personal Statement" NOT "Objective"
4. Bullet points should NOT start with "I" — use action verbs instead (Delivered, Managed, Achieved, Led, Developed)
5. Quantify achievements wherever possible (%, £, team sizes, timeframes)
6. Use UK date format: Month YYYY (e.g. June 2022 – Present)
7. References section must say "Available on request" — do not list actual referees
8. Keep the CV to 2 pages maximum unless academic or very senior (then 3 max)
9. Personal statement: 3–5 sentences, tailored to THIS specific job, under 100 words
10. Mirror the exact language and keywords from the job description naturally
11. Prioritise the most relevant experience for this specific role
12. Use strong UK-appropriate action verbs: Spearheaded, Delivered, Championed, Facilitated, Liaised, Coordinated
13. Format experience as: Job Title | Company | Location | Dates (Month YYYY – Month YYYY)
14. Skills section should list hard skills relevant to the job description first
15. Academic qualifications: list in reverse chronological order, use UK grading (First-class Honours, 2:1, A-levels, GCSEs)

Return the CV in clearly labelled sections using these exact markers so the app can parse them:
[PERSONAL_STATEMENT]
[KEY_SKILLS]
[EXPERIENCE]
[EDUCATION]
[ADDITIONAL]

Also provide a separate section at the end marked [IMPROVEMENT_TIPS] with 5-10 specific UK-focused tips.`;

    const prompt = `
Name: ${cvData.name}
Target Job Title: ${cvData.targetJobTitle}
Seniority: ${cvData.seniority}
Industry: ${cvData.industry}

CURRENT CV:
${cvData.currentCV}

JOB DESCRIPTION:
${cvData.jobDescription}
    `;

    try {
      const result = await callClaude(prompt, systemPrompt);
      const sections = parseCVSections(result);
      setTailoredCV(sections);
      
      const tipsMatch = result.match(/\[IMPROVEMENT_TIPS\]([\s\S]*)/);
      if (tipsMatch) {
        setImprovementTips(tipsMatch[1].trim().split('\n').filter(t => t.trim().length > 0));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateSection = async (sectionKey: keyof CVSections) => {
    if (!tailoredCV) return;
    
    setLoading(true);
    const systemPrompt = `You are an expert UK CV writer. Rewrite only the [${sectionKey.toUpperCase()}] section of the CV to better emphasise ${cvData.targetJobTitle} experience, making it more impactful and keyword-rich for this UK role. Follow all UK conventions.`;
    const prompt = `
Target Job: ${cvData.targetJobTitle}
Job Description: ${cvData.jobDescription}
Current Section Content:
${tailoredCV[sectionKey]}
    `;

    try {
      const result = await callClaude(prompt, systemPrompt);
      setTailoredCV(prev => prev ? { ...prev, [sectionKey]: result } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKeywordToCV = async (keyword: string) => {
    if (!tailoredCV) return;
    
    setLoading(true);
    const systemPrompt = `You are an expert UK CV writer. Suggest a natural, impactful bullet point incorporating the keyword "${keyword}" for a ${cvData.targetJobTitle} CV. Return ONLY the bullet point text.`;
    const prompt = `
Target Job: ${cvData.targetJobTitle}
Job Description: ${cvData.jobDescription}
Current Experience:
${tailoredCV.experience}
    `;

    try {
      const result = await callClaude(prompt, systemPrompt);
      setTailoredCV(prev => prev ? { ...prev, experience: prev.experience + '\n• ' + result } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVersion = () => {
    if (!tailoredCV) return;
    const { score } = calculateMatchScore(Object.values(tailoredCV).join(' '), cvData.jobDescription);
    const newVersion: CVVersion = {
      id: Date.now().toString(),
      name: `Version ${versions.length + 1}`,
      targetRole: cvData.targetJobTitle || 'Untitled Role',
      timestamp: Date.now(),
      matchScore: score,
      content: { ...tailoredCV }
    };
    setVersions(prev => [newVersion, ...prev].slice(0, 5));
  };

  const handleDownloadTxt = () => {
    if (!tailoredCV) return;
    const content = `
${cvData.name}
${cvData.targetJobTitle}

PERSONAL STATEMENT
${tailoredCV.personalStatement}

KEY SKILLS
${tailoredCV.keySkills}

EXPERIENCE
${tailoredCV.experience}

EDUCATION
${tailoredCV.education}

ADDITIONAL
${tailoredCV.additional}
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    saveAs(blob, `${cvData.name.replace(/\s+/g, '_')}_CV.txt`);
    
    if (emailSettings.autoSend) {
      handleSendEmail();
    } else {
      setShowEmailBanner(true);
    }
  };

  const handleDownloadDocx = async () => {
    if (!tailoredCV) return;
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ 
            text: cvData.name, 
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ 
            text: cvData.targetJobTitle, 
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "PERSONAL STATEMENT", heading: HeadingLevel.HEADING_2 }),
          ...tailoredCV.personalStatement.split('\n').map(line => new Paragraph({ text: line })),
          new Paragraph({ text: "KEY SKILLS", heading: HeadingLevel.HEADING_2 }),
          ...tailoredCV.keySkills.split('\n').map(line => new Paragraph({ text: line })),
          new Paragraph({ text: "EXPERIENCE", heading: HeadingLevel.HEADING_2 }),
          ...tailoredCV.experience.split('\n').map(line => new Paragraph({ text: line })),
          new Paragraph({ text: "EDUCATION", heading: HeadingLevel.HEADING_2 }),
          ...tailoredCV.education.split('\n').map(line => new Paragraph({ text: line })),
          new Paragraph({ text: "ADDITIONAL", heading: HeadingLevel.HEADING_2 }),
          ...tailoredCV.additional.split('\n').map(line => new Paragraph({ text: line })),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${cvData.name.replace(/\s+/g, '_')}_CV.docx`);

    if (emailSettings.autoSend) {
      handleSendEmail();
    } else {
      setShowEmailBanner(true);
    }
  };

  const handleDownloadPdf = async () => {
    if (!tailoredCV) return;
    setIsGeneratingPdf(true);
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 15;
      const pageWidth = 210;
      let y = margin;

      const addText = (text: string, fontSize: number, isBold = false, spacing = 5) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(text, pageWidth - (margin * 2));
        
        lines.forEach((line: string) => {
          if (y + 10 > 297 - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += (fontSize * 0.4) + 1;
        });
        y += spacing;
      };

      addText(cvData.name, 18, true, 2);
      addText(cvData.targetJobTitle, 12, true, 8);
      
      const sections = [
        { title: 'PERSONAL STATEMENT', content: tailoredCV.personalStatement },
        { title: 'KEY SKILLS', content: tailoredCV.keySkills },
        { title: 'EXPERIENCE', content: tailoredCV.experience },
        { title: 'EDUCATION', content: tailoredCV.education },
        { title: 'ADDITIONAL', content: tailoredCV.additional },
      ];

      sections.forEach(section => {
        if (y + 20 > 297 - margin) {
          doc.addPage();
          y = margin;
        }
        addText(section.title, 12, true, 2);
        doc.setLineWidth(0.5);
        doc.line(margin, y - 1, pageWidth - margin, y - 1);
        y += 2;
        addText(section.content, 10, false, 8);
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
      }

      const fileName = `${cvData.name.replace(/\s+/g, '_')}_CV_${cvData.targetJobTitle.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`;
      doc.save(fileName);

      if (emailSettings.autoSend) {
        handleSendEmail();
      } else {
        setShowEmailBanner(true);
      }
    } catch (err: any) {
      setError(`PDF generation failed: ${err.message}. Falling back to TXT.`);
      handleDownloadTxt();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = async (manual = false) => {
    if (!emailSettings.email || !emailSettings.serviceId || !emailSettings.templateId || !emailSettings.publicKey) {
      if (manual) setError("Please configure EmailJS in Settings to enable this feature.");
      return;
    }

    setIsSendingEmail(true);
    try {
      const { score } = calculateMatchScore(tailoredCV ? Object.values(tailoredCV).join(' ') : '', cvData.jobDescription);
      const ukChecks = checkUKStandards(tailoredCV ? Object.values(tailoredCV).join(' ') : '');
      const ukScore = ukChecks.filter(c => c.pass).length;

      const templateParams = {
        candidate_name: cvData.name,
        target_role: cvData.targetJobTitle,
        cv_content: tailoredCV ? Object.entries(tailoredCV).map(([k, v]) => `${k.toUpperCase()}:\n${v}`).join('\n\n') : 'No CV content',
        job_description: cvData.jobDescription,
        match_score: score,
        interview_questions: emailSettings.includeInterviewPrep && interviewPrep ? JSON.stringify(interviewPrep, null, 2) : 'Not included',
        skills_gap: emailSettings.includeSkillsGap && skillsGap ? JSON.stringify(skillsGap, null, 2) : 'Not included',
        date_generated: new Date().toLocaleString('en-GB'),
        uk_standards_score: `${ukScore}/${ukChecks.length}`
      };

      await window.emailjs.send(
        emailSettings.serviceId,
        emailSettings.templateId,
        templateParams,
        emailSettings.publicKey
      );

      setShowEmailBanner(false);
      // Success toast would go here
    } catch (err: any) {
      setError(`Email failed: ${err.text || err.message || 'Unknown error'}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleGenerateInterview = async () => {
    if (!tailoredCV || !cvData.jobDescription) {
      setError("Please tailor your CV first before generating interview questions.");
      return;
    }
    setIsGeneratingInterview(true);
    const systemPrompt = `You are a senior UK recruiter and interview coach with expertise across multiple industries. Based on the CV and job description provided, generate a comprehensive set of interview questions this candidate is LIKELY to face. Structure them in exactly these categories:

[COMPETENCY_QUESTIONS] — 5 behavioural questions using the STAR method format, specific to the responsibilities in this job description. Frame each as a UK interviewer would ask it.

[TECHNICAL_QUESTIONS] — 5 role-specific technical questions based on the required skills in the job description and any skill gaps visible in the CV.

[MOTIVATIONAL_QUESTIONS] — 3 questions about why the candidate wants this role/company, tailored to the specific organisation if identifiable from the JD.

[TRICKY_QUESTIONS] — 3 challenging questions the candidate may struggle with based on weaknesses or gaps visible in their CV (e.g. short tenures, career changes, qualification gaps).

[QUESTIONS_TO_ASK] — 5 smart questions the candidate should ask the interviewer, tailored to this specific role and company, that will impress a UK hiring manager.

For each question, also provide:
- A brief tip on how to approach answering it (2 sentences max)
- The STAR framework reminder for competency questions
- Red flags to avoid in the answer

Format clearly with the category markers above so the app can parse and display each section separately.`;
    
    const prompt = `CV: ${Object.values(tailoredCV).join('\n')}\n\nJob Description: ${cvData.jobDescription}`;
    
    try {
      const result = await callClaude(prompt, systemPrompt);
      const parsed = parseInterviewPrep(result);
      setInterviewPrep(parsed);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGeneratingInterview(false);
    }
  };

  const parseInterviewPrep = (text: string): InterviewPrepData => {
    const sections: InterviewPrepData = {
      competency: [],
      technical: [],
      motivational: [],
      tricky: [],
      questionsToAsk: []
    };

    const markers: Record<string, keyof InterviewPrepData> = {
      '[COMPETENCY_QUESTIONS]': 'competency',
      '[TECHNICAL_QUESTIONS]': 'technical',
      '[MOTIVATIONAL_QUESTIONS]': 'motivational',
      '[TRICKY_QUESTIONS]': 'tricky',
      '[QUESTIONS_TO_ASK]': 'questionsToAsk'
    };

    let currentSection: keyof InterviewPrepData | null = null;
    const lines = text.split('\n');

    lines.forEach(line => {
      const marker = Object.keys(markers).find(m => line.includes(m));
      if (marker) {
        currentSection = markers[marker];
      } else if (currentSection && line.trim()) {
        if (/^\d+\./.test(line.trim()) || line.trim().startsWith('-')) {
          sections[currentSection].push({
            category: currentSection,
            question: line.trim().replace(/^\d+\.\s*/, '').replace(/^- \s*/, ''),
            tip: '',
            redFlags: ''
          });
        } else if (sections[currentSection].length > 0) {
          const lastQ = sections[currentSection][sections[currentSection].length - 1];
          if (line.toLowerCase().includes('tip:')) lastQ.tip = line.split(':')[1].trim();
          if (line.toLowerCase().includes('red flag')) lastQ.redFlags = line.split(':')[1].trim();
          if (line.toLowerCase().includes('star')) lastQ.starReminder = line.split(':')[1]?.trim() || 'Use Situation, Task, Action, Result';
        }
      }
    });

    return sections;
  };

  const handleGenerateSkillsGap = async () => {
    if (!tailoredCV || !cvData.jobDescription) {
      setError("Please provide both your CV and the job description.");
      return;
    }
    setIsGeneratingSkillsGap(true);
    const systemPrompt = `You are a UK careers development specialist and skills assessor. Carefully compare the candidate's CV against the job description and produce a detailed skills gap analysis. Structure your response using these exact markers:

[STRONG_MATCH] — Skills and experiences the candidate has that directly match the job requirements. List each with a brief explanation of why it's relevant.

[PARTIAL_MATCH] — Skills the candidate has some evidence of but not at the level or specificity the job requires. For each, explain what is present and what is missing.

[CRITICAL_GAPS] — Skills, qualifications, or experience explicitly required in the job description that are completely absent from the CV. For each gap, rate urgency: BLOCKER (will likely disqualify) or CONCERN (may raise questions).

[DEVELOPMENT_PLAN] — For each critical gap and partial match, provide a specific, actionable UK-relevant way to address it.

[OVERALL_VERDICT] — A 3-sentence honest assessment.

[RADAR_DATA] — Return JSON for the radar chart with values 0-10 for: technical, experience, qualifications, softSkills, industryKnowledge. Example: {"technical": 7, "experience": 5, "qualifications": 9, "softSkills": 8, "industryKnowledge": 6}`;

    const prompt = `CV: ${Object.values(tailoredCV).join('\n')}\n\nJob Description: ${cvData.jobDescription}`;

    try {
      const result = await callClaude(prompt, systemPrompt);
      const parsed = parseSkillsGap(result);
      setSkillsGap(parsed);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGeneratingSkillsGap(false);
    }
  };

  const parseSkillsGap = (text: string): SkillsGapData => {
    const data: SkillsGapData = {
      strongMatches: [],
      partialMatches: [],
      criticalGaps: [],
      developmentPlan: '',
      overallVerdict: '',
      radarData: { technical: 5, experience: 5, qualifications: 5, softSkills: 5, industryKnowledge: 5 },
      requirementsCount: 0
    };

    const sections = text.split(/\[(.*?)\]/);
    for (let i = 1; i < sections.length; i += 2) {
      const marker = sections[i];
      const content = sections[i + 1]?.trim();
      if (!content) continue;

      if (marker === 'STRONG_MATCH') {
        data.strongMatches = content.split('\n').filter(l => l.trim()).map(l => ({ name: l.split(':')[0] || l, reason: l.split(':')[1] || '' }));
      } else if (marker === 'PARTIAL_MATCH') {
        data.partialMatches = content.split('\n').filter(l => l.trim()).map(l => ({ name: l.split(':')[0] || l, current: l.split(':')[1] || '', missing: '' }));
      } else if (marker === 'CRITICAL_GAPS') {
        data.criticalGaps = content.split('\n').filter(l => l.trim()).map(l => ({ 
          name: l.split(':')[0] || l, 
          urgency: l.includes('BLOCKER') ? 'BLOCKER' : 'CONCERN',
          action: '',
          resources: ''
        }));
      } else if (marker === 'DEVELOPMENT_PLAN') {
        data.developmentPlan = content;
      } else if (marker === 'OVERALL_VERDICT') {
        data.overallVerdict = content;
      } else if (marker === 'RADAR_DATA') {
        try {
          data.radarData = JSON.parse(content);
        } catch (e) {}
      }
    }
    data.requirementsCount = data.strongMatches.length + data.partialMatches.length + data.criticalGaps.length;
    return data;
  };

  const handleDownloadInterviewPrep = () => {
    if (!interviewPrep) return;
    let content = "CV TAILOR UK - INTERVIEW PREPARATION PACK\n";
    content += "========================================\n\n";
    
    Object.entries(interviewPrep).forEach(([category, questions]) => {
      content += `${category.toUpperCase().replace(/_/g, ' ')}\n`;
      content += "----------------------------------------\n";
      (questions as InterviewQuestion[]).forEach((q, i) => {
        content += `${i + 1}. ${q.question}\n`;
        if (q.tip) content += `   Tip: ${q.tip}\n`;
        content += "\n";
      });
      content += "\n";
    });

    if (starAnswers.length > 0) {
      content += "MY STAR ANSWERS\n";
      content += "========================================\n\n";
      starAnswers.forEach((star, i) => {
        content += `${i + 1}. QUESTION: ${star.question}\n`;
        content += `   SITUATION: ${star.situation}\n`;
        content += `   TASK: ${star.task}\n`;
        content += `   ACTION: ${star.action}\n`;
        content += `   RESULT: ${star.result}\n\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL;
    const link = document.createElement('a');
    link.href = url.createObjectURL(blob);
    link.download = `Interview_Prep_${cvData.targetJobTitle.replace(/\s+/g, '_')}.txt`;
    link.click();
    
    if (emailSettings.autoSend) {
      handleSendEmail();
    }
  };

  const handleDownloadSkillsGap = () => {
    if (!skillsGap) return;
    let content = "CV TAILOR UK - SKILLS GAP ANALYSIS REPORT\n";
    content += "=========================================\n\n";
    content += `Overall Verdict: ${skillsGap.overallVerdict}\n\n`;
    
    content += "STRONG MATCHES\n";
    content += "--------------\n";
    skillsGap.strongMatches.forEach(m => content += `[✓] ${m.name}: ${m.reason}\n`);
    
    content += "\nPARTIAL MATCHES\n";
    content += "---------------\n";
    skillsGap.partialMatches.forEach(m => content += `[~] ${m.name}: Current: ${m.current}\n`);
    
    content += "\nCRITICAL GAPS\n";
    content += "-------------\n";
    skillsGap.criticalGaps.forEach(m => content += `[!] ${m.name} (${m.urgency})\n`);
    
    content += "\nDEVELOPMENT PLAN\n";
    content += "----------------\n";
    content += skillsGap.developmentPlan;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL;
    const link = document.createElement('a');
    link.href = url.createObjectURL(blob);
    link.download = `Skills_Gap_Report_${cvData.targetJobTitle.replace(/\s+/g, '_')}.txt`;
    link.click();

    if (emailSettings.autoSend) {
      handleSendEmail();
    }
  };

  const handlePolishStar = async (starId: string) => {
    const star = starAnswers.find(s => s.id === starId);
    if (!star) return;

    setIsPolishingStar(true);
    const systemPrompt = `You are an expert UK interview coach. Polish this STAR answer for a UK interview for a ${cvData.targetJobTitle} role. Make it concise (90 seconds when spoken), impactful, and professional. Flag any weak areas.`;
    const prompt = `Question: ${star.question}\nSituation: ${star.situation}\nTask: ${star.task}\nAction: ${star.action}\nResult: ${star.result}\n\nReturn the polished version in STAR format.`;

    try {
      const result = await callClaude(prompt, systemPrompt);
      // Parse the result back into STAR fields if possible, or just update the fields
      // For simplicity, let's assume the AI returns a structured response or we just update the fields with the whole thing
      // In a real app, we'd parse it. Here we'll just update the fields if we can find markers.
      const polished = { ...star };
      const sections = ['SITUATION', 'TASK', 'ACTION', 'RESULT'];
      let currentSection = '';
      result.split('\n').forEach(line => {
        const upperLine = line.toUpperCase();
        const found = sections.find(s => upperLine.startsWith(s + ':'));
        if (found) {
          currentSection = found.toLowerCase();
          polished[currentSection as keyof StarAnswer] = line.split(':')[1]?.trim() || '';
        } else if (currentSection) {
          polished[currentSection as keyof StarAnswer] += ' ' + line.trim();
        }
      });
      
      setStarAnswers(prev => prev.map(s => s.id === starId ? polished : s));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPolishingStar(false);
    }
  };

  const handleFullPackDownload = async () => {
    await handleDownloadPdf();
    // In a real app we might combine these into a zip, but here we trigger sequentially
    const interviewContent = interviewPrep ? JSON.stringify(interviewPrep, null, 2) : 'No interview prep generated';
    saveAs(new Blob([interviewContent], { type: 'text/plain' }), `${cvData.name}_Interview_Prep.txt`);
    
    const gapContent = skillsGap ? JSON.stringify(skillsGap, null, 2) : 'No skills gap analysis generated';
    saveAs(new Blob([gapContent], { type: 'text/plain' }), `${cvData.name}_Skills_Gap.txt`);
  };

  const handleCopyToClipboard = () => {
    if (!tailoredCV) return;
    const content = Object.values(tailoredCV).join('\n\n');
    navigator.clipboard.writeText(content);
    alert("CV copied to clipboard!");
  };

  const spellCheck = (text: string) => {
    let highlighted = text;
    Object.entries(UK_SPELLING_MAP).forEach(([us, uk]) => {
      const regex = new RegExp(`\\b${us}\\b`, 'gi');
      highlighted = highlighted.replace(regex, (match) => `<span class="bg-yellow-200 dark:bg-yellow-900/50 underline decoration-yellow-500 cursor-help" title="Not standard UK usage. Use '${uk}' instead.">${match}</span>`);
    });
    return highlighted;
  };

  const analysis = useMemo(() => {
    if (!tailoredCV) return { score: 0, found: [], missing: [], standards: [] };
    const fullText = Object.values(tailoredCV).join(' ');
    const match = calculateMatchScore(fullText, cvData.jobDescription);
    const standards = checkUKStandards(fullText);
    return { ...match, standards };
  }, [tailoredCV, cvData.jobDescription]);

  // --- Render Helpers ---
  const renderTabContent = () => {
    switch (activeTab) {
      case 'match':
        return (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeDasharray="100, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    strokeWidth="3"
                  />
                  <motion.path
                    initial={{ strokeDasharray: "0, 100" }}
                    animate={{ strokeDasharray: `${analysis.score}, 100` }}
                    className="stroke-blue-500"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">{analysis.score}%</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium">ATS Match Score</p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Keywords Found</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.found.map(k => (
                    <span key={k} className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                      <Check className="w-3 h-3 mr-1" /> {k}
                    </span>
                  ))}
                  {analysis.found.length === 0 && <p className="text-xs text-slate-400 italic">No keywords matched yet.</p>}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Missing Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.missing.slice(0, 15).map(k => (
                    <div key={k} className="group relative">
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                        <XCircle className="w-3 h-3 mr-1" /> {k}
                        <button 
                          onClick={() => handleAddKeywordToCV(k)}
                          className="ml-1.5 p-0.5 hover:bg-red-200 dark:hover:bg-red-800 rounded text-[10px] font-bold"
                          title="Add to CV"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  ))}
                  {analysis.missing.length === 0 && <p className="text-xs text-slate-400 italic">All key terms found!</p>}
                </div>
              </div>

              {skillsGap && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Skills Balance</h4>
                  <div className="grid grid-cols-5 gap-1">
                    {Object.entries(skillsGap.radarData).map(([key, val]) => (
                      <div key={key} className="flex flex-col items-center">
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-12 rounded-md relative overflow-hidden">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(val as number) * 10}%` }}
                            className="absolute bottom-0 w-full bg-blue-500/40"
                          />
                        </div>
                        <span className="text-[8px] mt-1 text-slate-400 uppercase">{key.substring(0, 4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      case 'standards':
        return (
          <div className="space-y-3">
            {analysis.standards.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                <span className="text-sm text-slate-700 dark:text-slate-300">{s.label}</span>
                {s.pass ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
              </div>
            ))}
          </div>
        );
      case 'tips':
        return (
          <div className="space-y-4">
            {improvementTips.length > 0 ? (
              improvementTips.map((tip, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                  <div className="mt-1"><Sparkles className="w-4 h-4 text-blue-500" /></div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{tip.replace(/^[-*]\s*/, '')}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-8">Generate a CV to see improvement tips.</p>
            )}
          </div>
        );
      case 'versions':
        return (
          <div className="space-y-3">
            {versions.length > 0 ? (
              versions.map(v => (
                <div key={v.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 group">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{v.name}</h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">{v.matchScore}%</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{v.targetRole}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">{new Date(v.timestamp).toLocaleString()}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setTailoredCV(v.content)} className="p-1 hover:text-blue-500"><RotateCcw className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setVersions(prev => prev.filter(x => x.id !== v.id))} className="p-1 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-8">No saved versions yet.</p>
            )}
          </div>
        );
      case 'interview':
        return (
          <div className="space-y-6">
            {!interviewPrep ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="w-8 h-8 text-blue-500" />
                </div>
                <p className="text-sm text-slate-500">Generate likely interview questions based on your tailored CV.</p>
                <button 
                  onClick={handleGenerateInterview}
                  disabled={isGeneratingInterview}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 mx-auto transition-all active:scale-95"
                >
                  {isGeneratingInterview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Questions
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Interview Prep Pack</h3>
                  <button onClick={handleDownloadInterviewPrep} className="text-[10px] font-bold text-blue-500 hover:underline">Download Pack</button>
                </div>
                
                {Object.entries(interviewPrep).map(([category, questions]) => (
                  <div key={category} className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                      {category.replace(/_/g, ' ')}
                    </h4>
                    {(questions as InterviewQuestion[]).map((q, i) => (
                      <div key={i} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm">
                        <p className="text-sm font-semibold mb-2">{q.question}</p>
                        {q.tip && (
                          <div className="flex gap-2 p-2 rounded bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30 mb-3">
                            <Lightbulb className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-slate-600 dark:text-slate-400 italic">{q.tip}</p>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <button 
                            onClick={() => {
                              const newStar = { id: Math.random().toString(36).substr(2, 9), question: q.question, situation: '', task: '', action: '', result: '' };
                              setStarAnswers(prev => [...prev, newStar]);
                            }}
                            className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Practice Answer
                          </button>
                          <button onClick={() => navigator.clipboard.writeText(q.question)} className="p-1 text-slate-400 hover:text-slate-600">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {starAnswers.length > 0 && (
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">STAR Answer Builder</h4>
                    {starAnswers.map((star) => (
                      <div key={star.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex justify-between items-start">
                          <p className="text-[10px] font-bold text-slate-500">Q: {star.question}</p>
                          <button onClick={() => setStarAnswers(prev => prev.filter(s => s.id !== star.id))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </div>
                        <div className="space-y-2">
                          {['situation', 'task', 'action', 'result'].map((field) => (
                            <div key={field}>
                              <label className="text-[8px] font-bold uppercase text-slate-400 ml-1">{field}</label>
                              <textarea 
                                value={star[field as keyof StarAnswer] as string}
                                onChange={(e) => {
                                  setStarAnswers(prev => prev.map(s => s.id === star.id ? { ...s, [field]: e.target.value } : s));
                                }}
                                className="w-full p-2 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500 min-h-[50px]"
                                placeholder={`Describe the ${field}...`}
                              />
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={() => handlePolishStar(star.id)}
                          disabled={isPolishingStar}
                          className="w-full py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-2"
                        >
                          {isPolishingStar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          AI Polish Answer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'skills':
        return (
          <div className="space-y-6">
            {!skillsGap ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto">
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                </div>
                <p className="text-sm text-slate-500">Analyze the gap between your CV and the job requirements.</p>
                <button 
                  onClick={handleGenerateSkillsGap}
                  disabled={isGeneratingSkillsGap}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 mx-auto transition-all active:scale-95"
                >
                  {isGeneratingSkillsGap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analyse Skills Gap
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Skills Gap Analysis</h3>
                  <button onClick={handleDownloadSkillsGap} className="text-[10px] font-bold text-blue-500 hover:underline">Download Report</button>
                </div>

                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                  <canvas id="skillsRadarChart" className="w-full h-48"></canvas>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/20 text-center">
                    <span className="block text-lg font-bold text-green-600">{skillsGap.strongMatches.length}</span>
                    <span className="text-[8px] uppercase font-bold text-green-500">Matches</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-center">
                    <span className="block text-lg font-bold text-amber-600">{skillsGap.partialMatches.length}</span>
                    <span className="text-[8px] uppercase font-bold text-amber-500">Partial</span>
                  </div>
                  <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-center">
                    <span className="block text-lg font-bold text-red-600">{skillsGap.criticalGaps.length}</span>
                    <span className="text-[8px] uppercase font-bold text-red-500">Gaps</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Critical Gaps</h4>
                    <div className="space-y-2">
                      {skillsGap.criticalGaps.map((gap, i) => (
                        <div key={i} className="p-3 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                          <p className="text-sm font-bold text-red-700 dark:text-red-400">{gap.name}</p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{gap.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Development Plan</h4>
                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-line">
                        {skillsGap.developmentPlan}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Verdict</h4>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed italic">"{skillsGap.overallVerdict}"</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* --- Navigation --- */}
      <nav className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">CV Tailor <span className="text-blue-500">UK</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowGuide(true)}
            className="hidden md:flex items-center gap-2 text-sm font-medium hover:text-blue-500 transition-colors"
          >
            <HelpCircle className="w-4 h-4" /> UK CV Guide
          </button>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden md:block" />
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* --- Main Layout --- */}
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 h-[calc(100vh-64px)] overflow-hidden">
        
        {/* --- Left Panel: Inputs --- */}
        <section className="md:col-span-3 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Personal Details</label>
              <input 
                type="text" 
                name="name"
                value={cvData.name}
                onChange={handleInputChange}
                placeholder="Your Full Name"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Seniority</label>
                <select 
                  name="seniority"
                  value={cvData.seniority}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-sm"
                >
                  <option>Graduate</option>
                  <option>Mid-level</option>
                  <option>Senior</option>
                  <option>Executive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Industry</label>
                <select 
                  name="industry"
                  value={cvData.industry}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-sm"
                >
                  <option>Technology</option>
                  <option>Finance</option>
                  <option>Healthcare</option>
                  <option>Marketing</option>
                  <option>Engineering</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Target Job Title</label>
              <input 
                type="text" 
                name="targetJobTitle"
                value={cvData.targetJobTitle}
                onChange={handleInputChange}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Current CV Text</label>
              <textarea 
                name="currentCV"
                value={cvData.currentCV}
                onChange={handleInputChange}
                placeholder="Paste your current CV here..."
                className="flex-1 w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none min-h-[150px]"
              />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Job Description</label>
              <textarea 
                name="jobDescription"
                value={cvData.jobDescription}
                onChange={handleInputChange}
                placeholder="Paste the target job description here..."
                className="flex-1 w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none min-h-[150px]"
              />
            </div>
            
            <button 
              onClick={handleTailorCV}
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Tailor My CV <Sparkles className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </section>

        {/* --- Middle Panel: CV Output --- */}
        <section className="md:col-span-6 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative">
          {/* Toolbar */}
          <div className="h-12 border-b border-slate-100 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <button onClick={handleCopyToClipboard} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-500" title="Copy to Clipboard"><Clipboard className="w-4 h-4" /></button>
              <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-500 flex items-center gap-1" title="Download PDF">
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                <span className="text-[8px] font-bold">PDF</span>
              </button>
              <button onClick={handleDownloadDocx} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-500 flex items-center gap-1" title="Download .docx">
                <FileText className="w-4 h-4" />
                <span className="text-[8px] font-bold">DOCX</span>
              </button>
              <button onClick={handleDownloadTxt} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-500 flex items-center gap-1" title="Download .txt">
                <Download className="w-4 h-4" />
                <span className="text-[8px] font-bold">TXT</span>
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
              <button onClick={handleSaveVersion} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors text-slate-500" title="Save Version"><History className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span>Word Count: {tailoredCV ? Object.values(tailoredCV).join(' ').split(/\s+/).length : 0}</span>
              <button 
                onClick={() => { setTailoredCV(null); setImprovementTips([]); }}
                className="hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 md:p-12 font-serif custom-scrollbar relative">
            <AnimatePresence mode="wait">
              {!tailoredCV ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                    <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">Your tailored CV will appear here</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-sans max-w-xs mx-auto">Fill in your details and click "Tailor My CV" to generate a professional UK-standard document.</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8 text-slate-800 dark:text-slate-200"
                >
                  {/* Header */}
                  <div className="text-center space-y-2 border-b border-slate-100 dark:border-slate-800 pb-6">
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">{cvData.name || 'Your Name'}</h2>
                    <p className="text-lg text-blue-600 dark:text-blue-400 font-sans font-medium">{cvData.targetJobTitle || 'Target Role'}</p>
                    <p className="text-sm text-slate-500 font-sans">London, UK • +44 7000 000000 • email@example.com • LinkedIn</p>
                  </div>

                  {/* Sections */}
                  {(['personalStatement', 'keySkills', 'experience', 'education', 'additional'] as const).map((key) => (
                    <div key={key} className="group relative">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 font-sans">
                          {key.replace(/([A-Z])/g, ' $1')}
                        </h3>
                        <button 
                          onClick={() => handleRegenerateSection(key)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all text-slate-400 hover:text-blue-500"
                          title="Regenerate this section"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div 
                        contentEditable 
                        suppressContentEditableWarning
                        className="text-base leading-relaxed outline-none focus:ring-1 focus:ring-blue-500/20 rounded p-1 whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: spellCheck(tailoredCV[key]) }}
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {loading && (
              <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                <div className="w-64 space-y-4">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-3/4 mx-auto" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-full" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-5/6 mx-auto" />
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-blue-500 mt-4">Tailoring for {cvData.targetJobTitle || 'your role'}...</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* --- Right Panel: Analysis --- */}
        <section className="md:col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl overflow-x-auto custom-scrollbar">
            {(['match', 'standards', 'tips', 'interview', 'skills', 'versions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-[60px] py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === tab 
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {tab === 'interview' ? 'Interview' : tab === 'skills' ? 'Skills Gap' : tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button 
              onClick={handleFullPackDownload}
              disabled={loading || isGeneratingPdf}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Download Full Pack
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">Includes PDF CV, Interview Pack & Skills Gap Report</p>
          </div>

          {/* Error Banner */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex gap-3 items-start"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</p>
                <button onClick={() => setError(null)} className="text-[10px] font-bold text-red-500 uppercase mt-1 hover:underline">Dismiss</button>
              </div>
            </motion.div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {showEmailBanner && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 border border-slate-700 dark:border-slate-200"
          >
            <Mail className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium">CV downloaded! Want a copy in your inbox?</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSendEmail(true)}
                disabled={isSendingEmail}
                className="px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-full text-xs font-bold transition-colors flex items-center gap-2"
              >
                {isSendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Send now
              </button>
              <button
                onClick={() => setShowEmailBanner(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Modals --- */}
      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h2 className="text-xl font-bold">UK CV Best Practices</h2>
                <button onClick={() => setShowGuide(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-8 overflow-y-auto max-h-[70vh] space-y-6 text-slate-700 dark:text-slate-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Do's</h3>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      <li>Use British English spellings</li>
                      <li>Keep it to 2 pages maximum</li>
                      <li>Quantify your achievements (£, %, time)</li>
                      <li>Use reverse chronological order</li>
                      <li>Include a strong Personal Profile</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /> Don'ts</h3>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      <li>No photos or headshots</li>
                      <li>No Date of Birth or Marital Status</li>
                      <li>No "Objective" sections</li>
                      <li>No first-person "I" in bullets</li>
                      <li>Don't list actual referees</li>
                    </ul>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <h4 className="font-bold text-blue-700 dark:text-blue-400 text-sm mb-1">Pro Tip: The Personal Statement</h4>
                  <p className="text-xs leading-relaxed">Your personal statement should be a 3-5 sentence summary of who you are, what you've achieved, and what you bring to this specific role. Keep it under 100 words.</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h2 className="text-xl font-bold">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Anthropic API Key</label>
                  <div className="relative">
                    <input 
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button 
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">Your API key is stored only in memory and will be cleared when you refresh the page. We never store it on any server.</p>
                </div>
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> Email Delivery Settings
                  </h4>
                  <div className="space-y-3">
                    <input 
                      type="email"
                      value={emailSettings.email}
                      onChange={(e) => setEmailSettings(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Recipient Email"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    />
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Auto-send on download</span>
                        <button 
                          onClick={() => setEmailSettings(prev => ({ ...prev, autoSend: !prev.autoSend }))}
                          className={`w-8 h-4 rounded-full transition-colors relative ${emailSettings.autoSend ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${emailSettings.autoSend ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input 
                        type="text"
                        value={emailSettings.serviceId}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, serviceId: e.target.value }))}
                        placeholder="Service ID"
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px]"
                      />
                      <input 
                        type="text"
                        value={emailSettings.templateId}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, templateId: e.target.value }))}
                        placeholder="Template ID"
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px]"
                      />
                      <input 
                        type="text"
                        value={emailSettings.publicKey}
                        onChange={(e) => setEmailSettings(prev => ({ ...prev, publicKey: e.target.value }))}
                        placeholder="Public Key"
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px]"
                      />
                    </div>
                    <button 
                      onClick={() => handleSendEmail(true)}
                      disabled={isSendingEmail}
                      className="w-full py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"
                    >
                      {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                      Send Test Email
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm transition-all active:scale-95"
                >
                  Save & Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
      `}</style>
    </div>
  );
}
