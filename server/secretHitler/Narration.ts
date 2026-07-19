// Narration scripts for Secret Hitler events, ported from secreth's ttsService.
import type { SHGameLogEntry, SHGameResult } from "../../shared/secretHitler.js";

export function buildNarrationText(entry: SHGameLogEntry): string | null {
  const pres = entry.presidentName;
  const chan = entry.chancellorName ?? "";
  const target = entry.targetName ?? "";
  const yes = entry.votesYes ?? 0;
  const no = entry.votesNo ?? 0;

  switch (entry.type) {
    case "election-passed":
      return `${pres} and ${chan} have been elected. The vote passed ${yes} to ${no}.`;
    case "election-failed":
      return `The government of ${pres} and ${chan} has been rejected — ${yes} for, ${no} against. The election tracker advances.`;
    case "policy-enacted":
      return entry.policy === "liberal"
        ? `A Liberal policy has been enacted by ${pres} and ${chan}.`
        : `A Fascist policy has been enacted by ${pres} and ${chan}.`;
    case "chaos-policy": {
      const type = entry.policy === "liberal" ? "Liberal" : "Fascist";
      return `Chaos! Three governments have failed. A ${type} policy is enacted from the top of the deck.`;
    }
    case "execution":
      return `President ${pres} has ordered the execution of ${target}. The people watch in silence.`;
    case "investigation":
      return `President ${pres} has investigated the loyalty of ${target}.`;
    case "special-election":
      return `President ${pres} has called a special election. ${target} will serve as the next President.`;
    case "veto-approved":
      return `The agenda has been vetoed. Both ${pres} and ${chan} agreed to discard all policies. The election tracker advances.`;
    default:
      return null;
  }
}

export function buildGameOverNarration(result: SHGameResult): string | null {
  switch (result.condition) {
    case "liberals-policies":
      return "The Liberals have enacted five Liberal policies. Democracy prevails. The Liberals win!";
    case "liberals-hitler-killed":
      return "Hitler has been assassinated! The Liberal forces have triumphed. The Liberals win!";
    case "fascists-policies":
      return "The Fascists have seized power, enacting six Fascist policies. The regime is complete. The Fascists win!";
    case "fascists-hitler-elected":
      return "Hitler has been elected Chancellor. The Fascist conspiracy succeeds. The Fascists win!";
    default:
      return null;
  }
}
