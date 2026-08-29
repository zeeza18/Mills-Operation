# How the Fleet Copilot Was Built

A plain English writeup of what the "Ask the copilot" chat actually does, how it was built, and why it was built that way instead of the more common approach.

## What it is

A chat box on its own tab where you can type a question about the mill, like "which stand has the highest bearing temperature?" or "how often does STAND-01 alert per day?" and get a real answer back, in a normal sentence, based on real numbers.

## The question that started this: did we chunk and embed data?

No. That is the honest answer, and it is worth explaining why, because chunking and embedding is what most people picture when they hear "AI chatbot connected to data."

**What chunking and embedding normally means.** Say you have a huge pile of text, hundreds of PDF manuals for example. You cannot hand all of that to an AI at once, it is too much text to fit in one request. So you:

1. Cut the text into small pieces, called chunks
2. Turn each chunk into a list of numbers that captures its meaning, called an embedding
3. Store all those number lists in a special search database
4. When someone asks a question, turn the question into numbers too, and find the chunks whose numbers are the closest match
5. Hand only those few matching chunks to the AI to read

This whole process exists to solve one specific problem: too much data to fit in front of the AI at once. It is commonly called RAG, short for retrieval augmented generation.

**Why none of that applies here.** The mill has 6 roll stands. Each one has 5 sensor readings, an anomaly score, and an alert status. All six stands' current data together is about 10 lines of text. It already fits easily into a single message. There is nothing to search through, because there is nothing large enough to need searching. Chunking 10 lines of numbers and building a search database around them would be like hiring a librarian to help find a book in a room with one shelf.

## What we did instead

Instead of pre chopping data and searching it, the AI was given a small toolbox: six real functions it can call to fetch an exact, live number the moment it needs one. This is usually called tool use, or function calling.

Here is the actual mechanism, step by step:

1. **The real data lives in a table**, specifically a pandas table in the backend's memory, one row per stand per minute, with columns for each sensor, the anomaly score, and whether it is alerting.
2. **You type a question.** The AI reads it and decides which of the six tools, if any, would actually answer it.
3. **The AI asks to call a tool.** It does not run any code itself. It sends a structured request, in effect saying "please run the tool named get_current_reading with stand_id STAND-01."
4. **Our backend code does the real work.** It receives that request and actually filters the pandas table, for example taking the most recent row for that one stand.
5. **The real result goes back to the AI**, as plain data, a number or a small set of numbers.
6. **The AI writes the final sentence**, using only the numbers it was actually handed back. It is explicitly told never to invent a number, a stand name, or a time that did not come from a real tool call.

The AI never touches the table directly. It is like someone dictating "go check STAND-01's most recent row" to a person who actually has the spreadsheet open. That person, the backend code, does the real filtering and reports back the exact number. The AI only ever sees the answer it asked for, never the raw table.

## The six tools

All of them live in `app/fleet_tools.py`. Each one is a small, plain function built on simple pandas filtering, nothing more advanced than that.

| Tool | What makes the AI call it | What it actually does |
|---|---|---|
| `get_current_reading` | "What's STAND-01's vibration right now?" | Filters the table to that one stand, takes the last row |
| `get_all_current_readings` | "Which stand has the highest temperature?" / "Who's alerting?" | Calls the tool above once per stand and bundles the results |
| `get_last_alert` | "When did STAND-04 last alert?" | Finds the most recent stretch of consecutive alert minutes for that stand, returns when it started and ended |
| `get_alert_frequency` | "How often does STAND-01 alert per day?" | Counts how many separate alert stretches happened in a recent window, divides by the number of days |
| `get_recent_trend` | "Which stand is likely to alert soon?" | Compares the average anomaly score over the older half versus the newer half of the last 30 minutes, reports rising, falling, or flat |
| `get_alert_cause` | "What's causing STAND-01's alert?" | Checks how far each of the 5 sensors is from that stand's own normal baseline, reports the single biggest one |

That is the entire toolbox. The AI cannot do anything beyond these six lookups: no writing data, no changing anything, only reading real numbers and reporting them back in plain language.

## Why get_recent_trend exists

Worth calling out on its own, since it came from a real mistake. Early on, asked "which stand is next to alert," the AI just picked whichever stand had the highest current score and presented that as an answer. That is weak reasoning: a score sitting near the alert line but flat, or even falling, is not the same risk as a lower score that is climbing fast. The AI had no tool that could tell direction of travel, only a snapshot, so it answered a forward looking question with backward looking evidence.

The fix was `get_recent_trend`, along with a rule telling the AI plainly that a current score alone is not evidence of what happens next, and that it must check actual direction before answering that kind of question. Tested afterward with the exact same question several times in a row: the AI now correctly picks the stand that is actually rising, not just the one with the biggest number at that instant, and says so with real numbers to back it up.
