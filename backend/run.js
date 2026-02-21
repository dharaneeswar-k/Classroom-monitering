const { execSync } = require('child_process');
try {
    const output = execSync('node test_sync.js', { encoding: 'utf-8', stdio: 'pipe' });
    require('fs').writeFileSync('out.txt', output);
} catch (e) {
    require('fs').writeFileSync('err.txt', e.stderr || e.stdout || e.message);
}
