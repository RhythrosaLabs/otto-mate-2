"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  X,
  ArrowRight,
  Circle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Clock,
  Zap,
  BookTemplate,
  Search,
  FileText,
  Code2,
  BarChart3,
  Globe,
  ShieldCheck,
  Rocket,
  Megaphone,
  Microscope,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { naturalLanguageToDAG, validateDAG, NL_PIPELINE_EXAMPLES, type PipelineDAG } from "@/lib/nl-to-dag";

interface PipelineNode {
  id: string;
  label: string;
  prompt?: string;
  status: string;
  x: number;
  y: number;
  depends_on: string[];
}

interface Pipeline {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  created_at: string;
  updated_at: string;
}

// ─── Pipeline Templates ───────────────────────────────────────────────────────

interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: typeof GitBranch;
  iconColor: string;
  nodes: Omit<PipelineNode, "status">[];
}

const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "tpl-content-pipeline",
    name: "Content Creation Pipeline",
    description: "Research a topic, draft a blog post, generate images, then optimize for SEO.",
    category: "content",
    icon: FileText,
    iconColor: "text-pink-400",
    nodes: [
      { id: "n1", label: "Research Topic", prompt: "Research the topic thoroughly using web search. Gather 5-10 key facts, statistics, and expert quotes. Output a structured research brief.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Write Draft", prompt: "Using the research brief, write a 1500-word blog post with engaging intro, clear sections (H2/H3), data-backed arguments, and a strong conclusion with CTA.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n3", label: "Generate Images", prompt: "Create 3 relevant images for the blog post: a hero banner, an infographic-style diagram, and a social media thumbnail. Use DALL-E or Flux.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n4", label: "SEO Optimization", prompt: "Optimize the blog post for SEO: add meta title (60 chars), meta description (155 chars), suggest internal links, ensure keyword density is 1-2%, add FAQ schema.", x: 510, y: 140, depends_on: ["n2", "n3"] },
    ],
  },
  {
    id: "tpl-code-review",
    name: "Code Review & Deploy",
    description: "Analyze code, run tests, security audit, then generate deployment plan.",
    category: "engineering",
    icon: Code2,
    iconColor: "text-green-400",
    nodes: [
      { id: "n1", label: "Static Analysis", prompt: "Run static analysis on the codebase. Check for code smells, dead code, complexity metrics, and lint violations. Report findings with severity.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Security Audit", prompt: "Perform security analysis: check for SQL injection, XSS, CSRF, hardcoded secrets, insecure dependencies (npm audit / pip audit). Rate each finding critical/high/medium/low.", x: 50, y: 220, depends_on: [] },
      { id: "n3", label: "Generate Tests", prompt: "Generate comprehensive unit and integration tests for uncovered code paths. Target 90%+ coverage. Use the project's existing test framework.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n4", label: "Run Test Suite", prompt: "Execute the full test suite including the newly generated tests. Report pass/fail results, coverage percentage, and any flaky tests.", x: 510, y: 60, depends_on: ["n3"] },
      { id: "n5", label: "Deploy Plan", prompt: "Based on all findings, create a deployment checklist: pre-deploy steps, rollback plan, monitoring alerts to set up, and post-deploy verification steps.", x: 510, y: 220, depends_on: ["n2", "n4"] },
    ],
  },
  {
    id: "tpl-market-research",
    name: "Market Research Report",
    description: "Competitive analysis, market sizing, customer survey design, and final report.",
    category: "research",
    icon: BarChart3,
    iconColor: "text-blue-400",
    nodes: [
      { id: "n1", label: "Competitor Deep-Dive", prompt: "Identify the top 8-10 competitors via web search. For each: product features, pricing tiers, funding, team size, unique value prop. Create a comparison matrix.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Market Sizing (TAM/SAM/SOM)", prompt: "Calculate Total Addressable Market, Serviceable Addressable Market, and Serviceable Obtainable Market with bottom-up and top-down approaches. Cite data sources.", x: 50, y: 220, depends_on: [] },
      { id: "n3", label: "SWOT Analysis", prompt: "Using the competitor data, create a detailed SWOT analysis: Strengths, Weaknesses, Opportunities, Threats. Include market trends and regulatory considerations.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n4", label: "Survey Design", prompt: "Design a 15-question customer survey to validate market assumptions. Include NPS, pricing sensitivity, feature priority ranking, and open-ended feedback questions.", x: 280, y: 220, depends_on: ["n2"] },
      { id: "n5", label: "Executive Report", prompt: "Compile all findings into a polished executive report with: market overview, competitive landscape, SWOT, market sizing, recommended positioning strategy, and go-to-market plan.", x: 510, y: 140, depends_on: ["n3", "n4"] },
    ],
  },
  {
    id: "tpl-web-scrape",
    name: "Web Scraping & Analysis",
    description: "Scrape data from websites, clean it, analyze patterns, and generate a report.",
    category: "data",
    icon: Globe,
    iconColor: "text-orange-400",
    nodes: [
      { id: "n1", label: "Scrape Data", prompt: "Navigate to the target URL(s) and extract structured data. Handle pagination, dynamic content, and rate limiting. Save raw data as JSON.", x: 50, y: 140, depends_on: [] },
      { id: "n2", label: "Clean & Transform", prompt: "Clean the scraped data: remove duplicates, fix encoding issues, normalize fields, handle missing values. Output as clean CSV and JSON.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n3", label: "Analyze Patterns", prompt: "Perform statistical analysis on the cleaned data: distribution analysis, trend detection, outlier identification, correlation analysis. Create 3-5 charts.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n4", label: "Generate Report", prompt: "Create a data analysis report with: methodology, key findings, visualizations, actionable insights, and recommendations. Export as HTML dashboard.", x: 510, y: 140, depends_on: ["n2", "n3"] },
    ],
  },
  {
    id: "tpl-security-audit",
    name: "Security Assessment Pipeline",
    description: "Full infrastructure and application security assessment with remediation plan.",
    category: "security",
    icon: ShieldCheck,
    iconColor: "text-red-400",
    nodes: [
      { id: "n1", label: "Dependency Scan", prompt: "Scan all project dependencies for known vulnerabilities (CVEs). Check npm/pip/go modules. List each vuln with CVSS score, affected version, and fix version.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Code Security Review", prompt: "Review source code for OWASP Top 10 vulnerabilities: injection, broken auth, sensitive data exposure, XXE, broken access control, misconfigurations, XSS, etc.", x: 50, y: 220, depends_on: [] },
      { id: "n3", label: "Config Hardening", prompt: "Audit configuration files (env vars, Docker, K8s manifests, nginx, etc.) for security misconfigurations. Check TLS settings, CORS, CSP headers, secret management.", x: 280, y: 140, depends_on: ["n1", "n2"] },
      { id: "n4", label: "Remediation Plan", prompt: "Create a prioritized remediation plan: critical fixes (do now), high (this sprint), medium (next sprint), low (backlog). Include code patches for critical items.", x: 510, y: 140, depends_on: ["n3"] },
    ],
  },
  {
    id: "tpl-product-launch",
    name: "Product Launch Checklist",
    description: "Landing page copy, email sequence, social posts, and press release.",
    category: "marketing",
    icon: Rocket,
    iconColor: "text-violet-400",
    nodes: [
      { id: "n1", label: "Landing Page Copy", prompt: "Write conversion-optimized landing page copy: hero headline + subhead, 3 feature sections with benefits, social proof section, pricing CTA, FAQ section. Include A/B test variants.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Email Sequence", prompt: "Create a 5-email launch sequence: teaser (D-7), early access (D-3), launch day, follow-up (D+1), last chance (D+3). Write subject lines, preview text, and HTML body for each.", x: 50, y: 220, depends_on: [] },
      { id: "n3", label: "Social Media Kit", prompt: "Create launch posts for Twitter/X (thread), LinkedIn (article + post), Instagram (carousel captions). Include hashtags, emoji, and DALL-E image prompts for each platform.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n4", label: "Press Release", prompt: "Write a professional press release: headline, dateline, lead paragraph (who/what/when/where/why), quotes, product details, boilerplate, media contact info.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n5", label: "Launch Checklist", prompt: "Compile a day-by-day launch checklist from D-14 to D+7: pre-launch prep, day-of actions, post-launch follow-up. Include responsible parties and dependencies.", x: 510, y: 140, depends_on: ["n2", "n3", "n4"] },
    ],
  },
  {
    id: "tpl-social-campaign",
    name: "Social Media Campaign",
    description: "Plan, create, and schedule a multi-platform social media campaign.",
    category: "marketing",
    icon: Megaphone,
    iconColor: "text-amber-400",
    nodes: [
      { id: "n1", label: "Audience Research", prompt: "Research target audience demographics, interests, pain points, and platform preferences. Identify 3-5 audience personas with behavior patterns.", x: 50, y: 140, depends_on: [] },
      { id: "n2", label: "Content Calendar", prompt: "Create a 2-week content calendar with platform-specific posts (Twitter, LinkedIn, Instagram, TikTok). Include post type, topic, CTA, and optimal posting time for each.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n3", label: "Create Assets", prompt: "Write all post copy and generate image prompts for visual assets. Create 3 variants per post for A/B testing. Include hashtag sets and video script outlines.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n4", label: "Analytics Plan", prompt: "Define KPIs (engagement rate, click-through, conversions), set up UTM tracking links, create a measurement dashboard template, and define success criteria.", x: 510, y: 140, depends_on: ["n2", "n3"] },
    ],
  },
  {
    id: "tpl-data-etl",
    name: "Data ETL Pipeline",
    description: "Extract data from multiple sources, transform it, load into a target, and validate.",
    category: "data",
    icon: BarChart3,
    iconColor: "text-emerald-400",
    nodes: [
      { id: "n1", label: "Extract Sources", prompt: "Extract data from the specified sources (CSV files, APIs, databases). Document the schema of each source, record counts, and any extraction issues.", x: 50, y: 60, depends_on: [] },
      { id: "n2", label: "Data Profiling", prompt: "Profile each dataset: column types, null rates, unique values, min/max, distribution. Identify data quality issues and document cleaning rules needed.", x: 50, y: 220, depends_on: [] },
      { id: "n3", label: "Transform & Clean", prompt: "Apply transformations: standardize dates, normalize text, handle nulls, join datasets, calculate derived fields, remove duplicates. Output clean unified dataset.", x: 280, y: 140, depends_on: ["n1", "n2"] },
      { id: "n4", label: "Load & Index", prompt: "Load the transformed data into the target format (structured database, data warehouse, or analytics-ready files). Create indexes and materialized views as needed.", x: 510, y: 60, depends_on: ["n3"] },
      { id: "n5", label: "Validation Report", prompt: "Run data validation checks: row counts match, no orphan records, referential integrity, business rule compliance. Generate a quality scorecard and anomaly report.", x: 510, y: 220, depends_on: ["n3"] },
    ],
  },
  {
    id: "tpl-research-paper",
    name: "Research Paper Analysis",
    description: "Find papers, extract key findings, compare methodologies, synthesize a literature review.",
    category: "research",
    icon: Microscope,
    iconColor: "text-cyan-400",
    nodes: [
      { id: "n1", label: "Literature Search", prompt: "Search for 10-15 relevant academic papers on the topic using web search. Collect: title, authors, year, journal, abstract, citation count. Prioritize recent and highly-cited work.", x: 50, y: 140, depends_on: [] },
      { id: "n2", label: "Extract Findings", prompt: "For each paper: summarize key findings (3-5 bullets), methodology used, sample size/data source, limitations, and how it relates to the research question.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n3", label: "Compare Methods", prompt: "Create a methodology comparison matrix: approach, data type, analysis technique, strengths, weaknesses. Identify gaps in current research.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n4", label: "Literature Review", prompt: "Synthesize findings into a structured literature review: introduction, thematic sections, methodology trends, research gaps, and proposed future directions. Follow academic writing standards.", x: 510, y: 140, depends_on: ["n2", "n3"] },
    ],
  },
  {
    id: "tpl-design-system",
    name: "Design System Generator",
    description: "Create a complete design system: tokens, components, documentation, and examples.",
    category: "engineering",
    icon: Palette,
    iconColor: "text-fuchsia-400",
    nodes: [
      { id: "n1", label: "Design Tokens", prompt: "Generate a complete design token set: color palette (primary, secondary, neutral, semantic), typography scale (8 sizes), spacing scale (4-64px), border radii, shadows, and breakpoints. Output as CSS custom properties and Tailwind config.", x: 50, y: 140, depends_on: [] },
      { id: "n2", label: "Component Specs", prompt: "Define component specifications for: Button, Input, Card, Modal, Toast, Badge, Avatar, Dropdown. Include variants, sizes, states (hover, focus, disabled, loading), and accessibility requirements.", x: 280, y: 60, depends_on: ["n1"] },
      { id: "n3", label: "Code Components", prompt: "Implement all specified components as React + Tailwind components with TypeScript. Include proper ARIA attributes, keyboard navigation, and forwardRef support. Use the design tokens.", x: 280, y: 220, depends_on: ["n1"] },
      { id: "n4", label: "Documentation", prompt: "Write comprehensive documentation: getting started guide, component API reference with props tables, usage examples, do's and don'ts, and a Storybook-style component gallery as HTML.", x: 510, y: 140, depends_on: ["n2", "n3"] },
    ],
  },
];

