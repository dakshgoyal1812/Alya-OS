// ============================================================
// 🤖 Multi-Agent Swarm Coordinator
// Manages Planner, Researcher, Coder, Designer, and Security
// agents collaborating on tasks over a shared memory bus.
// ============================================================

export class AgentSwarm {
  constructor(llmInstance) {
    this.llm = llmInstance;
    this.sharedMemoryBus = [];
  }

  /**
   * Orchestrates a multi-agent swarm flow.
   * Streams the agent-to-agent dialogue to the client in real-time.
   */
  async executeSwarm(prompt, onAgentStep) {
    this.sharedMemoryBus = [`[SYSTEM] Shared Memory Bus initialized. Task: "${prompt}"`];

    // Agent 1: PLANNER
    if (onAgentStep) onAgentStep({ agent: "Planner", content: "📋 Analyzing task complexity and designing roadmap..." });
    const planPrompt = `[AGENT: PLANNER] Break down this user request into a step-by-step roadmap: "${prompt}". Focus on logic, constraints, and architecture.`;
    const plan = await this.llm.generate(planPrompt);
    this.sharedMemoryBus.push(`[PLANNER]: ${plan}`);
    if (onAgentStep) onAgentStep({ agent: "Planner", content: plan });

    // Agent 2: RESEARCHER
    if (onAgentStep) onAgentStep({ agent: "Researcher", content: "🔍 Searching knowledge graphs and web sources for relevant patterns..." });
    const researchPrompt = `[AGENT: RESEARCHER] Review the planner's roadmap:
${plan}
Find the best APIs, libraries, or system features to implement this. Provide technical reference points.`;
    const research = await this.llm.generate(researchPrompt);
    this.sharedMemoryBus.push(`[RESEARCHER]: ${research}`);
    if (onAgentStep) onAgentStep({ agent: "Researcher", content: research });

    // Agent 3: CODER
    if (onAgentStep) onAgentStep({ agent: "Coder", content: "💻 Coding implementation details..." });
    const coderPrompt = `[AGENT: CODER] Write the implementation based on Planner's roadmap and Researcher's references:
Roadmap: ${plan}
References: ${research}
Write clear code snippets, settings, or terminal execution instructions.`;
    const codeResult = await this.llm.generate(coderPrompt);
    this.sharedMemoryBus.push(`[CODER]: ${codeResult}`);
    if (onAgentStep) onAgentStep({ agent: "Coder", content: codeResult });

    // Agent 4: DESIGNER
    if (onAgentStep) onAgentStep({ agent: "Designer", content: "🎨 Polishing layout, styling, and visual aesthetics..." });
    const designerPrompt = `[AGENT: DESIGNER] Enhance the user experience and styling elements of the code output:
${codeResult}
Make it look modern, premium, and clean. Provide any CSS adjustments.`;
    const designResult = await this.llm.generate(designerPrompt);
    this.sharedMemoryBus.push(`[DESIGNER]: ${designResult}`);
    if (onAgentStep) onAgentStep({ agent: "Designer", content: designResult });

    // Agent 5: SECURITY
    if (onAgentStep) onAgentStep({ agent: "Security", content: "🛡️ Running vulnerability analysis and code audit..." });
    const securityPrompt = `[AGENT: SECURITY] Audit the following combined code and design files:
Coder output: ${codeResult}
Designer output: ${designResult}
Identify security vulnerabilities, unhandled errors, or risky actions. Recommend safe defaults.`;
    const securityResult = await this.llm.generate(securityPrompt);
    this.sharedMemoryBus.push(`[SECURITY]: ${securityResult}`);
    if (onAgentStep) onAgentStep({ agent: "Security", content: securityResult });

    // Agent 6: AUTOMATION AGENT
    if (onAgentStep) onAgentStep({ agent: "Automation", content: "⚙️ Assessing workflow triggers and background scheduler chains..." });
    const automationPrompt = `[AGENT: AUTOMATION] Check if background rules, event hooks, or API listeners are needed to automate this solution. If so, write down the trigger rules.`;
    const automationResult = await this.llm.generate(automationPrompt);
    this.sharedMemoryBus.push(`[AUTOMATION]: ${automationResult}`);
    if (onAgentStep) onAgentStep({ agent: "Automation", content: automationResult });

    // Agent 7: SOCIAL MEDIA AGENT
    if (onAgentStep) onAgentStep({ agent: "Social Media", content: "📱 Crafting viral hook ideas and captions for content distribution..." });
    const socialPrompt = `[AGENT: SOCIAL MEDIA] Draft highly engaging marketing headers, callouts, or elevator pitches for this solution to maximize outreach.`;
    const socialResult = await this.llm.generate(socialPrompt);
    this.sharedMemoryBus.push(`[SOCIAL MEDIA]: ${socialResult}`);
    if (onAgentStep) onAgentStep({ agent: "Social Media", content: socialResult });

    // Agent 8: VOICE AGENT
    if (onAgentStep) onAgentStep({ agent: "Voice Assistant", content: "🎙️ Converting final response guidelines to clear, verbal conversational summaries..." });
    const voicePrompt = `[AGENT: VOICE] Optimize the final response voice settings, recommending how a speech assistant should pronounce terms or read sections.`;
    const voiceResult = await this.llm.generate(voicePrompt);
    this.sharedMemoryBus.push(`[VOICE]: ${voiceResult}`);
    if (onAgentStep) onAgentStep({ agent: "Voice Assistant", content: voiceResult });

    // Swarm Consensus Finalizer
    if (onAgentStep) onAgentStep({ agent: "Consensus", content: "🤝 Harmonizing output into final response..." });
    const finalPrompt = `[SWARM CONSENSUS] Review the collaborative history:
${this.sharedMemoryBus.join("\n\n")}
Synthesize this into a single, cohesive, perfectly formatted final guide for the user request: "${prompt}".`;
    
    return this.llm.generate(finalPrompt);
  }
}
