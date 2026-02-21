import re

files = {
    'faculty_dashboard.html': ('css/faculty.css', 'js/faculty.js'),
    'student_dashboard.html': ('css/student.css', 'js/student.js'),
    'login.html':             ('css/login.css',   'js/login.js'),
}

for fname, (css, js) in files.items():
    with open(fname, 'r', encoding='utf-8') as f:
        html = f.read()

    # Remove internal <style>...</style> block
    html = re.sub(r'\s*<style>[\s\S]*?</style>', '', html)

    # Replace styles.css link with styles.css + page-specific css
    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f'<link rel="stylesheet" href="styles.css">\n    <link rel="stylesheet" href="{css}">'
    )

    # Remove the big inline script block containing the API/JS logic
    html = re.sub(r'\s*<script>\s*(const API_URL|const roleConfig|let token)[\s\S]*?</script>', '', html)

    # Inject the external JS before </body>
    html = html.replace('</body>', f'    <script src="{js}"></script>\n</body>')

    with open(fname, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Done: {fname}')

print('ALL DONE')
