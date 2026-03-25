import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function implementIssueExtension(pi: ExtensionAPI) {
  pi.registerCommand("implement-issue", {
    description: "Prepare an issue implementation worktree and Pi session",
    handler: async (_args, ctx) => {
      ctx.ui.notify("/implement-issue is not implemented yet", "info");
    },
  });
}
