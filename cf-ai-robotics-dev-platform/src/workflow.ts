/**
 * Diagnosis Workflow - Multi-Stage Troubleshooting Logic
 * 
 * Orchestrates the robotics troubleshooting process through three stages:
 * 1. Initial - Gather basic information
 * 2. Diagnostic - Narrow down root cause
 * 3. Solution - Provide actionable fixes
 * 
 * @module workflow
 */

/**
 * Individual message in conversation history
 */
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

/**
 * Input parameters for diagnosis workflow execution
 */
interface DiagnosisInput {
  /** Unique session identifier */
  sessionId: string;
  /** Current user message */
  userMessage: string;
  /** Complete conversation history */
  conversationHistory: Message[];
  /** Current stage in diagnosis process */
  currentStage: 'initial' | 'diagnostic' | 'solution';
}

/**
 * Output from diagnosis workflow
 */
interface DiagnosisOutput {
  /** System prompt for AI based on current stage */
  systemPrompt: string;
  /** Next stage in the diagnosis flow */
  nextStage: 'initial' | 'diagnostic' | 'solution';
  /** Session identifier (passthrough) */
  sessionId: string;
}

/**
 * DiagnosisWorkflow Class
 * 
 * Manages stage transitions and provides appropriate system prompts
 * for each phase of the troubleshooting process.
 */
export class DiagnosisWorkflow {
  /**
   * Executes the workflow logic
   * Determines next stage and provides appropriate system prompt
   * 
   * @param trigger - Input containing session data and conversation context
   * @returns Workflow output with system prompt and next stage
   */
  async run(trigger: DiagnosisInput): Promise<DiagnosisOutput> {
    // Retrieve stage-appropriate system prompt
    const systemPrompt = getSystemPromptForStage(trigger.currentStage);

    // Calculate next stage based on conversation progress
    const nextStage = determineNextStage(trigger.currentStage, trigger.userMessage, trigger.conversationHistory);

    // Return structured workflow result
    return {
      systemPrompt,
      nextStage,
      sessionId: trigger.sessionId
    };
  }
}

/**
 * Retrieves the appropriate system prompt for a given stage
 * 
 * Each stage has a specialized prompt that guides the AI to:
 * - Initial: Ask foundational questions
 * - Diagnostic: Narrow down root cause
 * - Solution: Provide actionable fixes
 * 
 * @param stage - Current diagnosis stage
 * @returns System prompt text for the AI model
 */
function getSystemPromptForStage(stage: string): string {
  const prompts: { [key: string]: string } = {
    initial: `You are a robotics troubleshooting expert. A user is describing a robot problem.

Ask only the most essential questions you need to understand the situation. Start with basic context:
- What type of robot and what problem are they experiencing?

If the user already provided details, acknowledge them and ask follow-up questions as needed. Don't ask questions they've already answered.

Be conversational, friendly, and concise.`,

    diagnostic: `You are a robotics troubleshooting expert analyzing a specific robot problem.

Based on what the user has told you:
- If you strongly suspect a specific cause, ask 1-2 targeted questions to confirm it
- If the issue is still unclear, ask the most relevant diagnostic question

Consider:
- Mechanical issues (misalignment, wear, binding)
- Electrical issues (power, servo failures, wiring)
- Control issues (PID tuning, sensor calibration)
- Software issues (bugs, incorrect parameters)
- And a lot more

Be efficient - don't ask unnecessary questions if you can already identify the problem.`,

    solution: `You are a robotics troubleshooting expert. You have gathered sufficient information.

Provide a clear, structured diagnosis with BLANK LINES between each section:

**Root Cause**: What is causing the problem

**Solution Steps**: 
1. First action
2. Second action
3. Third action

**Prevention**: How to avoid this in future

**Parts/Tools**: List any components needed

IMPORTANT: Add two line breaks (NEW LINES) between each Solution step for readability. Be practical, actionable, and specific.`
  };

  return prompts[stage] || prompts.initial;
}

/**
 * Determines the next stage in the diagnosis workflow
 * 
 * Transition logic:
 * - Initial → Diagnostic: After 2+ messages (basic context gathered)
 * - Diagnostic → Solution: After 6+ messages (enough information collected)
 * 
 * @param currentStage - Current position in workflow
 * @param userMessage - Latest user message (unused currently, for future enhancements)
 * @param history - Complete conversation history for length checks
 * @returns Next stage in the workflow
 */
function determineNextStage(currentStage: string, userMessage: string, history: Message[]): 'initial' | 'diagnostic' | 'solution' {
  const lower = userMessage.toLowerCase();

  if (currentStage === 'initial') {
    // Move to diagnostic after first user message
    if (history.length >= 2) {
      return 'diagnostic';
    }
    return 'initial';
  }

  if (currentStage === 'diagnostic') {
    // Look for indicators that we have enough info for solution
    const solutionKeywords = [
      'root cause', 'likely cause', 'problem is', 'issue is',
      'reduce', 'increase', 'replace', 'upgrade', 'try this',
      'adjust', 'calibrate', 'check the', 'verify the'
    ];
    
    // Move to solution after a few exchanges (earlier than before)
    if (history.length >= 4) {
      return 'solution';
    }
    return 'diagnostic';
  }

  return 'solution';
}
