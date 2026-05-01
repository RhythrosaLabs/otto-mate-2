import os
import re

files_with_return_type = [
    'src/app/computer/documents/page.tsx',
    'src/app/computer/files/page.tsx',
    'src/app/computer/skills/page.tsx',
    'src/app/computer/connectors/page.tsx',
    'src/app/computer/tasks/page.tsx',
    'src/app/computer/tasks/[taskId]/page.tsx',
    'src/app/computer/documents/[id]/page.tsx',
]

for f in files_with_return_type:
    if not os.path.exists(f):
        print(f"NOT FOUND: {f}")
        continue
    c = open(f).read()
    if 'ReturnType<typeof' not in c:
        continue
    # Replace ReturnType<typeof fn> -> Awaited<ReturnType<typeof fn>>
    # Pattern: ReturnType<typeof fnName> (with closing >)
    new_c = re.sub(r'ReturnType<typeof (\w+)>', r'Awaited<ReturnType<typeof \1>>', c)
    if new_c != c:
        open(f, 'w').write(new_c)
        print(f"Fixed {f}")

# Fix documents/page.tsx - also needs to be async function
docs_page = 'src/app/computer/documents/page.tsx'
if os.path.exists(docs_page):
    c = open(docs_page).read()
    if 'export default function DocumentsPage()' in c:
        c = c.replace('export default function DocumentsPage()', 'export default async function DocumentsPage()')
        open(docs_page, 'w').write(c)
        print(f"Made DocumentsPage async")

print("Done")
