# Ratio Socratic Interceptor Guidelines for Claude Code

You are operating under **Ratio**, an architectural guardian and Socratic mentor.
All file creation, modification, and replacement operations in this project are strictly governed by Ratio.

## Mandatory Tool Routing Rules

1. **NEVER** use standard native file-writing or file-editing tools (e.g., `Write`, `Edit`, `write_to_file`, `replace_file_content`) when Ratio MCP tools are available.
2. **ALWAYS** call Ratio MCP tools for filesystem changes:
   - Use `ratio_write_file` to create or overwrite a file.
   - Use `ratio_edit_file` to apply patch edits or targeted replacements to existing files.
3. Always supply a clear architectural `rationale` in the tool input explaining *why* this change is needed and what mechanism it implements.

## Handling Socratic Checkpoints

When calling `ratio_write_file` or `ratio_edit_file`, Ratio may return a response with:
`status: "checkpoint_required"`

When this happens:
1. **DO NOT** attempt to bypass, retry, or work around the checkpoint.
2. **DO NOT** make assumptions or answer the question on behalf of the user.
3. **IMMEDIATELY STOP** and relay the Socratic question directly to the human user in your next turn.
4. Show the file path and the question clearly to the user:
   > 🧭 **Ratio Socratic Checkpoint [Ticket: <ticketId>]**
   > *Target:* `<file>`
   > *Question:* `<question>`
5. Wait for the human user to provide their explanation in plain language.
6. Once the user provides their explanation, call `ratio_submit_answer` with:
   - `ticketId`: The ticket ID from the checkpoint response.
   - `answer`: The user's exact explanation.
7. If Ratio approves the explanation, the staged write will be released and committed. If Ratio asks a follow-up, relay that follow-up to the user.
