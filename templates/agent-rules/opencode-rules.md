# Ratio Interceptor Rules for opencode

All file write and edit operations in this workspace must be performed using Ratio MCP server tools.

## Instructions:
1. Route all writes through `ratio_write_file`.
2. Route all edits through `ratio_edit_file`.
3. When receiving `checkpoint_required`:
   - Halt further tool execution.
   - Ask the user the Socratic question provided in the tool response.
   - Submit user's answer using `ratio_submit_answer`.
