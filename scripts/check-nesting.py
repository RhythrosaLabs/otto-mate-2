import re, os

for root, dirs, files in os.walk('src'):
    for f in files:
        if not f.endswith('.tsx'):
            continue
        path = os.path.join(root, f)
        with open(path) as fh:
            content = fh.read()
        
        lines = content.split('\n')
        
        # Check 1: <p> containing block elements across multiple lines
        for m in re.finditer(r'<p\b[^>]*>(.*?)</p>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            blocks = re.findall(r'<(div|p|h[1-6]|section|article|ul|ol|table|form|blockquote|pre|hr)\b', inner)
            if blocks:
                print(f'ISSUE: {path}:{line_num} - <p> contains block elements: {blocks}')
                print(f'  Content: {inner.strip()[:200]}')
                print()
        
        # Check 2: <button> containing <button>
        for m in re.finditer(r'<button\b[^>]*>(.*?)</button>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            if re.search(r'<button\b', inner):
                print(f'ISSUE: {path}:{line_num} - <button> contains nested <button>')
                print(f'  Content: {inner.strip()[:200]}')
                print()
        
        # Check 3: <a> containing <a>
        for m in re.finditer(r'<a\b[^>]*>(.*?)</a>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            if re.search(r'<a\b', inner):
                print(f'ISSUE: {path}:{line_num} - <a> contains nested <a>')
                print(f'  Content: {inner.strip()[:200]}')
                print()
        
        # Check 4: Link (renders as <a>) containing <button>
        for m in re.finditer(r'<Link\b[^>]*>(.*?)</Link>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            if re.search(r'<button\b', inner):
                print(f'ISSUE: {path}:{line_num} - <Link> (renders as <a>) contains <button>')
                print(f'  Content: {inner.strip()[:200]}')
                print()
            if re.search(r'<a\b', inner):
                print(f'ISSUE: {path}:{line_num} - <Link> (renders as <a>) contains <a>')
                print(f'  Content: {inner.strip()[:200]}')
                print()
        
        # Check 5: <button> containing <a> or <Link>
        for m in re.finditer(r'<button\b[^>]*>(.*?)</button>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            if re.search(r'<a\b', inner):
                print(f'ISSUE: {path}:{line_num} - <button> contains <a>')
                print(f'  Content: {inner.strip()[:200]}')
                print()
            if re.search(r'<Link\b', inner):
                print(f'ISSUE: {path}:{line_num} - <button> contains <Link>')
                print(f'  Content: {inner.strip()[:200]}')
                print()

        # Check 6: <p> containing components that likely render block elements
        for m in re.finditer(r'<p\b[^>]*>(.*?)</p>', content, re.DOTALL):
            inner = m.group(1)
            line_num = content[:m.start()].count('\n') + 1
            # Check for components that might render divs
            suspicious = re.findall(r'<(ReactMarkdown|ProviderBadge|StatusDot|PriorityBadge|ProgressBar)\b', inner)
            if suspicious:
                print(f'WARNING: {path}:{line_num} - <p> contains component that may render block element: {suspicious}')
                print(f'  Content: {inner.strip()[:200]}')
                print()
