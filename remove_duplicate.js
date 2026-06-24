const fs = require('fs');
const lines = fs.readFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', 'utf8').split(/\r?\n/);

const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const rememberLastSave = useCallback(async (snapshot) => {')) {
    skip = true;
  }
  
  if (!skip) {
    newLines.push(lines[i]);
  }
  
  if (skip && lines[i].includes('}, []);') && lines[i-1] && lines[i-1].includes('} catch { /* non-critical */ }')) {
    // If we just ended clearLastSavedSnapshot, stop skipping.
    // Wait, the order is:
    // rememberLastSave ... }, []);
    // clearLastSavedSnapshot ... }, []);
    // We want to skip BOTH. Let's just use indices.
  }
}

// better approach: just splice out lines 787 to 801 (0-indexed 787 to 800)
// wait, we checked the lines using view_file:
// 787: 
// 788:   const rememberLastSave = useCallback(async (snapshot) => {
// ...
// 801:   }, []);

lines.splice(787, 14); 

fs.writeFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', lines.join('\n'));
