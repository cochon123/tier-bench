export type Category = {
  slug: string;
  name: string;
  short: string;
  prompt: string;
};

export type Model = {
  id: string;
  name: string;
  maker: string;
  mark: string;
  color: string;
  release: string;
  context: string;
  price: string;
  description: string;
  logo?: string;
  inputModalities?: string[];
  outputModalities?: string[];
};

export const categories: Category[] = [
  { slug: "overall", name: "Overall", short: "The big picture", prompt: "Rank the models by your whole experience: capability, reliability, taste, and how often you actually want to use them." },
  { slug: "chatting", name: "Chatting", short: "Conversation", prompt: "Which models are thoughtful, natural, interesting conversation partners?" },
  { slug: "math", name: "Math", short: "Reasoning", prompt: "Rank mathematical reasoning, accuracy, and the usefulness of the explanation." },
  { slug: "code-quality", name: "Code quality", short: "Building", prompt: "Rank correctness, maintainability, judgment, and usefulness on real software work." },
  { slug: "steerability", name: "Steerability", short: "Control", prompt: "How reliably does the model follow your instruction, adopt a style, and change course when corrected?" },
  { slug: "most-value", name: "Most value", short: "Worth it", prompt: "Rank how much practical value each model delivers for its price and access level." },
];

export const models: Model[] = [
  { id: "claude-fable-5", name: "Claude Fable 5", maker: "Anthropic", mark: "A", color: "#e8744f", release: "Aug 18, 2026", context: "256K", price: "$2 / $10", description: "A fast, expressive general model tuned for everyday work and conversation." },
  { id: "claude-mythos-5", name: "Claude Mythos 5", maker: "Anthropic", mark: "A", color: "#e8744f", release: "Aug 14, 2026", context: "256K", price: "Limited access", description: "Anthropic’s limited-access frontier reasoning release." },
  { id: "claude-opus-5", name: "Claude Opus 5", maker: "Anthropic", mark: "A", color: "#e8744f", release: "Aug 11, 2026", context: "256K", price: "$15 / $75", description: "A high-capability model for difficult research, writing, and software tasks." },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", maker: "Anthropic", mark: "A", color: "#e8744f", release: "Aug 8, 2026", context: "256K", price: "$3 / $15", description: "A balanced model for coding and knowledge work." },
  { id: "gpt-5-6-terra", name: "GPT-5.6 Terra", maker: "OpenAI", mark: "◎", color: "#111111", release: "Aug 16, 2026", context: "400K", price: "$1.50 / $8", description: "A grounded general-purpose model with strong tool use and instruction following." },
  { id: "gpt-5-6-luna", name: "GPT-5.6 Luna", maker: "OpenAI", mark: "◎", color: "#111111", release: "Aug 16, 2026", context: "400K", price: "$3 / $18", description: "A creative reasoning model with a strong balance of speed and depth." },
  { id: "gpt-5-6-sol", name: "GPT-5.6 Sol", maker: "OpenAI", mark: "◎", color: "#111111", release: "Aug 16, 2026", context: "400K", price: "$8 / $40", description: "OpenAI’s most capable model for demanding, long-running work." },
  { id: "glm-5-3", name: "GLM 5.3", maker: "Z.ai", mark: "Z", color: "#171717", release: "Aug 12, 2026", context: "200K", price: "$0.80 / $2.80", description: "An efficient multilingual reasoning and coding model." },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", maker: "DeepSeek", mark: "D", color: "#4f6ff0", release: "Aug 13, 2026", context: "164K", price: "$0.70 / $2.50", description: "DeepSeek’s flagship reasoning model for code, math, and research." },
  { id: "mimo-v2-5-pro", name: "MiMo V2.5 Pro", maker: "Xiaomi", mark: "MI", color: "#ff6d1a", release: "Aug 9, 2026", context: "128K", price: "$0.40 / $1.60", description: "A compact, fast multilingual model with broad general capability." },
  { id: "mistral-large", name: "Mistral Large", maker: "Mistral", mark: "M", color: "#f15a24", release: "Aug 2, 2026", context: "128K", price: "$2 / $6", description: "Mistral’s flagship open-weight-adjacent general model." },
  { id: "qwen-3-8-27b", name: "Qwen3.8 27B", maker: "Qwen", mark: "Q", color: "#6857dc", release: "Aug 15, 2026", context: "128K", price: "$0.20 / $0.80", description: "A nimble open model with strong multilingual and coding performance." },
  { id: "qwen-3-8-max", name: "Qwen3.8 Max", maker: "Qwen", mark: "Q", color: "#6857dc", release: "Aug 15, 2026", context: "256K", price: "$1.20 / $5", description: "Qwen’s largest general reasoning release." },
  { id: "muse-glimmer", name: "Muse Glimmer 30B", maker: "Meta", mark: "∞", color: "#0866ff", release: "Aug 6, 2026", context: "128K", price: "$0.18 / $0.60", description: "An open creative model tuned for ideation and natural conversation." },
  { id: "gemini-3-1-pro", name: "Gemini 3.1 Pro", maker: "Google", mark: "G", color: "#4285f4", release: "Aug 4, 2026", context: "1M", price: "$2 / $12", description: "Google’s multimodal flagship for long-context work." },
  { id: "gemini-3-7-flash", name: "Gemini 3.7 Flash", maker: "Google", mark: "G", color: "#4285f4", release: "Aug 17, 2026", context: "1M", price: "$0.35 / $1.50", description: "A fast, inexpensive multimodal model for high-volume work." },
  { id: "kimi-k3", name: "Kimi K3", maker: "Moonshot AI", mark: "K", color: "#111111", release: "Aug 10, 2026", context: "256K", price: "$0.60 / $2.40", description: "A long-context agentic model with strong research and coding skills." },
  { id: "grok-4-6", name: "Grok 4.6", maker: "xAI", mark: "x", color: "#111111", release: "Aug 7, 2026", context: "256K", price: "$3 / $15", description: "xAI’s conversational reasoning model with real-time knowledge in hosted use." },
];

const logoByMaker: Record<string, string> = {
  Anthropic: "/logos/claude-color.png",
  OpenAI: "/logos/openai.svg",
  Google: "/logos/google.svg",
  DeepSeek: "/logos/deepseek.svg",
  Meta: "/logos/meta.svg",
  "xAI": "/logos/x.svg",
  Mistral: "/logos/mistralai.svg",
  Qwen: "/logos/qwen-avatar.jpg",
  "Moonshot AI": "/logos/kimi-avatar.png",
  Xiaomi: "/logos/xiaomi.svg",
  "Z.ai": "/logos/zai.png",
};
models.forEach((model) => { model.logo = logoByMaker[model.maker]; });

export const tierMeta = {
  S: { label: "S", color: "#f26a5b", score: 6 },
  A: { label: "A", color: "#eea15b", score: 5 },
  B: { label: "B", color: "#dbc86a", score: 4 },
  C: { label: "C", color: "#62c99a", score: 3 },
  D: { label: "D", color: "#9a83d1", score: 2 },
  F: { label: "F", color: "#d26fa7", score: 1 },
} as const;

export type Tier = keyof typeof tierMeta;

export function tierForScore(score: number): Tier {
  // Each saved tier maps to an integer score from 6 (S) through 1 (F).
  // Midpoint boundaries guarantee that a one-voter community result renders
  // in exactly the tier that voter selected while means still round naturally.
  return score >= 5.5 ? "S" : score >= 4.5 ? "A" : score >= 3.5 ? "B" : score >= 2.5 ? "C" : score >= 1.5 ? "D" : "F";
}

export function modelById(id: string) { return models.find((model) => model.id === id); }
