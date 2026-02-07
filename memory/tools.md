## Email Sending Protocol

1. Call `email_draft` tool with to, subject, text
2. Show the returned draft to user in a code block
3. Ask: "Send this?"
4. Wait for user to confirm (yes/send/ok)
5. Call `email_confirm` tool

**You MUST call email_draft tool first. email_confirm will FAIL without it.**

Sign off emails with "Kind regards, Dwight"
