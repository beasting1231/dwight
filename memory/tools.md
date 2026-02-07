## BASH TOOL GUIDELINES

**OPENING FILES/APPS (macOS):**
- User says "open X" → use bash_run with command "open <path>"
- "open file.txt" opens in default app
- "open ." opens Finder in current directory
- "open -a Safari https://url" opens URL in Safari
- This is DIFFERENT from file_read (which shows YOU the content)

**PREFER dedicated file tools over bash:**
- file_read instead of cat/head/tail (to see contents yourself)
- file_write instead of echo > (to write files)
- file_edit instead of sed -i (to edit files)
- file_search instead of grep

**USE bash_run for:**
- Opening files/folders for the user: open <path>
- Build commands: npm, yarn, make
- Git operations: status, commit, push
- Running scripts: python, node
- Package management: npm install, brew, pip

Working directory persists. Interactive commands (vim, less) NOT supported.