const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All Templates" },
  { id: "content", label: "Content" },
  { id: "engineering", label: "Engineering" },
  { id: "research", label: "Research" },
  { id: "data", label: "Data" },
  { id: "marketing", label: "Marketing" },
  { id: "security", label: "Security" },
];

const NODE_STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; bg: string }> = {
  pending: { icon: Circle, color: "text-gray-400", bg: "border-gray-500/30" },
  running: { icon: Loader2, color: "text-blue-400", bg: "border-blue-500/30" },
  completed: { icon: CheckCircle2, color: "text-green-400", bg: "border-green-500/30" },
  failed: { icon: AlertTriangle, color: "text-red-400", bg: "border-red-500/30" },
  queued: { icon: Clock, color: "text-amber-400", bg: "border-amber-500/30" },
};

export function PipelinesClient() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("all");
  const [templateSearch, setTemplateSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addingNode, setAddingNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({ label: "", prompt: "", depends_on: [] as string[] });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showNLGenerator, setShowNLGenerator] = useState(false);
  const [nlPrompt, setNlPrompt] = useState("");
  const [generatedDAG, setGeneratedDAG] = useState<PipelineDAG | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      const data = await res.json() as { pipelines: Pipeline[] };
      setPipelines(data.pipelines || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

  async function createPipeline() {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      const pipeline = await res.json() as Pipeline;
      setPipelines(prev => [pipeline, ...prev]);
      setActivePipeline(pipeline);
      setIsCreating(false);
      setNewName("");
      setNewDesc("");
    } catch (err) { console.error(err); }
  }

  async function createFromTemplate(template: PipelineTemplate) {
    try {
      // Create pipeline
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, description: template.description }),
      });
      const pipeline = await res.json() as Pipeline;
      // Add template nodes
      const nodes: PipelineNode[] = template.nodes.map(n => ({ ...n, status: "pending" }));
      const res2 = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pipeline.id, nodes }),
      });
      const updated = await res2.json() as Pipeline;
      setPipelines(prev => [updated, ...prev]);
      setActivePipeline(updated);
      setShowTemplates(false);
    } catch (err) { console.error(err); }
  }

  async function addNode() {
    if (!activePipeline || !nodeForm.label.trim()) return;
    const nodeCount = activePipeline.nodes.length;
    const newNode: PipelineNode = {
      id: `node-${Date.now()}`,
      label: nodeForm.label,
      prompt: nodeForm.prompt,
      status: "pending",
      x: 100 + (nodeCount % 4) * 220,
      y: 80 + Math.floor(nodeCount / 4) * 140,
      depends_on: nodeForm.depends_on,
    };
    const nodes = [...activePipeline.nodes, newNode];
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
      setAddingNode(false);
      setNodeForm({ label: "", prompt: "", depends_on: [] });
    } catch (err) { console.error(err); }
  }

  async function removeNode(nodeId: string) {
    if (!activePipeline) return;
    const nodes = activePipeline.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        depends_on: n.depends_on.filter(d => d !== nodeId),
      }));
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) { console.error(err); }
  }

  async function addEdge(fromId: string, toId: string) {
    if (!activePipeline || fromId === toId) return;
    const nodes = activePipeline.nodes.map(n => {
      if (n.id === toId && !n.depends_on.includes(fromId)) {
        return { ...n, depends_on: [...n.depends_on, fromId] };
      }
      return n;
    });
    try {
      const res = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePipeline.id, nodes }),
      });
      const updated = await res.json() as Pipeline;
      setActivePipeline(updated);
      setPipelines(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) { console.error(err); }
    setConnecting(null);
  }

  async function deletePipeline(id: string) {
    if (!confirm("Delete this pipeline?")) return;
    await fetch(`/api/pipelines?id=${id}`, { method: "DELETE" });
    setPipelines(prev => prev.filter(p => p.id !== id));
    if (activePipeline?.id === id) setActivePipeline(null);
  }

  function generateFromNL() {
    if (!nlPrompt.trim()) return;
    const dag = naturalLanguageToDAG(nlPrompt);
    const validation = validateDAG(dag);
    if (!validation.valid) {
      console.warn("DAG validation warnings:", validation.errors);
    }
    setGeneratedDAG(dag);
  }

  async function createFromNLPipeline() {
    if (!generatedDAG) return;
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: generatedDAG.name, description: generatedDAG.description }),
      });
      const pipeline = await res.json() as Pipeline;
      const nodes: PipelineNode[] = generatedDAG.nodes.map(n => ({
        id: n.id,
        label: n.label,
        prompt: n.config.prompt || n.config.connector_action || n.label,
        status: "pending",
        x: n.position.x,
        y: n.position.y,
        depends_on: generatedDAG.edges
          .filter(e => e.target === n.id)
          .map(e => e.source),
      }));
      const res2 = await fetch("/api/pipelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pipeline.id, nodes }),
      });
      const updated = await res2.json() as Pipeline;
      setPipelines(prev => [updated, ...prev]);
      setActivePipeline(updated);
      setShowNLGenerator(false);
      setNlPrompt("");
      setGeneratedDAG(null);
    } catch (err) { console.error(err); }
  }

  async function runPipeline() {
    if (!activePipeline) return;
    // Create tasks for each node in topological order and link dependencies
    const orderedNodes = topologicalSort(activePipeline.nodes);
    const taskMap: Record<string, string> = {};

    for (const node of orderedNodes) {
      try {
        const depends = node.depends_on.map(d => taskMap[d]).filter(Boolean);
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: node.label,
            prompt: node.prompt || node.label,
            model: "auto",
            depends_on: depends[0] || undefined,
          }),
        });
        const task = await res.json() as { id: string };
        taskMap[node.id] = task.id;
      } catch (err) { console.error(err); }
    }

    // Update node statuses
    const nodes = activePipeline.nodes.map(n => ({
      ...n,
      status: "queued",
    }));
    await fetch("/api/pipelines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activePipeline.id, nodes }),
    });

    alert(`Pipeline launched! ${orderedNodes.length} tasks created.`);
    fetchPipelines();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <GitBranch size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-pplx-text">Pipelines</h1>
            <p className="text-xs text-pplx-muted">
              Visual DAG task dependencies · {pipelines.length} pipelines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNLGenerator(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500/10 to-pink-500/10 border border-violet-500/20 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors"
          >
            <Zap size={14} />
            Generate from Description
          </button>
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text text-sm font-medium transition-colors"
          >
            <BookTemplate size={14} />
            Templates
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pplx-accent hover:bg-pplx-accent-hover text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            New Pipeline
          </button>
        </div>
      </div>

      {/* Pipeline list / Canvas */}
      {activePipeline ? (
        <div>
          {/* Pipeline header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivePipeline(null)}
                className="p-2 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text transition-colors"
              >
                ←
              </button>
              <div>
                <h2 className="text-base font-semibold text-pplx-text">{activePipeline.name}</h2>
                <p className="text-xs text-pplx-muted">{activePipeline.nodes.length} nodes</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAddingNode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text text-xs transition-colors"
              >
                <Plus size={12} /> Add Node
              </button>
              {activePipeline.nodes.length > 0 && (
                <button
                  onClick={runPipeline}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs hover:bg-green-500/30 transition-colors"
                >
                  <Play size={12} /> Run Pipeline
                </button>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="relative rounded-xl border border-pplx-border bg-pplx-bg overflow-hidden"
            style={{ height: 500, background: "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 24px 24px" }}
          >
            {/* Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {activePipeline.nodes.flatMap(node =>
                node.depends_on.map(depId => {
                  const from = activePipeline.nodes.find(n => n.id === depId);
                  if (!from) return null;
                  return (
                    <line
                      key={`${depId}-${node.id}`}
                      x1={from.x + 90}
                      y1={from.y + 40}
                      x2={node.x + 90}
                      y2={node.y + 40}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      opacity={0.5}
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })
              )}
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" opacity="0.5" />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {activePipeline.nodes.map(node => {
              const cfg = NODE_STATUS_CONFIG[node.status] || NODE_STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <div
                  key={node.id}
                  className={cn(
                    "absolute rounded-xl border-2 bg-pplx-card p-3 cursor-pointer shadow-lg transition-all hover:shadow-xl group",
                    cfg.bg,
                    connecting === node.id && "ring-2 ring-pplx-accent"
                  )}
                  style={{ left: node.x, top: node.y, width: 180, zIndex: 2 }}
                  onClick={() => {
                    if (connecting && connecting !== node.id) {
                      addEdge(connecting, node.id);
                    } else {
                      setConnecting(connecting === node.id ? null : node.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={cn(cfg.color, node.status === "running" && "animate-spin")} />
                      <span className="text-xs font-semibold text-pplx-text truncate">{node.label}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-pplx-muted hover:text-red-400 transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  {node.prompt && (
                    <p className="text-[10px] text-pplx-muted line-clamp-2 mt-1">{node.prompt}</p>
                  )}
                  {node.depends_on.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <ArrowRight size={8} className="text-pplx-muted" />
                      <span className="text-[9px] text-pplx-muted">
                        {node.depends_on.length} dep{node.depends_on.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {activePipeline.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-pplx-muted">
                <GitBranch size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Add nodes to build your pipeline</p>
                <p className="text-xs mt-1 opacity-70">Click nodes to connect them with dependency edges</p>
              </div>
            )}

            {connecting && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-pplx-accent text-white text-xs px-3 py-1.5 rounded-full z-10">
                Click another node to connect, or click same node to cancel
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Pipeline list */
        <div>
          {pipelines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-pplx-muted">
              <GitBranch size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No pipelines yet</p>
              <p className="text-xs mt-1 opacity-70 mb-6">Start from a template or create from scratch</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {PIPELINE_TEMPLATES.slice(0, 6).map(tpl => {
                  const Icon = tpl.icon;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => createFromTemplate(tpl)}
                      className="rounded-xl border border-pplx-border bg-pplx-card p-4 text-left hover:border-violet-500/30 hover:bg-violet-500/[0.03] transition-all group"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", tpl.iconColor === "text-violet-400" ? "bg-violet-500/15" : "bg-white/[0.06]")}>
                          <Icon size={13} className={tpl.iconColor} />
                        </div>
                        <span className="text-sm font-medium text-pplx-text">{tpl.name}</span>
                      </div>
                      <p className="text-xs text-pplx-muted line-clamp-2">{tpl.description}</p>
                      <p className="text-[10px] text-pplx-muted mt-2 opacity-60">{tpl.nodes.length} nodes</p>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowTemplates(true)} className="mt-4 text-xs text-pplx-accent hover:underline">
                View all {PIPELINE_TEMPLATES.length} templates →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelines.map(pipeline => (
                <div
                  key={pipeline.id}
                  onClick={() => setActivePipeline(pipeline)}
                  className="rounded-xl border border-pplx-border bg-pplx-card p-4 cursor-pointer hover:border-pplx-muted/50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                        <GitBranch size={14} className="text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-pplx-text">{pipeline.name}</p>
                        <p className="text-xs text-pplx-muted">{pipeline.nodes.length} nodes</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePipeline(pipeline.id); }}
                      className="p-1.5 rounded-lg text-pplx-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {pipeline.description && (
                    <p className="text-xs text-pplx-muted mt-2 line-clamp-2">{pipeline.description}</p>
                  )}
                  <p className="text-[10px] text-pplx-muted mt-2">
                    Updated {new Date(pipeline.updated_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Pipeline Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsCreating(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">New Pipeline</h3>
              <button onClick={() => setIsCreating(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Pipeline name"
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
              />
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-2 rounded-xl text-sm bg-pplx-bg border border-pplx-border text-pplx-muted">Cancel</button>
              <button onClick={createPipeline} disabled={!newName.trim()} className="flex-1 py-2 rounded-xl text-sm bg-pplx-accent text-white hover:bg-pplx-accent-hover disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {addingNode && activePipeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAddingNode(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-pplx-text">Add Node</h3>
              <button onClick={() => setAddingNode(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Label</label>
                <input
                  value={nodeForm.label}
                  onChange={e => setNodeForm({ ...nodeForm, label: e.target.value })}
                  placeholder="e.g. Research Phase"
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-pplx-muted font-medium block mb-1.5">Task Prompt</label>
                <textarea
                  value={nodeForm.prompt}
                  onChange={e => setNodeForm({ ...nodeForm, prompt: e.target.value })}
                  placeholder="What this node should do..."
                  rows={3}
                  className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
                />
              </div>
              {activePipeline.nodes.length > 0 && (
                <div>
                  <label className="text-xs text-pplx-muted font-medium block mb-1.5">Dependencies</label>
                  <div className="flex flex-wrap gap-1.5">
                    {activePipeline.nodes.map(n => (
                      <button
                        key={n.id}
                        onClick={() => {
                          const deps = nodeForm.depends_on.includes(n.id)
                            ? nodeForm.depends_on.filter(d => d !== n.id)
                            : [...nodeForm.depends_on, n.id];
                          setNodeForm({ ...nodeForm, depends_on: deps });
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs transition-colors",
                          nodeForm.depends_on.includes(n.id)
                            ? "bg-pplx-accent/20 text-pplx-accent border border-pplx-accent/30"
                            : "bg-pplx-bg border border-pplx-border text-pplx-muted hover:text-pplx-text"
                        )}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setAddingNode(false)} className="flex-1 py-2 rounded-xl text-sm bg-pplx-bg border border-pplx-border text-pplx-muted">Cancel</button>
              <button onClick={addNode} disabled={!nodeForm.label.trim()} className="flex-1 py-2 rounded-xl text-sm bg-pplx-accent text-white hover:bg-pplx-accent-hover disabled:opacity-50">Add Node</button>
            </div>
          </div>
        </div>
      )}

      {/* NL Pipeline Generator Modal */}
      {showNLGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowNLGenerator(false); setGeneratedDAG(null); }} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-pplx-border">
              <div>
                <h3 className="text-base font-semibold text-pplx-text">Generate Pipeline from Description</h3>
                <p className="text-xs text-pplx-muted mt-0.5">Describe your workflow in plain English</p>
              </div>
              <button onClick={() => { setShowNLGenerator(false); setGeneratedDAG(null); }} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <textarea
                value={nlPrompt}
                onChange={e => setNlPrompt(e.target.value)}
                placeholder="e.g. Every morning, check Hacker News top stories, summarize the top 5, and post them to Slack #engineering"
                rows={3}
                className="w-full bg-pplx-bg border border-pplx-border rounded-xl px-3.5 py-2.5 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={generateFromNL}
                  disabled={!nlPrompt.trim()}
                  className="px-4 py-2 rounded-xl bg-pplx-accent text-white text-sm font-medium hover:bg-pplx-accent-hover disabled:opacity-50 transition-colors"
                >
                  Generate Pipeline
                </button>
                <span className="text-xs text-pplx-muted">or try an example:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NL_PIPELINE_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { setNlPrompt(ex.prompt); setGeneratedDAG(null); }}
                    className="px-2.5 py-1 rounded-lg bg-pplx-bg border border-pplx-border text-xs text-pplx-muted hover:text-pplx-text hover:border-pplx-muted/50 transition-colors"
                  >
                    {ex.description}
                  </button>
                ))}
              </div>

              {generatedDAG && (
                <div className="space-y-3 border-t border-pplx-border pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-pplx-text">{generatedDAG.name}</p>
                      <p className="text-xs text-pplx-muted">{generatedDAG.nodes.length} nodes · {generatedDAG.edges.length} connections</p>
                    </div>
                    <button
                      onClick={createFromNLPipeline}
                      className="px-4 py-2 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/30 transition-colors"
                    >
                      Create Pipeline
                    </button>
                  </div>
                  <div className="rounded-xl border border-pplx-border bg-pplx-bg p-3">
                    <div className="flex flex-wrap gap-2">
                      {generatedDAG.nodes.map((node, i) => (
                        <div key={node.id} className="flex items-center gap-1.5">
                          {i > 0 && <ArrowRight size={10} className="text-pplx-muted/40" />}
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-xs border",
                            node.type === "trigger" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            node.type === "connector" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                            node.type === "condition" ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                            node.type === "output" ? "bg-green-500/10 border-green-500/20 text-green-400" :
                            "bg-white/[0.04] border-pplx-border text-pplx-text"
                          )}>
                            {node.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {generatedDAG.trigger && (
                    <p className="text-xs text-pplx-muted">
                      Trigger: {generatedDAG.trigger.type === "schedule" ? `Scheduled (${generatedDAG.trigger.config.cron})` : generatedDAG.trigger.type}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowTemplates(false)} />
          <div className="relative z-10 bg-pplx-card border border-pplx-border rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-pplx-border">
              <div>
                <h3 className="text-base font-semibold text-pplx-text">Pipeline Templates</h3>
                <p className="text-xs text-pplx-muted mt-0.5">{PIPELINE_TEMPLATES.length} pre-built workflows</p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-1.5 rounded-lg text-pplx-muted hover:text-pplx-text">
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-6 py-3 border-b border-pplx-border/50">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-pplx-muted" />
                <input
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full bg-pplx-bg border border-pplx-border rounded-lg pl-8 pr-3 py-2 text-sm text-pplx-text placeholder:text-pplx-muted outline-none focus:border-pplx-accent/50"
                />
              </div>
              <div className="flex items-center gap-1">
                {TEMPLATE_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setTemplateFilter(cat.id)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors",
                      templateFilter === cat.id
                        ? "bg-pplx-accent/15 text-pplx-accent border border-pplx-accent/20"
                        : "text-pplx-muted hover:text-pplx-text"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PIPELINE_TEMPLATES
                  .filter(t => templateFilter === "all" || t.category === templateFilter)
                  .filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.description.toLowerCase().includes(templateSearch.toLowerCase()))
                  .map(tpl => {
                    const Icon = tpl.icon;
                    return (
                      <div
                        key={tpl.id}
                        className="rounded-xl border border-pplx-border bg-pplx-bg p-4 hover:border-violet-500/30 hover:bg-violet-500/[0.02] transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-pink-500/10 flex items-center justify-center">
                              <Icon size={16} className={tpl.iconColor} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-pplx-text">{tpl.name}</p>
                              <p className="text-[10px] text-pplx-muted">{tpl.nodes.length} nodes · {tpl.category}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => createFromTemplate(tpl)}
                            className="px-3 py-1.5 rounded-lg bg-pplx-accent/10 text-pplx-accent text-xs font-medium hover:bg-pplx-accent/20 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            Use
                          </button>
                        </div>
                        <p className="text-xs text-pplx-muted mt-2 line-clamp-2">{tpl.description}</p>
                        <div className="flex items-center gap-1 mt-3">
                          {tpl.nodes.map((n, i) => (
                            <span key={n.id} className="flex items-center gap-1">
                              {i > 0 && <ArrowRight size={8} className="text-pplx-muted/40" />}
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-pplx-muted truncate max-w-[80px]">{n.label}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Topological sort for execution order
function topologicalSort(nodes: PipelineNode[]): PipelineNode[] {
  const sorted: PipelineNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // cycle
    visiting.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    for (const dep of node.depends_on) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(node);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return sorted;
}
