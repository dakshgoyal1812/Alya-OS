// ============================================================
// 🧠 Reflection & Thinking Engine
// Implements multi-step reasoning, self-critique, consensus,
// and Tree of Thoughts execution.
// ============================================================

export class ThinkingEngine {
  constructor(llmInstance) {
    this.llm = llmInstance;
  }

  /**
   * Run the query in Recursive Reflection Mode
   */
  async runReflection(history, prompt, onChunk) {
    if (onChunk) onChunk("⚡ **[Thinking Step 1: Initial Formulation & Search]**\nDrafting primary execution plan...\n");
    
    // Step 1: Initial analysis
    const initialPrompt = `[MODE: INITIAL REASONING] Think step-by-step to formulate the best solution for the query below:
User query: ${prompt}
Write down your draft plan, showing any formulas, logic, or code blocks.`;

    const draft = await this.llm.chat(history, initialPrompt);
    
    if (onChunk) {
      onChunk("\n⚡ **[Thinking Step 2: Self-Critique & Error Checking]**\nEvaluating potential issues, edge cases, and optimizations...\n");
    }

    // Step 2: Critique
    const critiquePrompt = `[MODE: SELF-CRITIQUE] Critically evaluate this draft response:
${draft}
Find any errors, bad assumptions, logic flaws, or bugs. Recommend specific corrections.`;

    const critique = await this.llm.chat(history, critiquePrompt);

    if (onChunk) {
      onChunk("\n⚡ **[Thinking Step 3: Synthesis & Consensus]**\nReconciling critiques to generate optimized output...\n");
    }

    // Step 3: Final Synthesis
    const synthesisPrompt = `[MODE: FINAL SYNTHESIS] Reconcile the initial draft with the self-critique to write the perfect, final response for the user.
Initial draft: ${draft}
Self-critique check: ${critique}
Original request: ${prompt}
Deliver only the polished, final output, without repeating the critique tags.`;

    return await this.llm.chatStream(history, synthesisPrompt, onChunk);
  }

  /**
   * Run the query in Tree of Thoughts Mode (simulates multiple logic branches and picks the best)
   */
  async runTreeOfThoughts(history, prompt, onChunk) {
    if (onChunk) onChunk("🌳 **[Tree of Thoughts: Generating 3 Logic Branches]**\n");

    const branchesPrompt = `Generate exactly 3 diverse, competing hypotheses or approaches to solve the user's request.
Request: ${prompt}
Label them clearly as Branch A, Branch B, and Branch C. Keep each branch concise (max 3 sentences).`;
    
    const branches = await this.llm.chat(history, branchesPrompt);
    if (onChunk) onChunk(`\nGenerated Branches:\n${branches}\n\n🌳 **[Tree of Thoughts: Evaluating branches and selecting consensus]**\n`);

    const selectPrompt = `Act as an expert jury. Compare these three approaches:
${branches}
Which one is mathematically/logically superior? Perform a detailed trade-off and output the final corrected answer using the winning approach.
User request: ${prompt}`;

    return await this.llm.chatStream(history, selectPrompt, onChunk);
  }
}
