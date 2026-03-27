import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { orchestrate, UserAbortedError } from "./orchestrate";

export default function implementIssueExtension(pi: ExtensionAPI) {
  pi.registerCommand("implement-issue", {
    description: "Prepare an issue implementation worktree and Pi session",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify(
          "Usage: /implement-issue <issue-number> [--yes] [--resume] [--no-worktree] [--no-install] [--plan-only]",
          "info"
        );
        return;
      }

      try {
        const result = await orchestrate(args, ctx.ui);
        // sendUserMessage requires the agent to be idle; commands are always invoked interactively.
        pi.sendUserMessage(result.prompt);
      } catch (err: unknown) {
        if (err instanceof UserAbortedError) {
          ctx.ui.notify("implement-issue cancelled.", "info");
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`implement-issue failed: ${message}`, "error");
      }
    },
  });
}
