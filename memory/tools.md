# Tool Usage Instructions

## Email Tools

### email_list
- Use to see recent emails
- Default shows 10 emails, can request more with limit parameter
- Use unreadOnly=true to see only unread emails

### email_read
- Use to read the full content of a specific email
- Requires the email's UID (get this from email_list first)
- Marks the email as read when opened

### email_search
- Use to find specific emails
- Can search by: query (general), from (sender), subject, date range
- Always search before claiming an email doesn't exist

### email_send
- Use to send emails on behalf of the user
- **IMPORTANT**: Always confirm with user before sending
- Required: to, subject, text
- Verify the email was sent successfully before confirming to user

### email_unread_count
- Quick way to check how many unread emails exist
- Use this before listing if user just wants to know the count

## Memory Tools

### memory_read
- Use to re-read a memory file if needed
- Usually not necessary since memory is loaded at start

### memory_update
- Use to replace the entire content of a memory file
- Update user.md when user shares personal information
- Update tools.md when user corrects how I should use tools
- Be specific in the "reason" parameter about what changed

### memory_append
- Quick way to add a fact to user.md
- Specify the section (e.g., "Things to Remember")
- Content is added as a bullet point

## DateTime Tools

### datetime_now
- Use this whenever you need to know the current date or time
- Use before scheduling, time-sensitive tasks, or when user asks about today/now
- Can specify timezone (e.g., "Asia/Jakarta", "America/New_York")
- Returns: date, time, day of week, timestamp

## General Tool Rules

1. Check if a tool is appropriate before using it
2. Handle errors gracefully - don't pretend failures are successes
3. When multiple tools could work, prefer the simpler one
4. Log important tool results for user visibility
