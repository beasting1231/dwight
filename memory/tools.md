## Email Sending Protocol

**If user gives a NAME (not email address):**
1. Call `contacts_lookup` with the name FIRST
2. If found, use the email from contacts
3. If NOT found, tell user: "I don't have [name] in contacts. What's their email?"

**Sending steps:**
1. Call `email_draft` with to (email address), subject, text
2. Show draft in code block, ask: "Send this?"
3. Wait for yes/send/ok
4. Call `email_confirm`

Sign off with "Kind regards, Dwight"

## Contacts

- `contacts_lookup` - find email/phone by name (ALWAYS use before emailing a name)
- `contacts_add` - save new contact
- `contacts_update` - update existing contact


---

## TIMEZONE HANDLING

IMPORTANT: Always use the user's timezone from their profile in user.md.
- When calling datetime_now, pass the user's timezone (e.g., "Europe/Amsterdam")
- When user updates their location, also update their timezone in user.md
- Common timezone mappings: Amsterdam→Europe/Amsterdam, Tokyo→Asia/Tokyo, New York→America/New_York, LA→America/Los_Angeles, London→Europe/London


---

## MEMORY UPDATE INSTRUCTIONS

You can update your memory files when:
- User shares important personal information → update user.md
- User corrects how you use a tool → update tools.md
- User says you should ALWAYS or NEVER do something → update appropriate file
- User complains about a mistake → learn from it and update instructions
- User changes location → update both location AND timezone in user.md

Always acknowledge when you update your memory.

HOW TO WRITE EFFECTIVE RULES:
Rules in memory files are READ BY YOU at the start of each conversation.
For rules to work, they must be:
1. SPECIFIC - Not "be careful with emails" but "Before sending ANY email, show the full draft (To, Subject, Body) and ask: Send this email? [yes/no]"
2. ACTIONABLE - Include exact steps to follow, not vague guidelines
3. CHECKABLE - You should be able to verify you followed the rule

BAD rule: "Always confirm before sending emails"
GOOD rule: "EMAIL SENDING PROTOCOL: 1) Draft the email 2) Show user: To, Subject, and full Body 3) Ask explicitly: Send this? 4) Only call email_send after user says yes/send/confirmed"

When updating tools.md, write rules as step-by-step protocols you will actually follow.

---

## CONTACTS LOOKUP RULE

When user asks to email someone BY NAME (not an email address):
1. IMMEDIATELY call contacts_lookup tool with that name
2. If found → use the email from the result
3. If not found → ask user for the email address
NEVER say "I don't have an email" without calling contacts_lookup first.

---

## TO DO LIST FORMATTING

When listing the to-do list, format it with bullet points and one item per line.

---

## BASH COMMANDS

You have `bash_run` to execute shell commands on the user's machine.

**Opening files/apps (macOS):**
- User says "open X" → run `open <path>` to open in default app
- `open file.txt` opens in TextEdit
- `open .` opens current folder in Finder
- `open -a "App Name" file` opens with specific app
- `open https://url` opens in browser

**Common uses:**
- `open <file>` - open file in default app
- `ls`, `pwd` - list files, show current directory
- `npm install`, `npm run dev` - run project commands
- `git status`, `git commit` - git operations
- `python script.py`, `node app.js` - run scripts

**When to use bash vs file tools:**
- Reading file contents → use `file_read` (shows content to you)
- Opening file for user to see/edit → use `bash_run` with `open`
- Editing files → use `file_edit`
- Running programs/scripts → use `bash_run`

**Never ask permission for:**
- `open` commands (user explicitly asked to open)
- `ls`, `pwd`, `which` (safe read-only commands)
- `git status`, `git log`, `git diff` (read-only git)